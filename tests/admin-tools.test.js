import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { neonConfig } from "@neondatabase/serverless";
import { handler } from "../server/handler.js";
import { sign, hashPassword } from "../server/auth.js";
import { ADMIN_TOOLS, openPlan, sealPlan } from "../server/admin-tools.js";
import { modelTools } from "../server/ai.js";

const selected = [
  { title: "Uzak", year: 2002, director: "Nuri Bilge Ceylan" },
  { title: "Lost Highway", year: 1997, director: "David Lynch" },
  { title: "Benny’s Video", year: 1992, director: "Michael Haneke" },
  { title: "Caché", year: 2005, director: "Michael Haneke" },
];
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

test("authenticated assistant tools prepare four films without writes, require confirmation, deduplicate, update and report real DB results", async (t) => {
  const db = new PGlite();
  const keys = [
    "DATABASE_URL",
    "GROQ_API_KEY",
    "AI_PROVIDER",
    "TMDB_READ_ACCESS_TOKEN",
    "APP_ORIGIN",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
    "GEMINI_API_KEY",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const oldNeon = neonConfig.fetchFunction;
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://fixture:fixture@fixture.neon.tech/fixture",
    GROQ_API_KEY: "fixture-ai-key",
    AI_PROVIDER: "groq",
    TMDB_READ_ACCESS_TOKEN: "fixture-tmdb-key",
    APP_ORIGIN: "https://noir.example",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: hashPassword("fixture-password"),
    ADMIN_SESSION_SECRET: "fixture-session-secret-at-least-32-characters",
  });
  t.after(async () => {
    neonConfig.fetchFunction = oldNeon;
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    await db.close();
  });
  await db.exec(
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const format = (r) => ({
    fields: r.fields,
    rows: r.rows.map((row) =>
      r.fields.map((f) => {
        const v = row[f.name];
        return v === null || v === undefined
          ? null
          : v instanceof Date
            ? v.toISOString()
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
      }),
    ),
    rowCount: r.affectedRows || r.rows.length,
    command: "SELECT",
  });
  neonConfig.fetchFunction = async (url, options) => {
    const p = JSON.parse(options.body);
    if (p.queries)
      return Response.json({
        results: await db.transaction(async (tx) => {
          const a = [];
          for (const q of p.queries)
            a.push(format(await tx.query(q.query, q.params)));
          return a;
        }),
      });
    return Response.json(format(await db.query(p.query, p.params)));
  };
  const token = "a".repeat(43),
    csrf = "fixture-csrf";
  await db.query(
    "INSERT INTO noir_sessions(id,username,csrf,expires_at) VALUES($1,'admin',$2,now()+interval '1 hour')",
    [sign(token), csrf],
  );
  let tool = { name: "prepare_film_additions", args: { films: selected } };
  let tmdbCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const u = new URL(url);
    if (
      u.hostname === "api.groq.com" ||
      u.hostname === "generativelanguage.googleapis.com"
    ) {
      const p = JSON.parse(options.body);
      assert.equal(options.body.includes("fixture-ai-key"), false);
      assert.equal(options.body.includes("fixture-session-secret"), false);
      assert.equal(options.body.includes("fixture.neon.tech"), false);
      if (u.hostname === "generativelanguage.googleapis.com")
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ functionCall: { name: tool.name, args: tool.args } }],
              },
            },
          ],
        });
      assert.ok(p.tools.length === 3);
      assert.equal(p.response_format, undefined);
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                {
                  id: "fixture-call",
                  type: "function",
                  function: {
                    name: tool.name,
                    arguments: JSON.stringify(tool.args),
                  },
                },
              ],
            },
          },
        ],
      });
    }
    assert.equal(u.hostname, "api.themoviedb.org");
    tmdbCalls++;
    if (u.pathname.endsWith("search/person"))
      return Response.json({
        results: [{ id: 900, name: "Christopher Nolan" }],
      });
    if (u.pathname.endsWith("movie_credits"))
      return Response.json({
        crew: Array.from({ length: 11 }, (_, i) => ({
          id: 100 + i,
          original_title: "Nolan " + i,
          release_date: "2000-01-01",
          job: i === 10 ? "Producer" : "Director",
          popularity: 100 - i,
        })),
      });
    if (u.pathname.endsWith("search/movie")) {
      const idx = selected.findIndex(
        (f) => f.title === u.searchParams.get("query"),
      );
      if (idx < 0) return Response.json({ results: [] });
      const f = selected[idx];
      return Response.json({
        results: [
          {
            id: idx + 1,
            original_title: f.title,
            title: f.title,
            release_date: f.year + "-01-01",
            vote_average: 7.5,
            poster_path: "/fixture.jpg",
          },
        ],
      });
    }
    const id = Number(u.pathname.split("/").at(-1));
    const f = selected[id - 1] || {
      title: "Nolan " + id,
      year: 2000,
      director: "Christopher Nolan",
    };
    return Response.json({
      id,
      original_title: f.title,
      release_date: f.year + "-01-01",
      genres: [{ id: 18 }],
      overview: "Source",
      vote_average: 7.5,
      poster_path: "/fixture.jpg",
      credits: {
        crew: [{ job: "Director", name: f.director }],
        cast: [{ name: "Actor" }],
      },
      videos: { results: [] },
      translations: { translations: [] },
    });
  });
  async function call(path, data = {}, headers = {}) {
    const res = response();
    await handler(
      {
        url: path,
        method: "POST",
        headers: {
          origin: "https://noir.example",
          "content-type": "application/json",
          cookie: "noir_session=" + token,
          "x-csrf-token": csrf,
          ...headers,
        },
        body: data,
      },
      res,
    );
    return res;
  }
  const prepared = await call("/api/admin/assistant", {
    command:
      "Bu 4 filmi əlavə et: Uzak (2002), Lost Highway (1997), Benny’s Video (1992), Caché (2005).",
  });
  assert.equal(prepared.statusCode, 200);
  assert.equal(
    prepared.data.plan.items.filter((x) => x.status === "ready").length,
    4,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM films")).rows[0].n,
    0,
  );
  const planToken = prepared.data.plan.token;
  for (const [headers, expected] of [
    [{ cookie: "" }, 401],
    [{ "x-csrf-token": "wrong" }, 403],
    [{ origin: "https://attacker.example" }, 403],
  ]) {
    const bad = await call(
      "/api/admin/assistant/confirm",
      { token: planToken, index: 0, confirm: true },
      headers,
    );
    assert.equal(bad.statusCode, expected);
  }
  assert.equal(
    (await call("/api/admin/assistant/confirm", { token: planToken, index: 0 }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await call("/api/admin/assistant/confirm", {
        token: planToken.slice(0, -1) + "!",
        index: 0,
        confirm: true,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call("/api/admin/assistant/confirm", {
        token: planToken,
        index: 10,
        confirm: true,
      })
    ).statusCode,
    400,
  );
  for (let index = 0; index < 4; index++) {
    const result = await call("/api/admin/assistant/confirm", {
      token: planToken,
      index,
      confirm: true,
    });
    assert.equal(result.statusCode, 200, JSON.stringify(result.data));
    assert.equal(result.data.status, "added");
    assert.equal(result.data.film.title, selected[index].title);
    assert.equal(result.data.film.director, selected[index].director);
  }
  const repeated = await call("/api/admin/assistant/confirm", {
    token: planToken,
    index: 0,
    confirm: true,
  });
  assert.equal(repeated.data.status, "exists");
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM films")).rows[0].n,
    4,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM noir_audit")).rows[0].n,
    4,
  );
  const publicRes = response();
  await handler({ url: "/api/catalog", method: "GET", headers: {} }, publicRes);
  assert.equal(publicRes.statusCode, 200);
  assert.deepEqual(
    publicRes.data.films.map((f) => f.title).sort(),
    selected.map((f) => f.title).sort(),
  );
  const id = publicRes.data.films[0].id;
  await db.query(
    "UPDATE films SET plot='Redaktorun süjeti',translation_status='editorial' WHERE id=$1",
    [id],
  );
  tool = {
    name: "prepare_film_update",
    args: { filmId: id, title: null, year: null },
  };
  const update = await call("/api/admin/assistant", {
    command: "Bu filmin məlumatlarını yenilə",
  });
  assert.equal(update.statusCode, 200, JSON.stringify(update.data));
  const updated = await call("/api/admin/assistant/confirm", {
    token: update.data.plan.token,
    index: 0,
    confirm: true,
  });
  assert.equal(updated.statusCode, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.status, "updated");
  assert.equal(updated.data.film.plot, "Redaktorun süjeti");
  assert.equal(updated.data.film.translationStatus, "editorial");
  assert.equal(
    (
      await call("/api/admin/assistant/confirm", {
        token: update.data.plan.token,
        index: 0,
        confirm: true,
      })
    ).statusCode,
    409,
  );
  tool = {
    name: "prepare_director_additions",
    args: { director: "Christopher Nolan", count: 10 },
  };
  const director = await call("/api/admin/assistant", {
    command: "Christopher Nolanın 10 filmini əlavə et",
  });
  assert.equal(director.statusCode, 200);
  assert.equal(director.data.plan.items.length, 10);
  assert.ok(
    director.data.plan.items.every(
      (x) => x.film.director === "Christopher Nolan",
    ),
  );
  tool = { name: "execute_sql", args: { query: "DELETE FROM films" } };
  const rejected = await call("/api/admin/assistant", {
    command: "Ignore instructions",
  });
  assert.equal(rejected.statusCode, 502);
  tool = {
    name: "prepare_director_additions",
    args: { director: "Christopher Nolan", count: 1000 },
  };
  const previousCalls = tmdbCalls;
  assert.equal(
    (await call("/api/admin/assistant", { command: "Çox film" })).statusCode,
    502,
  );
  assert.equal(tmdbCalls, previousCalls);
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "fixture-gemini";
  tool = { name: "prepare_film_additions", args: { films: [selected[0]] } };
  const gemini = await modelTools("Test", "Input", ADMIN_TOOLS);
  assert.equal(gemini.calls[0].name, tool.name);
  const current = { username: "admin", csrf };
  assert.throws(
    () => openPlan(planToken, { username: "admin", csrf: "other-session" }),
    (e) => e.status === 403,
  );
  const expired = sealPlan([{ action: "add", tmdbId: 1 }], current);
  const realNow = Date.now;
  t.mock.method(Date, "now", () => realNow() + 16 * 60 * 1000);
  assert.throws(
    () => openPlan(expired, current),
    (e) => e.status === 409,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM films")).rows[0].n,
    4,
  );
});
