import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { neonConfig } from "@neondatabase/serverless";
import * as repo from "../server/repository.js";
import { filmInput } from "../server/http.js";
import { rateLimit } from "../server/db.js";
import { startImport, importStep, importStatus } from "../server/importer.js";

test("PostgreSQL migration, CRUD, shelves, rate limits and resumable TOP 500 import", async () => {
  const db = new PGlite();
  const oldURL = process.env.DATABASE_URL,
    oldToken = process.env.TMDB_READ_ACCESS_TOKEN,
    oldAI = process.env.GEMINI_API_KEY;
  const oldNeonFetch = neonConfig.fetchFunction,
    oldFetch = globalThis.fetch;
  process.env.DATABASE_URL = "postgresql://test:test@test.neon.tech/test";
  process.env.TMDB_READ_ACCESS_TOKEN = "test-fixture-only";
  delete process.env.GEMINI_API_KEY;
  const schema = await readFile(
    new URL("../server/schema.sql", import.meta.url),
    "utf8",
  );
  function format(result) {
    return {
      fields: result.fields,
      rows: result.rows.map((row) =>
        result.fields.map((f) => {
          const value = row[f.name];
          if (value === null || value === undefined) return null;
          if (value instanceof Date) return value.toISOString();
          if (typeof value === "object") return JSON.stringify(value);
          return String(value);
        }),
      ),
      rowCount: result.affectedRows || result.rows.length,
      command: "SELECT",
    };
  }
  neonConfig.fetchFunction = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.queries) {
      const results = await db.transaction(async (tx) => {
        const results = [];
        for (const q of payload.queries)
          results.push(format(await tx.query(q.query, q.params)));
        return results;
      });
      return Response.json({ results });
    }
    return Response.json(format(await db.query(payload.query, payload.params)));
  };
  let aiQuota = false;
  globalThis.fetch = async (url) => {
    const path = new URL(url);
    if (path.hostname === "generativelanguage.googleapis.com")
      return aiQuota
        ? new Response("Quota", { status: 429 })
        : Response.json({
            candidates: [
              {
                finishReason: "MAX_TOKENS",
                content: { parts: [{ text: '{"plot":' }] },
              },
            ],
          });
    if (path.pathname.endsWith("top_rated")) {
      const page = Number(path.searchParams.get("page"));
      return Response.json({
        results: Array.from({ length: 20 }, (_, i) => ({
          id: (page - 1) * 20 + i + 1,
        })),
      });
    }
    const id = Number(path.pathname.split("/").at(-1));
    return Response.json({
      id,
      original_title: `Fixture ${id}`,
      release_date: "2000-01-01",
      genres: [{ id: 18 }],
      vote_average: 8,
      poster_path: "/fixture.jpg",
      overview: "Source plot",
      credits: { crew: [], cast: [] },
      videos: { results: [] },
      translations: { translations: [] },
    });
  };
  try {
    // First install, then re-run: migrations must be safe to repeat.
    await db.exec(`CREATE TABLE films(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,
     year integer NOT NULL,genre text NOT NULL,director text NOT NULL DEFAULT '',actors text NOT NULL DEFAULT '',
     plot text NOT NULL DEFAULT '',rating numeric(3,1),poster_url text NOT NULL DEFAULT '',trailer_id text,
     position integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now())`);
    await db.exec(schema);
    await db.exec(schema);
    const shelf = await repo.saveShelf("Klassiklər");
    const input = filmInput({
      title: "Film'); DROP TABLE films; --",
      year: 2000,
      genre: "Dram",
      rating: 8,
      shelfId: shelf.id,
    });
    const first = await repo.saveFilm(input),
      second = await repo.saveFilm({ ...input, title: "İkinci film" });
    assert.equal((await repo.catalog()).films.length, 2);
    assert.equal(
      (
        await repo.fillMissingPlot(
          first.id,
          "Azərbaycan dilində süjet.",
          "ai-translated",
        )
      ).plot,
      "Azərbaycan dilində süjet.",
    );
    assert.equal(
      (await repo.fillMissingPlot(first.id, "Başqa tərcümə.", "ai-translated"))
        .plot,
      "Azərbaycan dilində süjet.",
      "existing descriptions must not be overwritten",
    );
    assert.equal(
      (await repo.getFilm(first.id)).title,
      input.title,
      "parameterized input remains plain data",
    );
    await repo.saveFilm({ ...input, title: "Yenilənmiş film" }, first.id);
    assert.equal((await repo.getFilm(first.id)).title, "Yenilənmiş film");
    await repo.reorder([second.id, first.id]);
    assert.equal((await repo.catalog()).films[0].id, second.id);
    await repo.removeShelf(shelf.id);
    assert.equal((await repo.getFilm(first.id)).shelfId, "main");
    await repo.removeFilm(first.id);
    await repo.removeFilm(second.id);
    await rateLimit("test-bucket", 2, 60);
    await rateLimit("test-bucket", 2, 60);
    await assert.rejects(
      rateLimit("test-bucket", 2, 60),
      (e) => e.status === 429 && e.retryAfter > 0 && e.retryAfter <= 60,
    );
    let manifestStarts = 0;
    const job = await startImport(async () => {
      manifestStarts++;
    });
    assert.equal(job.total, 500);
    assert.equal(
      (
        await startImport(async () => {
          throw Error("Resume must not consume a new-import quota");
        })
      ).id,
      job.id,
      "a running import resumes its frozen manifest",
    );
    assert.equal(manifestStarts, 1);
    process.env.GEMINI_API_KEY = "fixture-only";
    aiQuota = true;
    await assert.rejects(importStep(job.id), (error) => error.status === 429);
    assert.equal(
      (await importStatus()).cursor,
      0,
      "quota failure must not advance the manifest",
    );
    // The same frozen job can move forward without Gemini even while its quota is exhausted.
    const progress = await importStep(job.id, { translate: false });
    aiQuota = false;
    delete process.env.GEMINI_API_KEY;
    assert.equal(progress.cursor, 1);
    assert.equal(progress.imported, 1);
    assert.equal(progress.untranslated, 1);
    assert.equal((await importStatus()).untranslated, 1);
    const imported = (await repo.catalog()).films[0];
    assert.equal(imported.plot, "");
    assert.equal(imported.translationStatus, "missing");
    await repo.upsertTMDB({
      ...imported,
      tmdbId: 1,
      translationStatus: "missing",
    });
    assert.equal(
      (await repo.catalog()).films.length,
      1,
      "TMDB IDs cannot duplicate",
    );
    // Finish the remaining fixture rows in SQL to exercise the exact completion boundary.
    await db.query(
      `INSERT INTO films(id,tmdb_id,title,year,genre,poster_url,top_snapshot)
     SELECT 'fixture-'||i,i,'Fixture '||i,2000,'Dram','', $1 FROM generate_series(2,499) AS i`,
      [job.id],
    );
    await db.query("UPDATE noir_imports SET cursor=499 WHERE id=$1", [job.id]);
    const complete = await importStep(job.id);
    assert.equal(complete.status, "complete");
    assert.equal(complete.imported, 500);
    assert.equal((await importStatus()).status, "complete");
    await db.query("DELETE FROM films WHERE tmdb_id=2");
    assert.equal(
      (await importStatus()).status,
      "incomplete",
      "a missing movie cannot masquerade as a complete 500",
    );
  } finally {
    await db.close();
    neonConfig.fetchFunction = oldNeonFetch;
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldURL;
    if (oldToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = oldToken;
    if (oldAI !== undefined) process.env.GEMINI_API_KEY = oldAI;
  }
});
