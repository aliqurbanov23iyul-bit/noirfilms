import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import noirAPI from "../api/index.js";
import { request } from "../src/api.js";

function response() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      this.data = JSON.parse(value);
    },
  };
}

test("Vercel uses an explicit API rewrite and the deployed function exists", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(config.rewrites, [
    { source: "/api/:path*", destination: "/api?__noir_route=:path*" },
  ]);
  assert.ok(config.functions["api/index.js"]);
  assert.match(
    await readFile(new URL("../api/index.js", import.meta.url), "utf8"),
    /export default/,
  );
});

test("API entry supports original URLs, rewritten query strings and Vercel parsed queries", async () => {
  for (const req of [
    { url: "/api/status" },
    { url: "/api?__noir_route=status" },
    { url: "/api/index", query: { __noir_route: "status" } },
  ]) {
    const res = response();
    await noirAPI({ method: "GET", headers: {}, ...req }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(typeof res.data.database, "boolean");
  }
});

test("nested admin auth URLs reach the handler instead of a platform HTML 404", async (t) => {
  const keys = [
    "DATABASE_URL",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
    "APP_ORIGIN",
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://fixture:fixture@fixture.neon.tech/test",
    ADMIN_USERNAME: "fixture",
    ADMIN_PASSWORD_HASH: `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`,
    ADMIN_SESSION_SECRET: "s".repeat(48),
    APP_ORIGIN: "https://noir.example",
  });
  t.after(() => {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  });
  for (const req of [
    { url: "/api/auth/session" },
    { url: "/api?__noir_route=auth%2Fsession" },
    { url: "/api/index", query: { __noir_route: "auth/session" } },
  ]) {
    const res = response();
    await noirAPI({ method: "GET", headers: {}, ...req }, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.data.message, /Admin/);
    assert.equal(
      res.headers["Content-Type"],
      "application/json; charset=utf-8",
    );
  }
  const res = response();
  await noirAPI(
    {
      url: "/api?__noir_route=auth%2Flogin",
      method: "POST",
      headers: {
        origin: "https://noir.example",
        "content-type": "application/json",
      },
      body: { username: "fixture", password: "" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("malformed rewrite targets fail with JSON without dispatching a different route", async () => {
  for (const route of [
    "../status",
    "auth/session?x=1",
    "https://other.example",
    ["status"],
  ]) {
    const res = response();
    await noirAPI(
      { url: "/api", query: { __noir_route: route }, headers: {} },
      res,
    );
    assert.equal(res.statusCode, 404);
  }
});

test("client distinguishes an API routing 404 from other invalid server responses", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Not found</html>", { status: 404 }),
  );
  await assert.rejects(request("/api/auth/login"), /API yönləndirməsi/);
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Unavailable", { status: 502 }),
  );
  await assert.rejects(request("/api/auth/login"), /gözlənilən cavab/);
});
