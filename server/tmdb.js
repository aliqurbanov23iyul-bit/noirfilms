import { HttpError } from "./http.js";
import { translatePlot, aiConfigured } from "./ai.js";
const genreNames = {
  28: "Döyüş",
  12: "Macəra",
  16: "Animasiya",
  35: "Komediya",
  80: "Kriminal",
  99: "Sənədli",
  18: "Dram",
  10751: "Ailə",
  14: "Fantastika",
  36: "Tarixi",
  27: "Qorxu",
  10402: "Musiqi",
  9648: "Sirli",
  10749: "Romantika",
  878: "Elmi fantastika",
  10770: "Televiziya filmi",
  53: "Triller",
  10752: "Müharibə",
  37: "Vestern",
};
export async function tmdb(path, params = {}) {
  if (!process.env.TMDB_READ_ACCESS_TOKEN)
    throw new HttpError(503, "TMDB bağlantısı hələ qoşulmayıb.");
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status !== 429) break;
    await new Promise((r) =>
      setTimeout(
        r,
        Math.min(Number(response.headers.get("retry-after") || 1), 3) * 1000,
      ),
    );
  }
  if (!response.ok)
    throw new HttpError(
      502,
      "TMDB məlumatları hazırda alınmır. Açarı və bağlantını yoxlayın.",
    );
  return response.json();
}
export async function searchTMDB(title, year) {
  const data = await tmdb("search/movie", {
    query: title,
    include_adult: false,
    language: "en-US",
    ...(year ? { year } : {}),
  });
  return (data.results || []).slice(0, 6).map((f) => ({
    tmdbId: f.id,
    title: f.original_title || f.title,
    localizedTitle: f.title,
    year: Number(f.release_date?.slice(0, 4)) || null,
    poster: f.poster_path
      ? `https://image.tmdb.org/t/p/w342${f.poster_path}`
      : "",
    rating: f.vote_average,
  }));
}
export async function movieTMDB(
  id,
  { tolerateInvalidTranslation = false, translate = true } = {},
) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1)
    throw new HttpError(400, "TMDB identifikatoru yanlışdır.");
  const f = await tmdb(`movie/${Number(id)}`, {
    language: "en-US",
    append_to_response: "credits,videos,translations",
  });
  const az = f.translations?.translations?.find((t) => t.iso_639_1 === "az")
    ?.data?.overview;
  let plot = az || "",
    translationStatus = az ? "tmdb-az" : "missing";
  if (!plot && f.overview && translate && aiConfigured()) {
    try {
      plot = await translatePlot(f.overview);
      translationStatus = "ai-translated";
    } catch (error) {
      // Invalid text must not block the remaining films. Provider quota and
      // credential errors still pause the import rather than hammering Gemini.
      if (!tolerateInvalidTranslation || error.code !== "AI_INVALID_OUTPUT")
        throw error;
    }
  }
  const video =
    f.videos?.results?.find(
      (v) => v.site === "YouTube" && v.type === "Trailer" && v.official,
    ) ||
    f.videos?.results?.find(
      (v) => v.site === "YouTube" && v.type === "Trailer",
    );
  const year = Number(f.release_date?.slice(0, 4));
  if (!year || !f.original_title)
    throw new HttpError(422, "Filmin adı və buraxılış ili natamamdır.");
  return {
    tmdbId: f.id,
    title: f.original_title,
    year,
    genre: (f.genres || []).map((g) => genreNames[g.id] || "Digər").join(", "),
    director: (f.credits?.crew || [])
      .filter((p) => p.job === "Director")
      .map((p) => p.name)
      .join(", "),
    cast: (f.credits?.cast || [])
      .slice(0, 6)
      .map((p) => p.name)
      .join(", "),
    plot,
    translationStatus,
    rating: Math.round(f.vote_average * 10) / 10,
    ratingSource: "TMDB",
    poster: f.poster_path
      ? `https://image.tmdb.org/t/p/w500${f.poster_path}`
      : "",
    trailer: video?.key || "",
    shelfId: "main",
  };
}
