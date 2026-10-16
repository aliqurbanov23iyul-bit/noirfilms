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
