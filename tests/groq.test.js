import test from "node:test";
import assert from "node:assert/strict";
import {
  aiConfigured,
  aiProvider,
  modelJSON,
  translatePlot,
} from "../server/ai.js";
import { catalogContext } from "../server/catalog-context.js";

function setup(t) {
  const keys = ["GROQ_API_KEY", "GROQ_MODEL", "AI_PROVIDER", "GEMINI_API_KEY"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.GROQ_API_KEY = "fixture-groq-secret";
  process.env.GEMINI_API_KEY = "fixture-unused-gemini";
  delete process.env.AI_PROVIDER;
  delete process.env.GROQ_MODEL;
  t.after(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}
const schema = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
};
const reply = (content, finish_reason = "stop") =>
  Response.json({ choices: [{ finish_reason, message: { content } }] });

test("Groq key takes precedence; JSON replies are validated and translation uses text", async (t) => {
  setup(t);
  assert.equal(aiProvider(), "groq");
  assert.equal(aiConfigured(), true);
  let count = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    count++;
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer fixture-groq-secret");
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, "qwen/qwen3.8-27b");
    assert.equal(payload.reasoning_effort, "none");
    assert.equal(options.body.includes("fixture-"), false);
    if (count === 1) {
      assert.equal(payload.response_format.type, "json_object");
      assert.match(payload.messages[0].content, /JSON schema/);
      return reply('{"text":"Salam!"}');
    }
    assert.equal(payload.response_format, undefined);
    return reply("Azərbaycan dilində süjet.");
  });
  assert.equal(
    (await modelJSON("Test", "Input", "test", schema)).text,
    "Salam!",
  );
  assert.equal(await translatePlot("Source"), "Azərbaycan dilində süjet.");
});

test("Groq rejects truncated and invalid output; quota and credentials never retry or switch providers", async (t) => {
  setup(t);
  for (const make of [
    () => reply('{"text":"secret"}', "length"),
    () => reply('{"text":42}'),
    () => reply("not-json"),
  ]) {
    t.mock.method(globalThis, "fetch", async () => make());
    await assert.rejects(
      modelJSON("Test", "Input", "test", schema),
      (e) => e.code === "AI_INVALID_OUTPUT",
    );
  }
  for (const status of [429, 401, 403, 400, 404]) {
    const fetch = t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response("private-provider-body", {
          status,
          headers: { "retry-after": "75" },
        }),
    );
    await assert.rejects(
      modelJSON("Test", "Input", "test", schema),
      (e) =>
        e.status === (status === 429 ? 429 : 502) &&
        !e.message.includes("private") &&
        (status !== 429 || e.retryAfter === 75),
    );
    assert.equal(fetch.mock.callCount(), 1);
  }
  process.env.AI_PROVIDER = "groq";
  delete process.env.GROQ_API_KEY;
  assert.equal(aiConfigured(), false);
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw Error("must not call Gemini");
  });
  await assert.rejects(
    modelJSON("Test", "Input", "test", schema),
    (e) => e.status === 503,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("Groq transient retry stays on Groq and respects a long Retry-After", async (t) => {
  setup(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(url, /api.groq.com/);
    calls++;
    return calls === 1
      ? new Response("busy", { status: 503 })
      : reply('{"text":"Hazırdır"}');
  });
  assert.equal(
    (await modelJSON("Test", "Input", "test", schema)).text,
    "Hazırdır",
  );
  assert.equal(calls, 2);
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("busy", { status: 503, headers: { "retry-after": "120" } }),
  );
  await assert.rejects(
    modelJSON("Test", "Input", "test", schema),
    (e) => e.status === 503,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("compact catalogue finds relevant films beyond the first page", () => {
  const films = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    title: "Film " + i,
    genre: "Dram",
  }));
  films[499] = { id: "499", title: "Arrival", genre: "Elmi fantastika" };
  const selected = catalogContext(films, {
    message: "Arrival kimi fantastika",
    history: [],
  });
  assert.equal(selected.length, 20);
  assert.equal(selected[0].id, "499");
});
