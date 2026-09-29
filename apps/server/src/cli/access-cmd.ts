import { prisma } from "../db.js";
import { addAccess, listAccess, removeAccess } from "../lib/access-store.js";
import { builtinIdentities, ensureAccessUsers } from "../lib/identities.js";

const [cmd, a = "", b = ""] = process.argv.slice(2);

try {
  if (cmd === "list") {
    console.log(JSON.stringify(listAccess(builtinIdentities())));
  } else if (cmd === "add") {
    addAccess(builtinIdentities(), a, b);
    try {
      await ensureAccessUsers();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
    console.log(JSON.stringify(listAccess(builtinIdentities())));
  } else if (cmd === "remove") {
    removeAccess(builtinIdentities(), a);
    try {
      await ensureAccessUsers();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
    console.log(JSON.stringify(listAccess(builtinIdentities())));
  } else {
    console.error("use list | add <name> <code> | remove <username>");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
