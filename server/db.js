import { neon } from "@neondatabase/serverless";
import { HttpError } from "./http.js";

export function database() {
  if (!process.env.DATABASE_URL)
    throw new HttpError(503, "Neon verilənlər bazası hələ qoşulmayıb.");
  return neon(process.env.DATABASE_URL);
}

export function filmRow(row) {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    genre: row.genre,
    director: row.director,
    cast: row.actors,
    plot: row.plot,
    rating: Number(row.rating || 0),
    ratingSource: row.rating_source,
    poster: row.poster_url,
    trailer: row.trailer_id || "",
    shelfId: row.shelf_id,
    position: row.position,
    tmdbId: row.tmdb_id,
    rank: row.top_rank,
    translationStatus: row.translation_status,
    sourceUpdatedAt: row.source_updated_at,
  };
}

export async function rateLimit(key, limit, seconds) {
  const sql = database();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const [result] = await sql`
    INSERT INTO noir_rate_limits (key, bucket, hits, expires_at)
    VALUES (${key}, ${bucket}, 1, now() + (${seconds} * interval '1 second'))
    ON CONFLICT (key, bucket) DO UPDATE SET hits = noir_rate_limits.hits + 1
    RETURNING hits`;
  if (result.hits > limit) {
    const remaining = Math.max(
      1,
      Math.ceil((bucket + 1) * seconds - Date.now() / 1000),
    );
    const error = new HttpError(
      429,
      `Sorğu limiti dolub. Təxminən ${remaining} saniyə sonra davam edə bilərsiniz.`,
    );
    error.retryAfter = remaining;
    throw error;
  }
}

export async function audit(actor, action, recordId) {
  const sql = database();
  await sql`INSERT INTO noir_audit (actor, action, record_id) VALUES (${actor}, ${action}, ${recordId})`;
}
