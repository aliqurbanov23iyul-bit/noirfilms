import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { HttpError } from "./http.js";
import { tmdb, movieTMDB } from "./tmdb.js";
import { upsertTMDB } from "./repository.js";

export async function startImport(beforeCreate = async () => {}) {
  const sql = database();
  const [pending] =
    await sql`SELECT id,cursor,total,status,created_at FROM noir_imports WHERE status='running' ORDER BY created_at DESC LIMIT 1`;
  if (pending) return pending;
  // Resuming a frozen manifest must not consume the new-import hourly quota.
  await beforeCreate();
  const ids = [];
  // The ranking is frozen before any film is imported. No synthetic entries.
  for (let page = 1; ids.length < 500 && page <= 30; page++) {
    const data = await tmdb("movie/top_rated", { page, language: "en-US" });
    for (const f of data.results || [])
      if (!ids.includes(f.id) && ids.length < 500) ids.push(f.id);
  }
  if (ids.length !== 500)
    throw new HttpError(
      502,
      "TMDB-dən 500 unikal film alınmadı. İmport başladılmadı.",
    );
  const [job] = await sql`INSERT INTO noir_imports(id,manifest,total)
   VALUES(${randomUUID()},${JSON.stringify(ids)}::jsonb,500) RETURNING id,cursor,total,status,created_at`;
  return job;
}
export async function importStep(id, { translate = true } = {}) {
  const sql = database();
  const [job] =
    await sql`UPDATE noir_imports SET leased_until=now()+interval '2 minutes'
   WHERE id=${id} AND status='running' AND (leased_until IS NULL OR leased_until<now()) RETURNING *`;
  if (!job) {
    const [current] =
      await sql`SELECT id,cursor,total,status,error,created_at FROM noir_imports WHERE id=${id}`;
    if (!current) throw new HttpError(404, "İmport tapılmadı.");
    if (current.status === "complete") return current;
    throw new HttpError(
      409,
      "Bu import hazırda işləyir. Bir qədər sonra davam edin.",
    );
  }
  try {
    const tmdbId = job.manifest[job.cursor];
    if (tmdbId) {
      const film = await movieTMDB(tmdbId, {
        tolerateInvalidTranslation: true,
        translate,
      });
      const shelfIndex = Math.floor(job.cursor / 25) + 1;
      const shelfId = `top-${String(shelfIndex).padStart(2, "0")}`;
      await sql`INSERT INTO shelves(id,name,position) VALUES(${shelfId},${`TOP 500 · ${String(shelfIndex).padStart(2, "0")}`},${shelfIndex}) ON CONFLICT(id) DO NOTHING`;
      await upsertTMDB({ ...film, shelfId }, job.cursor + 1, job.id);
    }
    const cursor = job.cursor + (tmdbId ? 1 : 0);
    const [count] =
      await sql`SELECT count(*)::int AS count, count(*) FILTER (WHERE translation_status='missing')::int AS untranslated FROM films WHERE top_snapshot=${job.id}`;
    const complete = cursor === 500 && count.count === 500;
    const [result] =
      await sql`UPDATE noir_imports SET cursor=${cursor},status=${complete ? "complete" : cursor === 500 ? "incomplete" : "running"},error=NULL,
     leased_until=NULL,updated_at=now() WHERE id=${id} RETURNING id,cursor,total,status,created_at`;
    if (cursor === 500 && !complete)
      throw new HttpError(
        409,
        "Bəzi import filmləri silinib. Tam 500 film təsdiqlənmədi.",
      );
    return {
      ...result,
      imported: count.count,
      untranslated: count.untranslated,
    };
  } catch (error) {
    await sql`UPDATE noir_imports SET leased_until=NULL,error='Film alınmadı; davam etmək üçün yenidən cəhd edin.',updated_at=now() WHERE id=${id}`;
    throw error;
  }
}
export async function importStatus() {
  const sql = database();
  const [job] =
    await sql`SELECT id,cursor,total,status,error,created_at FROM noir_imports ORDER BY created_at DESC LIMIT 1`;
  if (!job) return null;
  const [count] =
    await sql`SELECT count(*)::int AS count, count(*) FILTER (WHERE translation_status='missing')::int AS untranslated FROM films WHERE top_snapshot=${job.id}`;
  return {
    ...job,
    imported: count.count,
    untranslated: count.untranslated,
    status:
      job.status === "complete" && count.count !== 500
        ? "incomplete"
        : job.status,
  };
}
