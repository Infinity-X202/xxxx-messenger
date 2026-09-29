import { buildApp } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { logger } from "./logger.js";
import { ensureAccessUsers } from "./lib/identities.js";

const app = await buildApp();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  let last: unknown;
  for (let i = 0; i < 30; i++) {
    try {
      await redis.ping();
      await prisma.$queryRaw`SELECT 1`;
      last = null;
      break;
    } catch (err) {
      last = err;
      logger.warn({ err, attempt: i + 1 }, "waiting_for_db_redis");
      await sleep(1000);
    }
  }
  if (last) throw last;
  await ensureAccessUsers();
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT }, "infinity_x_started");
} catch (err) {
  logger.error({ err }, "startup_failed");
  process.exit(1);
}

async function shutdown() {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => logger.error({ err }, "uncaught"));
process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled"));
