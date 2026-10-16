import {
  json,
  body,
  sameOrigin,
  text,
  identifier,
  filmInput,
  HttpError,
} from "./http.js";
import {
  authConfigured,
  session,
  login,
  logout,
  sessionCookie,
} from "./auth.js";
import { database, rateLimit, audit } from "./db.js";
import * as repo from "./repository.js";
import { searchTMDB, movieTMDB } from "./tmdb.js";
import { parseCommand, modelJSON, aiConfigured } from "./ai.js";
import { publicAI, chatInput, recommendChat } from "./chat.js";
import { startImport, importStep, importStatus } from "./importer.js";

export async function handler(req, res) {
  try {
    const path = new URL(req.url, "http://localhost").pathname.replace(
      /\/$/,
      "",
    );
    const method = req.method || "GET";
    if (path === "/api/status" && method === "GET") {
      return json(res, 200, {
        database: Boolean(process.env.DATABASE_URL),
        auth: authConfigured(),
        tmdb: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
        ai: aiConfigured(),
        runtime: process.env.VERCEL ? "vercel-node" : "local-node",
        message: process.env.DATABASE_URL
          ? "Server konfiqurasiyası mövcuddur."
          : "Canlı server bağlantıları hələ tamamlanmayıb.",
      });
    }
    if (path === "/api/catalog" && method === "GET")
      return json(res, 200, { ...(await repo.catalog()), source: "neon" });
    if (path === "/api/auth/login" && method === "POST") {
      sameOrigin(req);
      const b = await body(req);
      if (
        typeof b.password !== "string" ||
        !b.password.length ||
        b.password.length > 256
      )
        throw new HttpError(400, "Şifrə düzgün daxil edilməyib.");
      const current = await login(
        req,
        text(b.username, "İstifadəçi adı", 100),
        b.password,
      );
      res.setHeader("Set-Cookie", sessionCookie(current.token));
      return json(res, 200, { csrf: current.csrf, username: current.username });
    }
    if (path === "/api/auth/session" && method === "GET") {
      const current = await session(req);
      return json(res, 200, { csrf: current.csrf, username: current.username });
    }
    if (path === "/api/auth/logout" && method === "POST") {
      await logout(req);
      res.setHeader("Set-Cookie", sessionCookie("", true));
      return json(res, 200, { ok: true });
    }
    if (path.startsWith("/api/admin/")) {
      const current = await session(req, method !== "GET");
      await rateLimit(`admin:${current.username}`, 180, 60);
      const b = method === "GET" ? {} : await body(req);
      if (path === "/api/admin/films") {
        if (method === "GET") return json(res, 200, await repo.catalog());
        if (method === "POST" || method === "PATCH") {
          const f = filmInput(b.film || {}),
            id = method === "PATCH" ? identifier(b.id) : undefined;
          const result = await repo.saveFilm(f, id);
          await audit(
            current.username,
            id ? "film.update" : "film.create",
            result.id,
          );
          return json(res, 200, { film: result });
        }
        if (method === "DELETE") {
          const id = identifier(b.id);
          await repo.removeFilm(id);
          await audit(current.username, "film.delete", id);
          return json(res, 200, { ok: true });
        }
      }
      if (path === "/api/admin/reorder" && method === "POST") {
        const kind = b.kind === "shelves" ? "shelves" : "films";
        await repo.reorder(b.ids, kind);
        await audit(current.username, `${kind}.reorder`, "all");
        return json(res, 200, { ok: true });
      }
      if (path === "/api/admin/shelves") {
        if (method === "POST" || method === "PATCH") {
          const result = await repo.saveShelf(
            text(b.name, "Rəf adı", 80),
            method === "PATCH" ? identifier(b.id) : undefined,
          );
          await audit(current.username, "shelf.save", result.id);
          return json(res, 200, { shelf: result });
        }
        if (method === "DELETE") {
          const id = identifier(b.id);
          await repo.removeShelf(id);
          await audit(current.username, "shelf.delete", id);
          return json(res, 200, { ok: true });
        }
      }
      if (path === "/api/admin/tmdb/search" && method === "POST")
        return json(res, 200, {
          results: await searchTMDB(text(b.title, "Film adı"), b.year),
        });
      if (path === "/api/admin/tmdb/add" && method === "POST") {
        await rateLimit(`tmdb-add:${current.username}`, 30, 3600);
        const film = await movieTMDB(b.tmdbId);
        const result = await repo.upsertTMDB(film);
        await audit(current.username, "film.tmdb-add", result.id);
        return json(res, 200, { film: result });
      }
      if (path === "/api/admin/assistant" && method === "POST") {
        await rateLimit(`assistant:${current.username}`, 30, 3600);
        const intent = await parseCommand(text(b.command, "Əmr", 500));
        if (intent.action !== "add_film" || !intent.title)
          throw new HttpError(
            422,
            "Hazırda yalnız film əlavə etmək əmrləri dəstəklənir.",
          );
        const results = await searchTMDB(intent.title, intent.year);
        if (!results.length)
          throw new HttpError(404, "TMDB-də uyğun film tapılmadı.");
        const normalize = (s) =>
          s.toLocaleLowerCase("az").replace(/[^\p{L}\p{N}]/gu, "");
        const exact = results.filter(
          (f) =>
            normalize(f.title) === normalize(intent.title) &&
            (!intent.year || f.year === intent.year),
        );
        if (exact.length !== 1)
          return json(res, 200, {
            needsSelection: true,
            results,
            message: "Bir neçə uyğun nəticə var. Əlavə ediləcək filmi seçin.",
          });
        const film = await movieTMDB(exact[0].tmdbId),
          result = await repo.upsertTMDB(film);
        await audit(current.username, "film.ai-add", result.id);
        return json(res, 200, {
          film: result,
          message: `${result.title} bazaya əlavə edildi.`,
        });
      }
      if (path === "/api/admin/import" && method === "GET")
        return json(res, 200, { job: await importStatus() });
      if (path === "/api/admin/import/start" && method === "POST") {
        await rateLimit(`import:${current.username}`, 3, 3600);
        const job = await startImport();
        await audit(current.username, "import.start", job.id);
        return json(res, 200, { job });
      }
      if (path === "/api/admin/import/step" && method === "POST")
        return json(res, 200, { job: await importStep(identifier(b.id)) });
      throw new HttpError(405, "Bu əməliyyat dəstəklənmir.");
    }
    if (
      ["/api/ai/chat", "/api/ai/analyze", "/api/ai/similar"].includes(path) &&
      method === "POST"
    ) {
      sameOrigin(req);
      const b = await body(req);
      const input = path === "/api/ai/chat" ? chatInput(b) : null;
      await publicAI(req);
      if (input) {
        const { films } = await repo.catalog();
        return json(res, 200, await recommendChat(films, input));
      }
      const film = await repo.getFilm(identifier(b.filmId));
      if (path === "/api/ai/analyze") {
        const data = await modelJSON(
          "Filmi Azərbaycan dilində təhlil et. Təsdiqlənməmiş faktları uydurma. Mövzular və kino dili barədə qısa yaz; böyük spoyler vermə.",
          JSON.stringify(film),
          "analysis",
          {
            type: "object",
            additionalProperties: false,
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        );
        return json(res, 200, { text: data.text });
      }
      if (path === "/api/ai/similar") {
        const { films } = await repo.catalog();
        return json(
          res,
          200,
          await recommendChat(films, {
            message: "Bu filmə oxşar filmlər tap.",
            history: [],
            filmId: film.id,
          }),
        );
      }
    }
    throw new HttpError(404, "Sorğu yolu tapılmadı.");
  } catch (error) {
    // Do not leak SQL, connection strings, provider responses or secrets.
    return json(res, error instanceof HttpError ? error.status : 500, {
      message:
        error instanceof HttpError
          ? error.message
          : "Server əməliyyatı tamamlanmadı. Bağlantını və miqrasiyanı yoxlayın.",
    });
  }
}
