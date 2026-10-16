import test from "node:test";
import assert from "node:assert/strict";
import { createPosterCache, posterSource } from "../src/poster-cache.js";

test("poster sources request small TMDB artwork without rewriting other hosts", () => {
  assert.equal(
    posterSource("https://image.tmdb.org/t/p/w500/film.jpg", true),
    "https://image.tmdb.org/t/p/w185/film.jpg",
  );
  assert.equal(
    posterSource("https://image.tmdb.org/t/p/original/film.jpg"),
    "https://image.tmdb.org/t/p/w342/film.jpg",
  );
  assert.equal(posterSource("/posters/local.jpg"), "/posters/local.jpg");
  assert.equal(
    posterSource("https://other.example/t/p/w500/film.jpg"),
    "https://other.example/t/p/w500/film.jpg",
  );
});

test("all 108 visible covers load with bounded concurrency and active textures are retained", async () => {
  const targets = Array.from({ length: 108 }, (_, i) => ({
    id: i,
    live: true,
  }));
  let running = 0,
    peak = 0,
    loaded = 0;
  const disposed = [];
  const cache = createPosterCache({
    async load(url) {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      loaded++;
      return { url };
    },
    apply: (target, texture) => (target.texture = texture),
    dispose: (texture) => disposed.push(texture),
    isLive: (target) => target.live,
    isInUse: (texture) =>
      targets.some((target) => target.live && target.texture === texture),
  });
  for (const target of targets) cache.request(String(target.id), target);
  await new Promise(setImmediate);
  assert.equal(loaded, 108);
  assert.equal(peak, 4);
  assert.ok(
    targets.every((target) => target.texture && cache.owns(target.texture)),
  );
  assert.equal(disposed.length, 0);
  targets.forEach((target) => (target.live = false));
  const next = Array.from({ length: 40 }, (_, i) => ({
    id: 108 + i,
    live: true,
  }));
  targets.push(...next);
  for (const target of next) cache.request(String(target.id), target);
  await new Promise(setImmediate);
  assert.equal(disposed.length, 20);
  assert.ok(next.every((target) => cache.owns(target.texture)));
});

test("duplicate pending poster URLs update all live covers and ignore removed covers", async () => {
  let finish,
    calls = 0;
  const first = { live: true },
    second = { live: true },
    removed = { live: true };
  const cache = createPosterCache({
    load: () => {
      calls++;
      return new Promise((resolve) => (finish = resolve));
    },
    apply: (target, texture) => (target.texture = texture),
    dispose() {},
    isLive: (target) => target.live,
    isInUse: () => false,
  });
  [first, second, removed].forEach((target) => cache.request("shared", target));
  removed.live = false;
  await Promise.resolve();
  finish({ url: "shared" });
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  assert.equal(first.texture, second.texture);
  assert.equal(removed.texture, undefined);
});
