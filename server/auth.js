import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { database, rateLimit } from "./db.js";
import { HttpError, sameOrigin } from "./http.js";

const cookieName = "noir_session";
export function authConfigured() {
  return Boolean(
    process.env.DATABASE_URL &&
    process.env.ADMIN_USERNAME &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/i.test(
      process.env.ADMIN_PASSWORD_HASH || "",
    ) &&
    (process.env.ADMIN_SESSION_SECRET || "").length >= 32 &&
    (process.env.APP_ORIGIN || process.env.NODE_ENV !== "production"),
  );
}
export function sign(value) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
}
export function safeEqual(a, b) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, encoded) {
  const [, salt] = encoded.split(":");
  return safeEqual(hashPassword(password, salt), encoded);
}
export function sessionCookie(token, expired = false) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.APP_ORIGIN?.startsWith("https:");
  return `${cookieName}=${token}; HttpOnly; Path=/api; SameSite=Strict; Max-Age=${expired ? 0 : 28800}${secure ? "; Secure" : ""}`;
}
export async function login(req, username, password) {
  if (!authConfigured())
    throw new HttpError(
      503,
      "Təhlükəsiz admin girişi hələ konfiqurasiya edilməyib.",
    );
  // Both IP and global buckets persist across serverless instances.
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  ).split(",")[0];
  const digest = createHash("sha256")
    .update(ip + process.env.ADMIN_SESSION_SECRET)
    .digest("hex");
  await rateLimit(`login:${digest}`, 5, 900);
  await rateLimit("login:global", 60, 900);
  const passwordMatches = verifyPassword(
    password,
    process.env.ADMIN_PASSWORD_HASH,
  );
  if (!safeEqual(username, process.env.ADMIN_USERNAME) || !passwordMatches) {
    throw new HttpError(401, "İstifadəçi adı və ya şifrə yanlışdır.");
  }
  const id = randomBytes(32).toString("base64url"),
    csrf = randomBytes(24).toString("base64url");
  const sql = database();
  await sql`INSERT INTO noir_sessions (id, username, csrf, expires_at)
    VALUES (${sign(id)}, ${username}, ${csrf}, now() + interval '8 hours')`;
  return { token: id, csrf, username };
}
export async function session(req, mutation = false) {
  if (!authConfigured())
    throw new HttpError(
      503,
      "Admin girişi üçün server bağlantıları tamamlanmayıb.",
    );
  const token = (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!token || !/^[\w-]{43}$/.test(token))
    throw new HttpError(401, "Admin hesabına daxil olun.");
  const sql = database();
  const [row] =
    await sql`SELECT username, csrf FROM noir_sessions WHERE id = ${sign(token)} AND expires_at > now()`;
  if (!row) throw new HttpError(401, "Sessiya bitib. Yenidən daxil olun.");
  if (mutation) {
    sameOrigin(req);
    if (!safeEqual(String(req.headers["x-csrf-token"] || ""), row.csrf))
      throw new HttpError(403, "Təhlükəsizlik tokeni yanlışdır.");
  }
  return { ...row, token };
}
export async function logout(req) {
  const current = await session(req, true),
    sql = database();
  await sql`DELETE FROM noir_sessions WHERE id = ${sign(current.token)}`;
}
