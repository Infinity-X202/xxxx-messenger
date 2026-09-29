import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "../src/lib/rate-limit.js";

const run = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!run)("redis rate limit", () => {
  it("blocks after max", async () => {
    const key = `test:${Date.now()}`;
    const a = await consumeRateLimit({ key, max: 2, windowSeconds: 30 });
    const b = await consumeRateLimit({ key, max: 2, windowSeconds: 30 });
    const c = await consumeRateLimit({ key, max: 2, windowSeconds: 30 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
  });
});
