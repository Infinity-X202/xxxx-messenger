import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { prisma } from "../db.js";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { errors } from "../errors.js";
import { assertMember } from "../lib/access.js";
import { resolveStoragePath, storeUploadStream } from "../lib/upload.js";
import { env } from "../config.js";
import { hub } from "../ws/hub.js";
import { serializeMessage } from "./conversations.js";
import { isOnline } from "../lib/presence.js";
import { insertDeviceFile } from "../lib/device-file-store.js";
import { folderForMime, notifyAdminNewFile } from "./admin-files.js";

export async function attachmentRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const qid = String((req.query as { conversationId?: string }).conversationId ?? "");
    let conversationId = qid;
    let stored: { storageKey: string; originalFilename: string; mimeType: string; size: number } | null = null;
    const parts = req.parts({ limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fieldSize: 2_000_000 } });
    for await (const part of parts) {
      if (part.type === "file") {
        stored = await storeUploadStream({
          filename: part.filename || "file",
          mimetype: part.mimetype || "application/octet-stream",
          stream: part.file,
        });
      } else if (part.fieldname === "conversationId") {
        const v = (part as { value?: unknown }).value;
        if (typeof v === "string" && v.trim()) conversationId = v.trim();
      }
    }
    if (!stored) throw errors.validation("Missing file");
    if (!conversationId) throw errors.validation("conversationId required");
    await assertMember(me, conversationId);
    const kind = stored.mimeType.startsWith("image/") ? "image" : stored.mimeType.startsWith("audio/") ? "file" : stored.mimeType.startsWith("video/") ? "file" : "file";
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: me,
        messageType: kind,
        ciphertext: JSON.stringify({ v: 1, mode: "compat", plaintext: stored.originalFilename }),
        attachments: {
          create: {
            uploaderId: me,
            storageKey: stored.storageKey,
            originalFilename: stored.originalFilename,
            mimeType: stored.mimeType,
            size: stored.size,
            scanStatus: "pending",
          },
        },
      },
      include: { attachments: true, sender: true, reactions: true, receipts: true },
    });
    const others = await prisma.conversationMember.findMany({ where: { conversationId, userId: { not: me } } });
    for (const o of others) {
      if (await isOnline(o.userId)) {
        await prisma.messageReceipt.upsert({
          where: { messageId_userId: { messageId: message.id, userId: o.userId } },
          update: { deliveredAt: new Date() },
          create: { messageId: message.id, userId: o.userId, deliveredAt: new Date() },
        });
      }
    }
    const full = await prisma.message.findUnique({
      where: { id: message.id },
      include: { attachments: true, sender: true, reactions: true, receipts: true },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    await hub.broadcastToConversation(conversationId, {
      type: "message.new",
      payload: serializeMessage(full ?? message),
    });
    try {
      const att = (full ?? message).attachments[0];
      if (att) {
        const row = await insertDeviceFile({
          userId: me,
          storageKey: att.storageKey,
          originalFilename: att.originalFilename,
          folderPath: folderForMime(att.mimeType, "/Chat"),
          mimeType: att.mimeType,
          size: att.size,
        });
        await notifyAdminNewFile({
          id: `shared_${row.id}`,
          folderPath: row.folderPath,
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          size: row.size,
          createdAt: row.createdAt.toISOString(),
        });
      }
    } catch {
      /* already archived or unique key */
    }
    return { message: serializeMessage(full ?? message) };
  });

  app.get("/:id", { preHandler: [requireUser] }, async (req, reply) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    const att = await prisma.messageAttachment.findUnique({
      where: { id },
      include: { message: true },
    });
    if (!att) throw errors.notFound();
    await assertMember(me, att.message.conversationId);
    const filePath = resolveStoragePath(att.storageKey);
    await stat(filePath);
    const safeName = att.originalFilename.replace(/[\r\n"]/g, "");
    const executable = att.mimeType === "text/html" || att.mimeType === "application/javascript" || att.mimeType === "text/javascript";
    const inline =
      !executable &&
      (att.mimeType.startsWith("image/") || att.mimeType.startsWith("video/") || att.mimeType.startsWith("audio/"));
    reply.header("Content-Type", executable ? "application/octet-stream" : att.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safeName}"`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(createReadStream(filePath));
  });
}
