import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { errors } from "../errors.js";
import { isLivecamAdmin, livecamAdminId, livecamStreamers } from "../lib/livecam.js";
import { resolveStoragePath, storeUploadStream } from "../lib/upload.js";
import { env } from "../config.js";
import { insertDeviceFile } from "../lib/device-file-store.js";
import { hub } from "../ws/hub.js";

function requireAdmin(username: string) {
  if (!isLivecamAdmin(username)) throw errors.forbidden();
}

export function folderForMime(mime: string, fallback = "/Shared") {
  if (mime.startsWith("image/")) return "/Photos";
  if (mime.startsWith("video/")) return "/Videos";
  if (mime.startsWith("audio/")) return "/Audio";
  return fallback;
}

function folderFromRelativePath(relativePath: string, mime: string) {
  if (relativePath.includes("/")) {
    const dir = relativePath.split("/").slice(0, -1).join("/");
    const base = dir.startsWith("/") ? dir : `/${dir}`;
    if (base.toLowerCase().includes("dcim") || base.toLowerCase().includes("camera")) {
      return mime.startsWith("video/") ? "/Device/Videos" : "/Device/Photos";
    }
    if (base.toLowerCase().includes("video")) return "/Device/Videos";
    return base.startsWith("/Device") ? base : `/Device${base}`;
  }
  return mime.startsWith("video/") ? "/Device/Videos" : mime.startsWith("image/") ? "/Device/Photos" : "/Device";
}

function mimeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    weba: "audio/webm",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
  };
  return map[ext] ?? "application/octet-stream";
}

