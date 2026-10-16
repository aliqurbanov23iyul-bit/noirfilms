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
import { modelJSON, aiConfigured } from "./ai.js";
import { publicAI, chatInput, recommendChat } from "./chat.js";
import { adminConversation } from "./admin-assistant.js";
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
        const film = await movieTMDB(b.tmdbId, {
          translate: b.translate === true,
        });
        const result = await repo.upsertTMDB(film);
        await audit(current.username, "film.tmdb-add", result.id);
        return json(res, 200, { film: result });
      }
      if (path === "/api/admin/assistant" && method === "POST") {
        await rateLimit(`assistant:${current.username}`, 60, 3600);
        const input = chatInput({ message: b.command, history: b.history });
        const { films } = await repo.catalog();
        const reply = await adminConversation(input, films);
        const results = reply.searchTitle
          ? await searchTMDB(text(reply.searchTitle, "Film adı"), reply.year)
          : [];
        return json(res, 200, {
          message:
            reply.text +
            (reply.searchTitle && !results.length
              ? " TMDB-də uyğun film tapılmadı."
              : ""),
          results,
        });
      }
      if (path === "/api/admin/ai/check" && method === "POST") {
        await rateLimit(`ai-check:${current.username}`, 5, 600);
        const reply = await modelJSON(
          "Azərbaycan dilində qısa salam yaz.",
          "Bağlantı sınağı",
          "health_check",
          {
            type: "object",
            additionalProperties: false,
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        );
        return json(res, 200, { ok: true, text: reply.text });
      }
      if (path === "/api/admin/translate" && method === "POST") {
        await rateLimit(`translate:${current.username}`, 30, 60);
        const film = await repo.getFilm(identifier(b.id));
        if (film.plot?.trim()) return json(res, 200, { film, skipped: true });
        if (!film.tmdbId)
          throw new HttpError(
            422,
            "Bu film üçün süjeti redaktə bölməsində Azərbaycan dilində yazın.",
          );
        const source = await movieTMDB(film.tmdbId, { translate: true });
        if (!source.plot?.trim())
          throw new HttpError(
            503,
            "Azərbaycan dilində süjet alınmadı. Gemini bağlantısını yoxlayın və ya mətni redaktə bölməsində yazın.",
          );
        const result = await repo.fillMissingPlot(
          film.id,
          source.plot,
          source.translationStatus,
        );
        await audit(current.username, "film.translate", film.id);
        return json(res, 200, { film: result });
      }
      if (path === "/api/admin/import" && method === "GET")
        return json(res, 200, { job: await importStatus() });
      if (path === "/api/admin/import/start" && method === "POST") {
        const job = await startImport(() =>
          rateLimit(`import:${current.username}`, 3, 3600),
        );
        await audit(current.username, "import.start", job.id);
        return json(res, 200, { job });
      }
      if (path === "/api/admin/import/step" && method === "POST") {
        if (b.translate !== undefined && typeof b.translate !== "boolean")
          throw new HttpError(400, "Tərcümə seçimi yanlışdır.");
        return json(res, 200, {
          job: await importStep(identifier(b.id), {
            translate: b.translate !== false,
          }),
        });
      }
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
    if (error instanceof HttpError && error.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    // Do not leak SQL, connection strings, provider responses or secrets.
    return json(res, error instanceof HttpError ? error.status : 500, {
      ...(error instanceof HttpError && error.code === "AI_INVALID_OUTPUT"
        ? { code: error.code }
        : {}),
      message:
        error instanceof HttpError
          ? error.message
          : "Server əməliyyatı tamamlanmadı. Bağlantını və miqrasiyanı yoxlayın.",
    });
  }
}
