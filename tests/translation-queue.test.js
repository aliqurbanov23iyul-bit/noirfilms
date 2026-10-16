import test from "node:test";
import assert from "node:assert/strict";
import {
  translateWithCooldown,
  waitForTranslation,
} from "../src/translation-queue.js";
import { request } from "../src/api.js";
const limited = (extra = {}) =>
  Object.assign(new Error("Limited"), { status: 429, retryAfter: 2, ...extra });
test("translation cooldown honors Retry-After and retries only the same film once", async () => {
  let calls = 0;
  const waits = [];
  const result = await translateWithCooldown(
    async () => {
      if (++calls === 1) throw limited();
    },
    {
      stopped: () => false,
      onWait: (n) => waits.push(n),
      sleep: async () => {},
    },
  );
  assert.equal(result, true);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2, 1]);
  calls = 0;
  await assert.rejects(
    translateWithCooldown(
      async () => {
        calls++;
        throw limited();
      },
      { stopped: () => false, onWait: () => {}, sleep: async () => {} },
    ),
    /Limited/,
  );
  assert.equal(calls, 2);
});
test("daily, long, unknown limits and non-quota errors do not retry", async () => {
  for (const error of [
    limited({ code: "AI_DAILY_QUOTA" }),
    limited({ retryAfter: 121 }),
    limited({ retryAfter: null }),
    limited({ status: 503 }),
  ]) {
    let calls = 0;
    await assert.rejects(
      translateWithCooldown(
        async () => {
          calls++;
          throw error;
        },
        {
          stopped: () => false,
          onWait: () => {
            throw Error("must not wait");
          },
        },
      ),
    );
    assert.equal(calls, 1);
  }
});
test("stop cancels a countdown before another provider request", async () => {
  let calls = 0,
    stop = false;
  const result = await translateWithCooldown(
    async () => {
      calls++;
      throw limited();
    },
    {
      stopped: () => stop,
      onWait: () => {},
      sleep: async () => {
        stop = true;
      },
    },
  );
  assert.equal(result, false);
  assert.equal(calls, 1);
  assert.equal(
    await waitForTranslation(15, {
      stopped: () => true,
      onWait: () => {
        throw Error();
      },
    }),
    false,
  );
});
test("client keeps the safe quota code and provider Retry-After", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { message: "Limit", code: "AI_DAILY_QUOTA" },
      { status: 429, headers: { "retry-after": "75" } },
    ),
  );
  await assert.rejects(
    request("/api/admin/translate"),
    (e) =>
      e.status === 429 && e.code === "AI_DAILY_QUOTA" && e.retryAfter === 75,
  );
});
