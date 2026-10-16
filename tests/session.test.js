import test from "node:test";
import assert from "node:assert/strict";
import { neonConfig } from "@neondatabase/serverless";
import { hashPassword, login, session, logout } from "../server/auth.js";

test("server session requires a real stored token, validates CSRF, and is revoked on logout", async () => {
  const keys = [
    "DATABASE_URL",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
    "APP_ORIGIN",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const oldFetch = neonConfig.fetchFunction;
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@local-test.neon.tech/test",
    ADMIN_USERNAME: "noir",
    ADMIN_PASSWORD_HASH: hashPassword("test-password-very-long"),
    ADMIN_SESSION_SECRET: "s".repeat(48),
    APP_ORIGIN: "https://noir.example",
  });
  let stored = null;
  const makeResult = (fields, rows) => ({
    fields: fields.map((name) => ({
      name,
      dataTypeID: name === "hits" ? 23 : 25,
    })),
    rows,
    rowCount: rows.length,
    command: "SELECT",
  });
  neonConfig.fetchFunction = async (url, options) => {
    const { query, params } = JSON.parse(options.body);
    if (query.includes("INSERT INTO noir_rate_limits"))
      return Response.json(makeResult(["hits"], [[1]]));
    if (query.includes("INSERT INTO noir_sessions")) {
      stored = { id: params[0], username: params[1], csrf: params[2] };
      return Response.json(makeResult([], []));
    }
    if (query.includes("SELECT username, csrf"))
      return Response.json(
        stored && stored.id === params[0]
          ? makeResult(["username", "csrf"], [[stored.username, stored.csrf]])
          : makeResult(["username", "csrf"], []),
      );
    if (query.includes("DELETE FROM noir_sessions")) {
      stored = null;
      return Response.json(makeResult([], []));
    }
    throw new Error("Unexpected test query");
  };
  try {
    const current = await login(
      { headers: {}, socket: { remoteAddress: "127.0.0.1" } },
      "noir",
      "test-password-very-long",
    );
    assert.notEqual(
      stored.id,
      current.token,
      "database stores only the token HMAC",
    );
    const req = {
      headers: {
        cookie: `noir_session=${current.token}`,
        origin: "https://noir.example",
        "x-csrf-token": current.csrf,
      },
    };
    assert.equal((await session(req, true)).username, "noir");
    await assert.rejects(
      session({ headers: { ...req.headers, "x-csrf-token": "forged" } }, true),
      (e) => e.status === 403,
    );
    await assert.rejects(
      session({ headers: { cookie: `noir_session=${"x".repeat(43)}` } }),
      (e) => e.status === 401,
    );
    await logout(req);
    await assert.rejects(session(req), (e) => e.status === 401);
  } finally {
    neonConfig.fetchFunction = oldFetch;
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
