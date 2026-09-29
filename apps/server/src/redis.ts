import { Redis } from "ioredis";
import { env } from "./config.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err: Error) => {
  logger.error({ err }, "redis_error");
});
