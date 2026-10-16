import { HttpError } from "./http.js";

export async function generateGemini(instructions, input, name, schema) {
  const primary = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const fallback = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.8-flash";
  if (
    ![primary, ...(fallback ? [fallback] : [])].every((model) =>
      /^gemini-[a-z\d.-]{1,64}$/.test(model),
    )
  )
    throw new HttpError(
      503,
      "Gemini model ayarı yanlışdır. Admin panelində bağlantını yoxlayın.",
    );
  const models = [
    primary,
    primary,
    ...(fallback && fallback !== primary ? [fallback] : []),
  ];
  const deadline = Date.now() + 42_000;
  let response;
  for (let attempt = 0; attempt < models.length; attempt++) {
    if (attempt) {
      const suggested = Number(response?.headers.get("retry-after"));
      const delay =
        Number.isFinite(suggested) && suggested > 0
          ? suggested * 1000
          : 1000 * 2 ** (attempt - 1);
      if (Date.now() + delay + 1000 >= deadline) break;
      await response?.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[attempt])}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": process.env.GEMINI_API_KEY,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(12_000, deadline - Date.now())),
          ),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: "user", parts: [{ text: input }] }],
            generationConfig: {
              responseMimeType: schema ? "application/json" : "text/plain",
              ...(schema ? { responseJsonSchema: schema } : {}),
              maxOutputTokens: 4096,
            },
          }),
        },
      );
      // Quotas, credentials and invalid requests are not retried or routed around.
      if (![500, 502, 503, 504].includes(response.status)) return response;
    } catch {
      response = undefined;
    }
  }
  if (response) return response;
  throw new HttpError(
    502,
    "Gemini bağlantısı alınmadı. Bir qədər sonra yenidən cəhd edin.",
  );
}