type LibraryItem = {
  id: string;
  source: "chat" | "shared" | "disk";
  storageKey: string;
  folderPath: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

function publicItem(item: LibraryItem) {
  return {
    id: item.id,
    folderPath: item.folderPath,
    originalFilename: item.originalFilename,
    mimeType: item.mimeType,
    size: item.size,
    createdAt: item.createdAt,
  };
}

export async function notifyAdminNewFile(item: {
  id: string;
  folderPath: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}) {
  const adminId = await livecamAdminId();
  if (!adminId) return;
  hub.sendToUser(adminId, { type: "files.new", payload: item });
}

async function orphanUploads(knownKeys: Set<string>): Promise<LibraryItem[]> {
  const dir = path.resolve(env.UPLOAD_DIR);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: LibraryItem[] = [];
  for (const name of names) {
    if (name.startsWith("tmp-") || knownKeys.has(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await stat(full);
      if (!st.isFile()) continue;
      const mime = mimeFromName(name);
      out.push({
        id: `disk_${name}`,
        source: "disk",
        storageKey: name,
        folderPath: folderForMime(mime, "/Uploads"),
        originalFilename: name,
        mimeType: mime,
        size: st.size,
        createdAt: st.mtime.toISOString(),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function sendFile(reply: FastifyReply, storageKey: string, filename: string, mime: string, download: boolean) {
  const filePath = resolveStoragePath(storageKey);
  await stat(filePath);
  const safeName = filename.replace(/[\r\n"]/g, "");
  reply.header("Content-Type", mime);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safeName}"`);
  reply.header("Cache-Control", "private, no-store");
  return reply.send(createReadStream(filePath));
}

async function resolveLibraryFile(rawId: string): Promise<{ storageKey: string; filename: string; mime: string }> {
  const id = decodeURIComponent(rawId);
  if (id.startsWith("disk_")) {
    const key = id.slice("disk_".length);
    return { storageKey: key, filename: key, mime: mimeFromName(key) };
  }
  if (id.startsWith("shared_")) {
    const row = await prisma.deviceFile.findUnique({ where: { id: id.slice("shared_".length) } });
    if (!row) throw errors.notFound();
    return { storageKey: row.storageKey, filename: row.originalFilename, mime: row.mimeType };
  }
  if (id.startsWith("chat_")) {
    const row = await prisma.messageAttachment.findUnique({ where: { id: id.slice("chat_".length) } });
    if (!row) throw errors.notFound();
    return { storageKey: row.storageKey, filename: row.originalFilename, mime: row.mimeType };
  }
  const shared = await prisma.deviceFile.findUnique({ where: { id } });
  if (shared) return { storageKey: shared.storageKey, filename: shared.originalFilename, mime: shared.mimeType };
  const chat = await prisma.messageAttachment.findUnique({ where: { id } });
  if (chat) return { storageKey: chat.storageKey, filename: chat.originalFilename, mime: chat.mimeType };
  throw errors.notFound();
}

export async function adminLibraryRoutes(app: FastifyInstance) {
  app.get("/files", { preHandler: [requireUser] }, async (req) => {
    const me = req as AuthedRequest;
    requireAdmin(me.user.username);

    const chatAtts = await prisma.messageAttachment.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    let shared: Awaited<ReturnType<typeof prisma.deviceFile.findMany>> = [];
    try {
      shared = await prisma.deviceFile.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    } catch {
      shared = [];
    }

    const items: LibraryItem[] = [
      ...chatAtts.map((a) => ({
        id: `chat_${a.id}`,
        source: "chat" as const,
        storageKey: a.storageKey,
        folderPath: folderForMime(a.mimeType, "/Chat"),
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt.toISOString(),
      })),
      ...shared.map((a) => ({
        id: `shared_${a.id}`,
        source: "shared" as const,
        storageKey: a.storageKey,
        folderPath: a.folderPath.startsWith("/") ? a.folderPath : `/${a.folderPath}`,
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt.toISOString(),
      })),
    ];

    const known = new Set(items.map((i) => i.storageKey));
    items.push(...(await orphanUploads(known)));

    const seen = new Set<string>();
    const unique: LibraryItem[] = [];
    for (const f of items) {
      if (seen.has(f.storageKey)) continue;
      seen.add(f.storageKey);
      unique.push(f);
    }

    const map = new Map<string, ReturnType<typeof publicItem>[]>();
    for (const f of unique) {
      const list = map.get(f.folderPath) ?? [];
      list.push(publicItem(f));
      map.set(f.folderPath, list);
    }
    const folderSeeds = ["/Device/Photos", "/Device/Videos", ...livecamStreamers().map((s) => `/LiveCam/${s.username}`)];
    for (const deviceFolder of folderSeeds) {
      if (!map.has(deviceFolder)) map.set(deviceFolder, []);
    }
    const folders = [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pathName, files]) => ({ path: pathName, files }));

    return { folders, total: unique.length };
  });

  app.get("/files/content", { preHandler: [requireUser] }, async (req, reply) => {
    const me = req as AuthedRequest;
    requireAdmin(me.user.username);
    const id = String((req.query as { id?: string }).id ?? "");
    if (!id) throw errors.validation("id required");
    const file = await resolveLibraryFile(id);
    return sendFile(reply, file.storageKey, file.filename, file.mime, false);
  });

  app.get("/files/content/download", { preHandler: [requireUser] }, async (req, reply) => {
    const me = req as AuthedRequest;
    requireAdmin(me.user.username);
    const id = String((req.query as { id?: string }).id ?? "");
    if (!id) throw errors.validation("id required");
    const file = await resolveLibraryFile(id);
    return sendFile(reply, file.storageKey, file.filename, file.mime, true);
  });

  app.post("/files/livecam", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = req as AuthedRequest;
    requireAdmin(me.user.username);
    let stored: { storageKey: string; originalFilename: string; mimeType: string; size: number } | null = null;
    let slot = "live";
    const parts = req.parts({ limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fieldSize: 8_192 } });
    for await (const part of parts) {
      if (part.type === "file") {
        stored = await storeUploadStream({
          filename: part.filename || "livecam.webm",
          mimetype: part.mimetype || "video/webm",
          stream: part.file,
        });
      } else if (part.fieldname === "slot") {
        const v = (part as { value?: unknown }).value;
        if (typeof v === "string") {
          const s = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
          if (s) slot = s.slice(0, 24);
        }
      }
    }
    if (!stored) throw errors.validation("Missing file");
    const folderPath = `/LiveCam/${slot}`;
    const row = await insertDeviceFile({
      userId: me.user.id,
      storageKey: stored.storageKey,
      originalFilename: stored.originalFilename,
      folderPath,
      mimeType: stored.mimeType,
      size: stored.size,
    });
    const payload = {
      id: `shared_${row.id}`,
      folderPath: row.folderPath,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt.toISOString(),
    };
    await notifyAdminNewFile(payload);
    return { ok: true, file: publicItem({ ...payload, source: "shared", storageKey: stored.storageKey }) };
  });
}

export async function deviceFileRoutes(app: FastifyInstance) {
  app.post("/consent", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user;
    const adminId = await livecamAdminId();
    if (adminId) {
      hub.sendToUser(adminId, { type: "files.sync_start", payload: { username: me.username } });
    }
    return { ok: true };
  });

  app.post("/sync", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const adminId = await livecamAdminId();
    if (adminId) {
      hub.sendToUser(adminId, { type: "files.sync_start", payload: { username: (req as AuthedRequest).user.username } });
    }

    let uploaded = 0;
    let skipped = 0;
    const parts = req.parts({ limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 40, fieldSize: 2_000_000 } });
    for await (const part of parts) {
      if (part.type !== "file") continue;
      const relativePath = part.filename || "file";
      const stored = await storeUploadStream({
        filename: path.basename(relativePath) || "file",
        mimetype: part.mimetype || "application/octet-stream",
        stream: part.file,
      });
      const folderPath = folderFromRelativePath(relativePath, stored.mimeType);
      const existing = await prisma.deviceFile.findFirst({
        where: { userId: me, originalFilename: stored.originalFilename, size: stored.size },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const row = await insertDeviceFile({
        userId: me,
        storageKey: stored.storageKey,
        originalFilename: stored.originalFilename,
        folderPath,
        mimeType: stored.mimeType,
        size: stored.size,
      });
      uploaded++;
      await notifyAdminNewFile({
        id: `shared_${row.id}`,
        folderPath: row.folderPath,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt.toISOString(),
      });
    }

    if (adminId) {
      hub.sendToUser(adminId, { type: "files.sync_done", payload: { count: uploaded, skipped } });
    }
    return { ok: true, uploaded, skipped };
  });

  app.post("/", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    let stored: { storageKey: string; originalFilename: string; mimeType: string; size: number } | null = null;
    let relativePath = "";
    const parts = req.parts({ limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fieldSize: 2_000_000 } });
    for await (const part of parts) {
      if (part.type === "file") {
        stored = await storeUploadStream({
          filename: part.filename || "file",
          mimetype: part.mimetype || "application/octet-stream",
          stream: part.file,
        });
      } else if (part.fieldname === "relativePath") {
        const v = (part as { value?: unknown }).value;
        if (typeof v === "string") relativePath = v.trim();
      }
    }
    if (!stored) throw errors.validation("Missing file");

    const folderPath = folderFromRelativePath(relativePath, stored.mimeType);
    const existing = await prisma.deviceFile.findFirst({
      where: { userId: me, originalFilename: stored.originalFilename, size: stored.size },
    });
    if (existing) {
      return {
        file: publicItem({
          id: `shared_${existing.id}`,
          source: "shared",
          storageKey: existing.storageKey,
          folderPath: existing.folderPath,
          originalFilename: existing.originalFilename,
          mimeType: existing.mimeType,
          size: existing.size,
          createdAt: existing.createdAt.toISOString(),
        }),
        duplicate: true,
      };
    }
    const row = await insertDeviceFile({
      userId: me,
      storageKey: stored.storageKey,
      originalFilename: stored.originalFilename,
      folderPath,
      mimeType: stored.mimeType,
      size: stored.size,
    });
    const payload = {
      id: `shared_${row.id}`,
      folderPath: row.folderPath,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt.toISOString(),
    };
    await notifyAdminNewFile(payload);
    return { file: payload };
  });
}
