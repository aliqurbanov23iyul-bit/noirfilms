import { posterSource } from "./poster-cache.js";

const fallback = { primary: [70, 83, 101], secondary: [111, 91, 72] };
const cache = new Map();
const mix = (rgb, target, amount) =>
  rgb.map((v, i) => Math.round(v * (1 - amount) + target[i] * amount));
const color = (rgb) => rgb.join(" ");

export function paletteFromPixels(pixels) {
  const bins = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (max < 25 || min > 235) continue;
    const key = rgb.map((v) => v >> 5).join(",");
    const bucket = bins.get(key) || { rgb: [0, 0, 0], count: 0, score: 0 };
    bucket.count++;
    rgb.forEach((v, j) => (bucket.rgb[j] += v));
    bucket.score += 0.25 + (max - min) / 255;
    bins.set(key, bucket);
  }
  const ranked = [...bins.values()]
    .sort((a, b) => b.score - a.score)
    .map((b) => b.rgb.map((v) => Math.round(v / b.count)));
  if (!ranked.length) return fallback;
  const primary = ranked[0];
  const secondary =
    ranked.find(
      (rgb) => Math.hypot(...rgb.map((v, i) => v - primary[i])) > 90,
    ) || mix(primary, [130, 140, 155], 0.4);
  return { primary, secondary };
}

export function themeVariables(palette = fallback) {
  const { primary, secondary } = palette;
  return {
    "--film-primary": color(primary),
    "--film-secondary": color(secondary),
    "--film-left": color(mix(primary, [10, 12, 17], 0.7)),
    "--film-right": color(mix(secondary, [9, 11, 15], 0.88)),
    "--film-accent": color(mix(primary, [255, 255, 255], 0.7)),
  };
}

export function loadPosterPalette(poster) {
  if (!poster) return Promise.resolve(fallback);
  const source = posterSource(poster, true);
  if (cache.has(source)) return cache.get(source);
  const pending = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    let settled = false;
    const finish = (palette) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(palette);
    };
    const timer = setTimeout(() => finish(fallback), 8000);
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 48;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 32, 48);
        finish(paletteFromPixels(ctx.getImageData(0, 0, 32, 48).data));
      } catch {
        finish(fallback);
      }
    };
    image.onerror = () => finish(fallback);
    image.src = source;
  });
  cache.set(source, pending);
  if (cache.size > 96) cache.delete(cache.keys().next().value);
  return pending;
}
