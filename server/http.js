export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}

export async function body(req) {
  const length = Number(req.headers["content-length"] || 0);
  if (length > 32_768) throw new HttpError(413, "Sorğu həddən artıq böyükdür.");
  if (!(req.headers["content-type"] || "").startsWith("application/json")) {
    throw new HttpError(415, "JSON formatı tələb olunur.");
  }
  if (req.body !== undefined) {
    const value =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(value) > 32_768)
      throw new HttpError(413, "Sorğu həddən artıq böyükdür.");
    try {
      return JSON.parse(value);
    } catch {
      throw new HttpError(400, "Sorğu formatı yanlışdır.");
    }
  }
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 32_768)
      throw new HttpError(413, "Sorğu həddən artıq böyükdür.");
  }
  try {
    return JSON.parse(data || "{}");
  } catch {
    throw new HttpError(400, "Sorğu formatı yanlışdır.");
  }
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  const expected =
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:5173" : "");
  if (!expected || origin !== new URL(expected).origin)
    throw new HttpError(403, "Sorğunun mənbəyi təsdiqlənmədi.");
  if (
    req.headers["sec-fetch-site"] &&
    !["same-origin", "none"].includes(req.headers["sec-fetch-site"])
  ) {
    throw new HttpError(403, "Bu mənbədən sorğu qəbul edilmir.");
  }
}

export function text(value, name, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new HttpError(400, `${name} düzgün daxil edilməyib.`);
  }
  return value.trim();
}

export function identifier(value) {
  return text(value, "İdentifikator", 100);
}

export function filmInput(value) {
  const title = text(value.title, "Film adı");
  const year = Number(value.year),
    rating = Number(value.rating || 0);
  if (
    !Number.isInteger(year) ||
    year < 1888 ||
    year > 2100 ||
    !Number.isFinite(rating) ||
    rating < 0 ||
    rating > 10
  ) {
    throw new HttpError(400, "İl və ya reytinq yanlışdır.");
  }
  const poster = text(value.poster || "", "Poster", 2048, false);
  if (
    poster &&
    !/^https:\/\//.test(poster) &&
    !/^\/posters\/[a-z\d._-]+$/i.test(poster)
  ) {
    throw new HttpError(
      400,
      "Poster üçün HTTPS və ya yerli /posters/ yolu tələb olunur.",
    );
  }
  const trailer = text(value.trailer || "", "Treyler", 20, false);
  if (trailer && !/^[\w-]{11}$/.test(trailer))
    throw new HttpError(400, "YouTube identifikatoru yanlışdır.");
  return {
    title,
    year,
    rating,
    poster,
    trailer,
    genre: text(value.genre, "Janr", 150),
    director: text(value.director || "", "Rejissor", 250, false),
    cast: text(value.cast || "", "Aktyorlar", 1000, false),
    plot: text(value.plot || "", "Süjet", 6000, false),
    shelfId: identifier(value.shelfId || "main"),
    ratingSource: value.ratingSource === "TMDB" ? "TMDB" : "Redaktor",
  };
}
