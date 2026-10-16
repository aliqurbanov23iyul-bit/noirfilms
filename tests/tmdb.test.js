import test from "node:test";
import assert from "node:assert/strict";
import { movieTMDB, searchTMDB, tmdb } from "../server/tmdb.js";

test("TMDB adapter uses a server token and preserves canonical ID and rating source", async () => {
  const originalFetch = globalThis.fetch,
    oldToken = process.env.TMDB_READ_ACCESS_TOKEN,
    oldAI = process.env.GEMINI_API_KEY;
  process.env.TMDB_READ_ACCESS_TOKEN = "test-token-not-a-real-key";
  delete process.env.GEMINI_API_KEY;
  const fixture = {
    id: 157336,
    original_title: "Interstellar",
    release_date: "2014-11-05",
    vote_average: 8.4,
    overview: "English source overview",
    poster_path: "/test.jpg",
    genres: [{ id: 878 }],
    credits: {
      crew: [{ job: "Director", name: "Christopher Nolan" }],
      cast: [{ name: "Matthew McConaughey" }],
    },
    videos: {
      results: [
        {
          site: "YouTube",
          type: "Trailer",
          official: true,
          key: "zSWdZVtXT7E",
        },
      ],
    },
    translations: { translations: [] },
  };
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/api.themoviedb.org\/3\//);
    assert.equal(
      options.headers.Authorization,
      "Bearer test-token-not-a-real-key",
    );
    return Response.json(
      String(url).includes("search/movie") ? { results: [fixture] } : fixture,
    );
  };
  try {
    const movie = await movieTMDB(157336);
    assert.equal(movie.tmdbId, 157336);
    assert.equal(movie.director, "Christopher Nolan");
    assert.equal(movie.genre, "Elmi fantastika");
    assert.equal(movie.ratingSource, "TMDB");
    assert.equal(movie.plot, "");
    assert.equal(movie.translationStatus, "missing");
    assert.equal(movie.trailer, "zSWdZVtXT7E");
    const results = await searchTMDB("Interstellar", 2014);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Interstellar");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = oldToken;
    if (oldAI !== undefined) process.env.GEMINI_API_KEY = oldAI;
  }
});

test("missing TMDB token makes no external call", async () => {
  const old = process.env.TMDB_READ_ACCESS_TOKEN;
  delete process.env.TMDB_READ_ACCESS_TOKEN;
  try {
    await assert.rejects(tmdb("movie/top_rated"), (e) => e.status === 503);
  } finally {
    if (old !== undefined) process.env.TMDB_READ_ACCESS_TOKEN = old;
  }
});

test("import tolerates invalid translations but preserves quota failures and canonical metadata", async (t) => {
  const names = ["TMDB_READ_ACCESS_TOKEN", "GEMINI_API_KEY"];
  const old = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  process.env.TMDB_READ_ACCESS_TOKEN = "fixture-tmdb";
  process.env.GEMINI_API_KEY = "fixture-gemini";
  t.after(() => {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
    }
  });
  let quota = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("generativelanguage.googleapis.com"))
      return quota
        ? new Response("quota", { status: 429 })
        : Response.json({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: '{"plot":42}' }] },
              },
            ],
          });
    return Response.json({
      id: 42,
      original_title: "Fixture film",
      release_date: "2000-01-01",
      overview: "Source plot",
      vote_average: 8,
      genres: [{ id: 18 }],
    });
  });
  await assert.rejects(
    movieTMDB(42),
    (error) => error.code === "AI_INVALID_OUTPUT",
  );
  const film = await movieTMDB(42, { tolerateInvalidTranslation: true });
  assert.equal(film.tmdbId, 42);
  assert.equal(film.plot, "");
  assert.equal(film.translationStatus, "missing");
  quota = true;
  const withoutAI = await movieTMDB(42, { translate: false });
  assert.equal(withoutAI.title, "Fixture film");
  assert.equal(withoutAI.translationStatus, "missing");
  await assert.rejects(
    movieTMDB(42, { tolerateInvalidTranslation: true }),
    (error) => error.status === 429,
  );
});
