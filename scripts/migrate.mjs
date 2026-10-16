import { readFile } from "node:fs/promises";
import { database } from "../server/db.js";
const sql = database();
const source = await readFile(
  new URL("../server/schema.sql", import.meta.url),
  "utf8",
);
// Each statement is fixed migration source, never request input.
const statements = source
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
await sql.transaction(statements.map((statement) => sql.query(statement)));
await sql`DELETE FROM noir_sessions WHERE expires_at<now()`;
await sql`DELETE FROM noir_rate_limits WHERE expires_at<now()`;
console.log("NOIR sxemi yeniləndi. Məlumatlar avtomatik doldurulmadı.");
