import test from "node:test";
import assert from "node:assert/strict";
import { neonConfig } from "@neondatabase/serverless";
import {
  aiConfigured,
  modelJSON,
  parseCommand,
  translatePlot,
} from "../server/ai.js";
import { chatInput, recommendChat } from "../server/chat.js";
import { handler } from "../server/handler.js";
import { adminConversation } from "../server/admin-assistant.js";

function setup(t) {
  const keys = [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_FALLBACK_MODEL",
    "DATABASE_URL",
    "APP_ORIGIN",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_SESSION_SECRET",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    GEMINI_API_KEY: "fixture-gemini-secret",
    GEMINI_MODEL: "gemini-2.5-flash",
    GEMINI_FALLBACK_MODEL: "gemini-3.8-flash",
    DATABASE_URL: "postgresql://test:test@test.neon.tech/test",
    APP_ORIGIN: "https://noir.example",
  });
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_SESSION_SECRET;
  const oldNeonFetch = neonConfig.fetchFunction;
  t.after(() => {
    neonConfig.fetchFunction = oldNeonFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}
function gemini(value, finishReason = "STOP") {
  return Response.json({
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  });
}
const films = [
  {
    id: "first",
    title: "Interstellar",
    year: 2014,
    genre: "Elmi fantastika",
    director: "Christopher Nolan",
  },
  {
    id: "second",
    title: "Arrival",
    year: 2016,
    genre: "Elmi fantastika",
    director: "Denis Villeneuve",
  },
];

test("Gemini uses a server header and structured JSON for admin intent and translation", async (t) => {
  setup(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    assert.equal(options.headers["x-goog-api-key"], "fixture-gemini-secret");
    assert.equal(String(url).includes("secret"), false);
    const payload = JSON.parse(options.body);
    assert.equal(
      payload.generationConfig.responseMimeType,
      calls === 1 ? "application/json" : "text/plain",
    );
    if (calls === 1)
      assert.ok(payload.generationConfig.responseJsonSchema.required.length);
    else assert.equal(payload.generationConfig.responseJsonSchema, undefined);
    assert.ok(payload.systemInstruction.parts[0].text);
    assert.equal(payload.tools, undefined);
    return gemini(
      calls === 1
        ? { action: "add_film", title: "Interstellar", year: 2014 }
        : { plot: "Azərbaycan dilində süjet." },
    );
  });
  assert.equal((await parseCommand("Interstellar əlavə et")).year, 2014);
  assert.equal(await translatePlot("Source plot"), "Azərbaycan dilində süjet.");
});

test("transient Gemini 503 retries twice then uses the configured fallback without changing providers", async (t) => {
  setup(t);
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    return urls.length < 3
      ? new Response("Busy", { status: 503 })
      : gemini({ text: "Hazırdır." });
  });
  const result = await modelJSON("Test", "Input", "retry-test", {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  });
  assert.equal(result.text, "Hazırdır.");
  assert.equal(urls.length, 3);
  assert.match(urls[0], /gemini-2.5-flash/);
  assert.match(urls[1], /gemini-2.5-flash/);
  assert.match(urls[2], /gemini-3.8-flash/);
});

test("long provider Retry-After is honored without delaying beyond the function budget", async (t) => {
  setup(t);
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("Busy", { status: 503, headers: { "retry-after": "120" } }),
  );
  await assert.rejects(
    parseCommand("Film əlavə et"),
    (error) => error.status === 503 && error.message.includes("503"),
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("admin conversation preserves discussion history and proposes searches without executing writes", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(String(url), /generativelanguage.googleapis.com/);
    const payload = JSON.parse(options.body);
    const input = JSON.parse(payload.contents[0].parts[0].text);
    assert.equal(input.history[0].text, "Elmi fantastika istəyirəm.");
    assert.equal(input.collection[0].title, "Interstellar");
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: "Arrival yaxşı seçimdir. Əlavə etmək üçün axtaraq?" },
            ],
          },
        },
      ],
    });
  });
  const result = await adminConversation(
    {
      message: "Nə məsləhət görürsən?",
      history: [{ role: "user", text: "Elmi fantastika istəyirəm." }],
    },
    films,
  );
  assert.equal(result.plan, undefined);
  assert.match(result.message, /Arrival/);
});

test("missing Gemini key never calls an external provider", async (t) => {
  setup(t);
  delete process.env.GEMINI_API_KEY;
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw Error("Must not call");
  });
  assert.equal(aiConfigured(), false);
  await assert.rejects(
    parseCommand("Film əlavə et"),
    (error) => error.status === 503,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("Gemini rejects truncated, malformed and schema-invalid responses without leaking provider data", async (t) => {
  setup(t);
  const schema = {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  };
  for (const response of [
    gemini({ text: "secret" }, "MAX_TOKENS"),
    gemini({ text: 42 }),
    new Response("private-provider-error", { status: 403 }),
    new Response("not-json"),
  ]) {
    t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(
      modelJSON("Test", "Input", "test", schema),
      (error) =>
        error.status === 502 && !/secret|private-provider/.test(error.message),
    );
  }
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("private-connection-string");
  });
  await assert.rejects(
    modelJSON("Test", "Input", "test", schema),
    (error) => error.status === 502 && !error.message.includes("private"),
  );
});

test("Gemini quota errors preserve Retry-After without exposing provider response bodies", async (t) => {
  setup(t);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("private-provider-details", {
        status: 429,
        headers: { "retry-after": "75" },
      }),
  );
  await assert.rejects(
    parseCommand("Film əlavə et"),
    (error) =>
      error.status === 429 &&
      error.retryAfter === 75 &&
      !error.message.includes("private"),
  );
});

