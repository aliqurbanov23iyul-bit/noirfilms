import test from "node:test";
import assert from "node:assert/strict";
import { filmGenres, catalogGenres } from "../src/catalog.js";

test("multi-genre films remain selectable with each individual genre", () => {
  const films = [
    { genre: "Dram, Triller" },
    { genre: "Triller,Elmi fantastika" },
    { genre: " Dram , , Komediya " },
    {},
  ];
  assert.deepEqual(catalogGenres(films), [
    "Dram",
    "Triller",
    "Elmi fantastika",
    "Komediya",
  ]);
  for (const genre of catalogGenres(films)) {
    assert.ok(films.some((film) => filmGenres(film).includes(genre)));
  }
  assert.equal(
    films.filter((film) => filmGenres(film).includes("Dram")).length,
    2,
  );
});
