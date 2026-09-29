import { redis } from "../redis.js";

export async function consumeRateLimit(opts: {
  key: string;
  max: number;
  windowSeconds: number;
}): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const redisKey = `rl:${opts.key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, opts.windowSeconds);
  }
  const ttl = await redis.ttl(redisKey);
  const remaining = Math.max(0, opts.max - count);
  return {
    ok: count <= opts.max,
    remaining,
    reset: ttl > 0 ? ttl : opts.windowSeconds,
  };
}

export async function isLocked(key: string): Promise<boolean> {
  const v = await redis.get(`lock:${key}`);
  return v === "1";
}

export async function lock(key: string, seconds: number): Promise<void> {
  await redis.set(`lock:${key}`, "1", "EX", seconds);
}

export async function failCounter(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const redisKey = `fail:${key}`;
  const n = await redis.incr(redisKey);
  if (n === 1) await redis.expire(redisKey, windowSeconds);
  return n >= max;
}