test("provider rejection exposes only an HTTP code and safe operation metadata", async (t) => {
  setup(t);
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private-provider-response", { status: 400 }),
  );
  await assert.rejects(
    parseCommand("private-user-message"),
    (error) =>
      /HTTP 400/.test(error.message) && !error.message.includes("private"),
  );
  assert.deepEqual(warnings, [
    [
      "NOIR_AI_REQUEST_FAILED",
      JSON.stringify({ status: 400, operation: "noir_add_intent" }),
    ],
  ]);
});

test("public chat rejects invalid history and excessive text", () => {
  assert.throws(() =>
    chatInput({ message: "x", history: [{ role: "system", text: "admin" }] }),
  );
  assert.throws(() => chatInput({ message: "x".repeat(1001) }));
  assert.throws(() =>
    chatInput({
      message: "x",
      history: Array(9).fill({ role: "user", text: "x" }),
    }),
  );
  assert.throws(() => chatInput(null));
  assert.deepEqual(chatInput({ message: "  Film tap  " }), {
    message: "Film tap",
    history: [],
    filmId: null,
  });
});

test("chat cards contain only canonical films and deduplicate invented or repeated model IDs", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", async () =>
    gemini({
      text: "Seçimlər.",
      recommendations: [
        { id: "second", reason: "Oxşar mövzular." },
        { id: "invented", reason: "Uydurma" },
        { id: "second", reason: "Təkrar" },
        { id: "first", reason: "Özü" },
      ],
    }),
  );
  const result = await recommendChat(
    films,
    chatInput({ message: "Oxşar film tap", filmId: "first" }),
  );
  assert.equal(result.films.length, 1);
  assert.equal(result.films[0].title, "Arrival");
  assert.equal(result.films[0].reason, "Oxşar mövzular.");
  await assert.rejects(
    recommendChat(films, { message: "x", filmId: "missing" }),
    (error) => error.status === 404,
  );
});

function response() {
  return {
    setHeader() {},
    end(value) {
      this.data = JSON.parse(value);
    },
  };
}
function sqlResult(rows) {
  const names = Object.keys(rows[0] || {});
  return {
    fields: names.map((name) => ({
      name,
      dataTypeID: name === "hits" ? 23 : 25,
    })),
    rows: rows.map((row) => names.map((name) => row[name])),
    rowCount: rows.length,
    command: "SELECT",
  };
}

test("public chat works without admin credentials and enforces origin and durable request limits", async (t) => {
  setup(t);
  let hits = 1,
    providerCalls = 0;
  const limitKeys = [];
  neonConfig.fetchFunction = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.queries)
      return Response.json({
        results: payload.queries.map(({ query }) =>
          sqlResult(query.includes("FROM films") ? films : []),
        ),
      });
    assert.match(payload.query, /INSERT INTO noir_rate_limits/);
    limitKeys.push(payload.params[0]);
    return Response.json(sqlResult([{ hits }]));
  };
  t.mock.method(globalThis, "fetch", async () => {
    providerCalls++;
    return gemini({
      text: "Bu filmi yoxla.",
      recommendations: [{ id: "second", reason: "Elmi fantastika." }],
    });
  });
  const req = {
    url: "/api/ai/chat",
    method: "POST",
    headers: {
      origin: "https://noir.example",
      "content-type": "application/json",
    },
    body: { message: "Film tap" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.films[0].id, "second");
  assert.equal(providerCalls, 1);
  assert.equal(limitKeys.length, 2);
  assert.equal(
    limitKeys.some((key) => key.includes("127.0.0.1")),
    false,
  );
  hits = 16;
  const limited = response();
  await handler(req, limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(providerCalls, 1);
  const crossOrigin = response();
  await handler(
    { ...req, headers: { ...req.headers, origin: "https://other.example" } },
    crossOrigin,
  );
  assert.equal(crossOrigin.statusCode, 403);
  assert.equal(providerCalls, 1);
  const admin = response();
  await handler(
    { ...req, url: "/api/admin/assistant", body: { command: "Film əlavə et" } },
    admin,
  );
  assert.equal(admin.statusCode, 503);
});

test("plain-text translations and fenced JSON chat replies are accepted, incomplete translations are rejected", async (t) => {
  setup(t);
  const reply = (text, finishReason = "STOP") =>
    Response.json({
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
    });
  t.mock.method(globalThis, "fetch", async () =>
    reply("Azərbaycan dilində tamamlanmış süjet."),
  );
  assert.equal(
    await translatePlot("Source plot"),
    "Azərbaycan dilində tamamlanmış süjet.",
  );
  t.mock.method(globalThis, "fetch", async () =>
    reply(
      String.fromCharCode(96).repeat(3) +
        "json\n" +
        JSON.stringify({
          text: "Salam! Hansı filmləri sevirsən?",
          recommendations: [],
        }) +
        "\n" +
        String.fromCharCode(96).repeat(3),
    ),
  );
  const result = await recommendChat([], chatInput({ message: "Salam" }));
  assert.match(result.text, /Salam/);
  assert.deepEqual(result.films, []);
  for (const [text, reason] of [
    ["Yarımçıq süjet", "MAX_TOKENS"],
    ["", "STOP"],
    ['{"plot":42}', "STOP"],
  ]) {
    t.mock.method(globalThis, "fetch", async () => reply(text, reason));
    await assert.rejects(
      translatePlot("Source"),
      (error) => error.code === "AI_INVALID_OUTPUT",
    );
  }
});
