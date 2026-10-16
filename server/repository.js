import { randomUUID } from "node:crypto";
import { database, filmRow } from "./db.js";
import { HttpError } from "./http.js";

export async function catalog() {
  const sql = database();
  const [films, shelves] = await sql.transaction(
    [
      sql`SELECT * FROM films ORDER BY position, title LIMIT 2000`,
      sql`SELECT * FROM shelves ORDER BY position, name`,
    ],
    { readOnly: true },
  );
  return { films: films.map(filmRow), shelves };
}
export async function getFilm(id) {
  const sql = database();
  const [row] = await sql`SELECT * FROM films WHERE id = ${id}`;
  if (!row) throw new HttpError(404, "Film tapılmadı.");
  return filmRow(row);
}
export async function fillMissingPlot(id, plot, translationStatus) {
  const sql = database();
  const [row] =
    await sql`UPDATE films SET plot=${plot}, translation_status=${translationStatus}, updated_at=now()
    WHERE id=${id} AND plot='' RETURNING *`;
  return row ? filmRow(row) : getFilm(id);
}
export async function saveFilm(f, id) {
  const sql = database();
  const [shelf] = await sql`SELECT id FROM shelves WHERE id = ${f.shelfId}`;
  if (!shelf) throw new HttpError(400, "Seçilmiş rəf mövcud deyil.");
  let result;
  if (id) {
    [result] =
      await sql`UPDATE films SET title=${f.title}, year=${f.year}, genre=${f.genre},
      director=${f.director}, actors=${f.cast}, plot=${f.plot}, rating=${f.rating},
      poster_url=${f.poster}, trailer_id=${f.trailer}, shelf_id=${f.shelfId},
      rating_source=${f.ratingSource}, translation_status='editorial', updated_at=now()
      WHERE id=${id} RETURNING *`;
    if (!result) throw new HttpError(404, "Film tapılmadı.");
  } else {
    [result] = await sql`INSERT INTO films
      (id,title,year,genre,director,actors,plot,rating,poster_url,trailer_id,shelf_id,rating_source,position,translation_status)
      VALUES (${randomUUID()},${f.title},${f.year},${f.genre},${f.director},${f.cast},${f.plot},${f.rating},
      ${f.poster},${f.trailer},${f.shelfId},${f.ratingSource},
      (SELECT COALESCE(MAX(position),0)+1 FROM films),'editorial') RETURNING *`;
  }
  return filmRow(result);
}
export async function removeFilm(id) {
  const sql = database();
  const rows = await sql`DELETE FROM films WHERE id=${id} RETURNING id`;
  if (!rows.length) throw new HttpError(404, "Film tapılmadı.");
}
export async function reorder(ids, kind = "films") {
  const sql = database();
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 2000 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string" || id.length > 100)
  )
    throw new HttpError(400, "Sıralama siyahısı yanlışdır.");
  const payload = JSON.stringify(ids.map((id, position) => ({ id, position })));
  if (kind === "shelves") {
    await sql`UPDATE shelves s SET position=x.position FROM jsonb_to_recordset(${payload}::jsonb) AS x(id text, position int) WHERE s.id=x.id`;
  } else {
    await sql`UPDATE films f SET position=x.position, updated_at=now() FROM jsonb_to_recordset(${payload}::jsonb) AS x(id text, position int) WHERE f.id=x.id`;
  }
}
export async function saveShelf(name, id) {
  const sql = database();
  if (id) {
    const [row] =
      await sql`UPDATE shelves SET name=${name} WHERE id=${id} RETURNING *`;
    if (!row) throw new HttpError(404, "Rəf tapılmadı.");
    return row;
  }
  const [row] = await sql`INSERT INTO shelves(id,name,position)
    VALUES(${randomUUID()},${name},(SELECT COALESCE(MAX(position),0)+1 FROM shelves)) RETURNING *`;
  return row;
}
export async function removeShelf(id) {
  if (id === "main") throw new HttpError(400, "Əsas rəfi silmək olmaz.");
  const sql = database();
  // Films move to the main shelf and deletion happens in one transaction.
  await sql.transaction([
    sql`UPDATE films SET shelf_id='main' WHERE shelf_id=${id}`,
    sql`DELETE FROM shelves WHERE id=${id}`,
  ]);
}
export async function upsertTMDB(f, rank = null, snapshot = null) {
  const sql = database();
  const [row] = await sql`INSERT INTO films
    (id,tmdb_id,title,year,genre,director,actors,plot,rating,rating_source,poster_url,trailer_id,
     shelf_id,position,top_rank,top_snapshot,translation_status,source_updated_at)
    VALUES(${randomUUID()},${f.tmdbId},${f.title},${f.year},${f.genre},${f.director},${f.cast},${f.plot},
      ${f.rating},'TMDB',${f.poster},${f.trailer},${f.shelfId || "main"},${rank || 10000},${rank},${snapshot},${f.translationStatus},now())
    ON CONFLICT(tmdb_id) DO UPDATE SET
      plot=CASE WHEN films.translation_status='missing' AND EXCLUDED.translation_status<>'missing' THEN EXCLUDED.plot ELSE films.plot END,
      translation_status=CASE WHEN films.translation_status='missing' AND EXCLUDED.translation_status<>'missing' THEN EXCLUDED.translation_status ELSE films.translation_status END,
      top_rank=COALESCE(EXCLUDED.top_rank,films.top_rank),
      top_snapshot=COALESCE(EXCLUDED.top_snapshot,films.top_snapshot),
      rating=CASE WHEN films.rating_source='TMDB' THEN EXCLUDED.rating ELSE films.rating END,
      source_updated_at=now()
    RETURNING *`;
  return filmRow(row);
}
