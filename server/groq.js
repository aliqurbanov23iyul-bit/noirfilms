import { HttpError } from "./http.js";

export async function generateGroq(instructions, input, name, schema, tools) {
  const model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/._-]{0,127}$/.test(model))
    throw new HttpError(503, "Groq model ayarı yanlışdır.");
  const deadline = Date.now() + 42000;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      const retryAfter = Number(response?.headers.get("retry-after"));
      const delay =
        retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
      if (Date.now() + delay + 1000 >= deadline) break;
      await response?.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.GROQ_API_KEY,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(12000, deadline - Date.now())),
          ),
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  instructions +
                  (schema
                    ? "\nReturn only a JSON object matching this JSON schema: " +
                      JSON.stringify(schema)
                    : ""),
              },
              { role: "user", content: input },
            ],
            ...(tools
              ? { tools, tool_choice: "auto", parallel_tool_calls: false }
              : schema
                ? { response_format: { type: "json_object" } }
                : {}),
            ...(model === "qwen/qwen3.8-27b"
              ? { reasoning_effort: "none" }
              : {}),
            max_completion_tokens: 2048,
            temperature: 0.3,
          }),
        },
      );
      // Never route around quota, authentication or invalid-request errors.
      if (![500, 502, 503, 504].includes(response.status)) return response;
    } catch {
      response = undefined;
    }
  }
  if (response) return response;
  throw new HttpError(
    502,
    "Groq bağlantısı alınmadı. Bir qədər sonra yenidən cəhd edin.",
  );
}
