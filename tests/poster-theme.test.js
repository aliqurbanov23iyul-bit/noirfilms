import test from "node:test";
import assert from "node:assert/strict";
import { paletteFromPixels, themeVariables } from "../src/poster-theme.js";
const pixels = (rgb, count = 100) =>
  Array.from({ length: count }, () => [...rgb, 255]).flat();
const luminance = (rgb) =>
  rgb
    .map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);
test("poster colours select dominant blue and a distinct warm secondary without black/white borders", () => {
  const data = [
    ...pixels([25, 90, 160], 120),
    ...pixels([220, 150, 55], 60),
    ...pixels([0, 0, 0], 200),
    ...pixels([255, 255, 255], 200),
  ];
  const p = paletteFromPixels(data);
  assert.deepEqual(p.primary, [25, 90, 160]);
  assert.deepEqual(p.secondary, [220, 150, 55]);
});
test("neutral, empty and transparent posters have a usable fallback", () => {
  for (const data of [
    [],
    pixels([0, 0, 0]),
    pixels([255, 255, 255]),
    [255, 0, 0, 0],
  ]) {
    const p = paletteFromPixels(data);
    assert.equal(p.primary.length, 3);
    assert.equal(p.secondary.length, 3);
  }
});
test("poster-driven surfaces retain readable text even for bright covers", () => {
  for (const primary of [
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [0, 0, 0],
    [240, 200, 30],
  ]) {
    const vars = themeVariables({ primary, secondary: primary });
    const rgb = (key) => vars[key].split(" ").map(Number);
    assert.ok(contrast([246, 247, 250], rgb("--film-right")) >= 7);
    assert.ok(contrast([12, 16, 23], rgb("--film-accent")) >= 7);
    assert.ok(contrast([246, 247, 250], rgb("--film-left")) >= 4.5);
  }
});
