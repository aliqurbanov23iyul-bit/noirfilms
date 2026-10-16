import { handler } from "../server/handler.js";
import { json } from "../server/http.js";

export default async function noirAPI(req, res) {
  const url = new URL(req.url, "http://localhost");
  // Depending on the runtime, a rewrite can retain the original URL or expose
  // its destination. Support both without relying on Next.js catch-all routes.
  if (["/api", "/api/", "/api/index", "/api/index.js"].includes(url.pathname)) {
    const route =
      req.query?.__noir_route ?? url.searchParams.get("__noir_route");
    if (
      typeof route !== "string" ||
      !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/.test(route)
    ) {
      return json(res, 404, { message: "Sorğu yolu tapılmadı." });
    }
    req.url = `/api/${route}`;
  }
  return handler(req, res);
}
