import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  sessionCookie,
  authConfigured,
  safeEqual,
} from "../server/auth.js";
import { sameOrigin, filmInput, body } from "../server/http.js";
import { handler } from "../server/handler.js";

function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(value) {
      this.data = JSON.parse(value);
    },
  };
}

test("scrypt verifies a password and rejects changes", () => {
  const hash = hashPassword("a-long-private-password");
  assert.match(hash, /^scrypt:[a-f\d]{32}:[a-f\d]{128}$/);
  assert.equal(verifyPassword("a-long-private-password", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
  assert.equal(safeEqual("token", "token-long"), false);
});

test("production cookie is HttpOnly, Secure, Strict and expires", () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const cookie = sessionCookie("test");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(sessionCookie("", true), /Max-Age=0/);
  if (old === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = old;
});

test("cross-origin mutations are refused even with a plausible host header", () => {
  const old = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://noir.example";
  assert.throws(
    () =>
      sameOrigin({
        headers: { origin: "https://attacker.example", host: "noir.example" },
      }),
    (e) => e.status === 403,
  );
  assert.doesNotThrow(() =>
    sameOrigin({
      headers: {
        origin: "https://noir.example",
        "sec-fetch-site": "same-origin",
      },
    }),
  );
  if (old === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = old;
});

test("film validation rejects executable URLs, impossible ratings and malformed trailers", () => {
  const base = {
    title: "Interstellar",
    year: 2014,
    genre: "Elmi fantastika",
    poster: "https://image.tmdb.org/poster.jpg",
    rating: 8.7,
  };
  assert.equal(filmInput(base).ratingSource, "Redaktor");
  assert.equal(
    filmInput({ ...base, ratingSource: "TMDB" }).ratingSource,
    "TMDB",
  );
  assert.throws(() => filmInput({ ...base, poster: "javascript:alert(1)" }));
  assert.throws(() => filmInput({ ...base, rating: 11 }));
  assert.throws(() => filmInput({ ...base, year: 1000 }));
  assert.throws(() => filmInput({ ...base, trailer: "bad?x=1" }));
  assert.throws(() => filmInput({ ...base, poster: "//evil.example/x.jpg" }));
});

test("oversized and non-JSON bodies are refused before handling mutations", async () => {
  await assert.rejects(
    body({ headers: { "content-type": "text/plain" }, body: "x" }),
    (e) => e.status === 415,
  );
  await assert.rejects(
    body({
      headers: { "content-type": "application/json" },
      body: { command: "a".repeat(40_000) },
    }),
    (e) => e.status === 413,
  );
});

test("missing credentials fail closed and status never exposes secrets", async () => {
  const names = [
    "DATABASE_URL",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
    "TMDB_READ_ACCESS_TOKEN",
    "GEMINI_API_KEY",
  ];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  names.forEach((k) => delete process.env[k]);
  try {
    assert.equal(authConfigured(), false);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const res = response();
      await handler({ url: "/api/admin/films", method, headers: {} }, res);
      assert.equal(res.statusCode, 503);
      assert.match(res.data.message, /server/);
    }
    const res = response();
    await handler({ url: "/api/status", method: "GET", headers: {} }, res);
    assert.equal(res.data.database, false);
    assert.equal(res.data.auth, false);
    assert.equal(res.data.ai, false);
    assert.equal(
      JSON.stringify(res.data).includes("ADMIN_SESSION_SECRET"),
      false,
    );
    assert.equal(res.headers["Cache-Control"], "no-store");
  } finally {
    for (const k of names) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
