import { ensureDatabase, ensureDatabaseMigrated, ensureRedis } from "../apps/desktop/control.mjs";

try {
  await ensureDatabase();
  await ensureRedis();
  await ensureDatabaseMigrated();
  console.log("OK");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
