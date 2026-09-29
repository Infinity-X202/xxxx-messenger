import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { errors } from "../errors.js";
import { isLivecamAdmin } from "../lib/livecam.js";
import { env } from "../config.js";
import { logger } from "../logger.js";

function findRepoRoot() {
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 10; i++) {
      if (existsSync(path.join(dir, "apps", "server", "package.json")) && existsSync(path.join(dir, "apps", "web"))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

export type OtaMeta = {
  versionCode: number;
  versionName: string;
  notes: string;
  publishedAt: string;
  size: number;
};

function appDir() {
  return path.join(findRepoRoot(), "storage", "app");
}

function apkPath() {
  return path.join(appDir(), "infinity-x.apk");
}

function metaPath() {
  return path.join(appDir(), "ota.json");
}

export async function readOtaMeta(): Promise<OtaMeta | null> {
  try {
    const raw = await readFile(metaPath(), "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as OtaMeta;
  } catch (err) {
    logger.warn({ err, file: metaPath(), cwd: process.cwd() }, "ota_meta_unreadable");
    return null;
  }
}

export async function appOtaRoutes(app: FastifyInstance) {
  app.get("/latest", async () => {
    const meta = await readOtaMeta();
    if (!meta) return { available: false as const };
    return {
      available: true as const,
      versionCode: meta.versionCode,
      versionName: meta.versionName,
      notes: meta.notes,
      publishedAt: meta.publishedAt,
      size: meta.size,
      downloadUrl: "/api/v1/app/download",
    };
  });

  app.get("/download", async (_req, reply) => {
    const meta = await readOtaMeta();
    if (!meta) throw errors.notFound();
    const file = apkPath();
    reply.header("Content-Type", "application/vnd.android.package-archive");
    reply.header("Content-Disposition", `attachment; filename="InfinityX-${meta.versionName}.apk"`);
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Length", String(meta.size));
    return reply.send(createReadStream(file));
  });
}

export async function adminOtaRoutes(app: FastifyInstance) {
  app.get("/ota", { preHandler: [requireUser] }, async (req) => {
    const me = req as AuthedRequest;
    if (!isLivecamAdmin(me.user.username)) throw errors.forbidden();
    const meta = await readOtaMeta();
    return { ota: meta };
  });

  app.post("/ota", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = req as AuthedRequest;
    if (!isLivecamAdmin(me.user.username)) throw errors.forbidden();
    await mkdir(appDir(), { recursive: true });
    let versionCode = 0;
    let versionName = "";
    let notes = "";
    let gotFile = false;
    const parts = req.parts({ limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fieldSize: 200_000 } });
    for await (const part of parts) {
      if (part.type === "file") {
        const dest = createWriteStream(apkPath());
        await new Promise<void>((resolve, reject) => {
          part.file.pipe(dest);
          dest.on("finish", resolve);
          dest.on("error", reject);
          part.file.on("error", reject);
        });
        gotFile = true;
      } else {
        const v = String((part as { value?: unknown }).value ?? "");
        if (part.fieldname === "versionCode") versionCode = Number(v) || 0;
        if (part.fieldname === "versionName") versionName = v.trim().slice(0, 40);
        if (part.fieldname === "notes") notes = v.trim().slice(0, 2000);
      }
    }
    if (!gotFile) throw errors.validation("Serve il file APK");
    if (versionCode < 1) throw errors.validation("versionCode non valido");
    if (!versionName) versionName = String(versionCode);
    const st = await stat(apkPath());
    const meta: OtaMeta = {
      versionCode,
      versionName,
      notes: notes || "Nuovo aggiornamento Infinity X",
      publishedAt: new Date().toISOString(),
      size: st.size,
    };
    await writeFile(metaPath(), JSON.stringify(meta, null, 2), "utf8");
    return { ok: true, ota: meta };
  });
}
