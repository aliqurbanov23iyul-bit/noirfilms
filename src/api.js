let csrf = "";
export const capabilities = {
  runtime: false,
  database: false,
  auth: false,
  tmdb: false,
  ai: false,
};
export async function request(path, { method = "GET", data } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(65_000),
    });
  } catch {
    throw new Error("Serverə qoşulmaq mümkün olmadı. Bağlantını yoxlayın.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Bu nəşrdə Vercel server funksiyaları aktiv deyil.");
  }
  if (!response.ok)
    throw new Error(result.message || "Əməliyyat tamamlanmadı.");
  return result;
}
export async function loadCapabilities() {
  try {
    const data = await request("/api/status");
    Object.assign(capabilities, data, { runtime: true });
  } catch {
    Object.assign(capabilities, {
      runtime: false,
      database: false,
      auth: false,
      tmdb: false,
      ai: false,
    });
  }
  return capabilities;
}
export function setCSRF(value) {
  csrf = value || "";
}
