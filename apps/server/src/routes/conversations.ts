import type { FastifyInstance } from "fastify";
import { createDirectConversationSchema, createGroupConversationSchema, cursorQuerySchema, sendMessageSchema, editMessageSchema, reactionSchema } from "@ixm/shared";
import { prisma } from "../db.js";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { errors } from "../errors.js";
import { assertMember, isBlockedEither } from "../lib/access.js";
import { publicUser } from "../lib/crypto.js";
import { isOnline } from "../lib/presence.js";
import { hub } from "../ws/hub.js";
import { env } from "../config.js";
import { consumeRateLimit } from "../lib/rate-limit.js";

const HIDDEN = new Date("2099-01-01T00:00:00.000Z");

function isHidden(mutedUntil: Date | null | undefined) {
  return Boolean(mutedUntil && mutedUntil.getTime() >= HIDDEN.getTime());
}

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: me },
      include: {
        conversation: {
          include: {
            members: { include: { user: true } },
            messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
    });
    const items = await Promise.all(
      memberships
        .filter((m) => !isHidden(m.mutedUntil))
        .map(async (m) => {
        const others = m.conversation.members.filter((x) => x.userId !== me);
        const last = m.conversation.messages[0] ?? null;
        let after: Date | undefined;
        if (m.lastReadMessageId) {
          const read = await prisma.message.findUnique({ where: { id: m.lastReadMessageId } });
          after = read?.createdAt;
        }
        const unread = await prisma.message.count({
          where: {
            conversationId: m.conversationId,
            deletedAt: null,
            senderId: { not: me },
            ...(after ? { createdAt: { gt: after } } : {}),
          },
        });
        return {
          id: m.conversation.id,
          type: m.conversation.type,
          title: m.conversation.title,
          updatedAt: m.conversation.updatedAt,
          unread,
          lastMessage: last
            ? {
                id: last.id,
                senderId: last.senderId,
                createdAt: last.createdAt,
                messageType: last.messageType,
                deletedAt: last.deletedAt,
                ciphertext: last.deletedAt ? "" : last.ciphertext,
              }
            : null,
          members: await Promise.all(
            others.map(async (o) => ({
              ...publicUser(o.user),
              online: await isOnline(o.userId),
              lastSeen: o.user.lastSeen,
              role: o.role,
            })),
          ),
        };
      }),
    );
    return { conversations: items };
  });

  app.post("/direct", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { userId } = createDirectConversationSchema.parse(req.body);
    if (userId === me) throw errors.validation();
    if (await isBlockedEither(me, userId)) throw errors.forbidden("User unavailable");
    const other = await prisma.user.findUnique({ where: { id: userId } });
    if (!other || other.status === "disabled") throw errors.notFound();

    const existing = await prisma.conversation.findFirst({
      where: {
        type: "direct",
        AND: [{ members: { some: { userId: me } } }, { members: { some: { userId } } }],
      },
      include: { members: true },
    });
    if (existing && existing.members.length === 2) {
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: existing.id, userId: me } },
        data: { mutedUntil: null },
      });
      return { conversation: { id: existing.id, type: existing.type } };
    }
    const conversation = await prisma.conversation.create({
      data: {
        type: "direct",
        members: {
          create: [
            { userId: me, role: "owner" },
            { userId, role: "member" },
          ],
        },
      },
    });
    return { conversation: { id: conversation.id, type: conversation.type } };
  });

  app.post("/group", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const body = createGroupConversationSchema.parse(req.body);
    const ids = [...new Set([me, ...body.userIds])];
    if (ids.length < 2) throw errors.validation("Serve almeno un’altra persona");
    const users = await prisma.user.findMany({ where: { id: { in: ids }, status: { not: "disabled" } } });
    if (users.length !== ids.length) throw errors.notFound();
    for (const id of ids) {
      if (id !== me && (await isBlockedEither(me, id))) throw errors.forbidden("User unavailable");
    }
    const conversation = await prisma.conversation.create({
      data: {
        type: "group",
        title: body.title,
        members: {
          create: ids.map((userId) => ({ userId, role: userId === me ? "owner" : "member" })),
        },
      },
    });
    return { conversation: { id: conversation.id, type: conversation.type, title: conversation.title } };
  });

  app.get("/search", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const q = String((req.query as { q?: string }).q ?? "").trim();
    if (q.length < 1) return { conversations: [] };
    const memberships = await prisma.conversationMember.findMany({
      where: {
        userId: me,
        conversation: {
          members: {
            some: {
              user: {
                OR: [
                  { username: { contains: q, mode: "insensitive" } },
                  { displayName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      },
      include: { conversation: { include: { members: { include: { user: true } } } } },
      take: 20,
    });
    return {
      conversations: memberships.map((m) => ({
        id: m.conversation.id,
        type: m.conversation.type,
        members: m.conversation.members.filter((x) => x.userId !== me).map((x) => publicUser(x.user)),
      })),
    };
  });

  app.get("/:id", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    await assertMember(me, id);
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    if (!conversation) throw errors.notFound();
    return {
      conversation: {
        id: conversation.id,
        type: conversation.type,
        title: conversation.title,
        members: await Promise.all(
          conversation.members.map(async (m) => ({
            ...publicUser(m.user),
            role: m.role,
            lastSeen: m.user.lastSeen,
            online: await isOnline(m.user.id),
          })),
        ),
      },
    };
  });

  app.delete("/:id", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    await assertMember(me, id);
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: { mutedUntil: HIDDEN },
    });
    return { ok: true };
  });

  app.get("/:id/devices", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    await assertMember(me, id);
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: id },
      select: { userId: true },
    });
    const devices = await prisma.device.findMany({
      where: { userId: { in: members.map((m) => m.userId) }, revokedAt: null },
      select: { id: true, userId: true, publicKey: true, deviceName: true },
    });
    return { devices };
  });

  app.get("/:id/messages", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    await assertMember(me, id);
    const q = cursorQuerySchema.parse(req.query);
    const limit = q.limit ?? 100;
    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        deletedAt: null,
        ...(q.cursor ? { createdAt: { lt: new Date(q.cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: {
        attachments: true,
        reactions: true,
        receipts: true,
        sender: true,
      },
    });
    const hasMore = messages.length > limit;
    const page = messages.slice(0, limit);
    return {
      messages: page.reverse().map(serializeMessage),
      nextCursor: hasMore ? page[0]?.createdAt.toISOString() : null,
    };
  });
}

export async function messageRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: [csrfGuard, requireUser] }, async (req, reply) => {
    const me = (req as AuthedRequest).user;
    const body = sendMessageSchema.parse(req.body);
    const rl = await consumeRateLimit({
      key: `message:${me.id}`,
      max: env.MESSAGE_RATE_LIMIT_MAX,
      windowSeconds: env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (!rl.ok) {
      reply.code(429);
      return { error: { code: "RATE_LIMITED", message: "Too many messages" } };
    }
    const message = await createMessage(me.id, body);
    hub.broadcastToConversation(body.conversationId, {
      type: "message.new",
      payload: serializeMessage(message),
    });
    return { message: serializeMessage(message), clientId: body.clientId };
  });

  app.get("/search", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const q = String((req.query as { q?: string }).q ?? "").trim();
    if (q.length < 2) return { messages: [] };
    const memberships = await prisma.conversationMember.findMany({ where: { userId: me }, select: { conversationId: true } });
    const ids = memberships.map((m) => m.conversationId);
    const messages = await prisma.message.findMany({
      where: {
        conversationId: { in: ids },
        deletedAt: null,
        ciphertext: { contains: q, mode: "insensitive" },
      },
      take: 30,
      orderBy: { createdAt: "desc" },
      include: { sender: true, attachments: true, reactions: true, receipts: true },
    });
    return { messages: messages.map(serializeMessage) };
  });

  app.patch("/:id", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    const body = editMessageSchema.parse(req.body);
    const existing = await prisma.message.findUnique({ where: { id } });
    if (!existing) throw errors.notFound();
    await assertMember(me, existing.conversationId);
    if (existing.senderId !== me) throw errors.forbidden();
    if (existing.deletedAt) throw errors.forbidden();
    const message = await prisma.message.update({
      where: { id },
      data: { ciphertext: body.ciphertext, editedAt: new Date() },
      include: { sender: true, attachments: true, reactions: true, receipts: true },
    });
    hub.broadcastToConversation(message.conversationId, { type: "message.edit", payload: serializeMessage(message) });
    return { message: serializeMessage(message) };
  });

  app.delete("/:id", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    const existing = await prisma.message.findUnique({ where: { id }, include: { attachments: true } });
    if (!existing) throw errors.notFound();
    await assertMember(me, existing.conversationId);
    const message = await prisma.message.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    hub.broadcastToConversation(existing.conversationId, {
      type: "message.delete",
      payload: { id: existing.id, conversationId: existing.conversationId },
    });
    return { ok: true };
  });

  app.post("/:id/reactions", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    const { reaction } = reactionSchema.parse(req.body);
    const existing = await prisma.message.findUnique({ where: { id } });
    if (!existing) throw errors.notFound();
    await assertMember(me, existing.conversationId);
    const row = await prisma.messageReaction.upsert({
      where: { messageId_userId_reaction: { messageId: id, userId: me, reaction } },
      update: {},
      create: { messageId: id, userId: me, reaction },
    });
    hub.broadcastToConversation(existing.conversationId, {
      type: "message.reaction",
      payload: { messageId: id, userId: me, reaction: row.reaction },
    });
    return { ok: true };
  });

  app.delete("/:id/reactions/:reaction", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id, reaction } = req.params as { id: string; reaction: string };
    const existing = await prisma.message.findUnique({ where: { id } });
    if (!existing) throw errors.notFound();
    await assertMember(me, existing.conversationId);
    await prisma.messageReaction.deleteMany({ where: { messageId: id, userId: me, reaction } });
    hub.broadcastToConversation(existing.conversationId, {
      type: "message.reaction",
      payload: { messageId: id, userId: me, reaction, removed: true },
    });
    return { ok: true };
  });
}

export async function createMessage(senderId: string, body: ReturnType<typeof sendMessageSchema.parse>) {
  await assertMember(senderId, body.conversationId);
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: body.conversationId },
  });
  for (const m of members) {
    if (m.userId !== senderId && (await isBlockedEither(senderId, m.userId))) {
      throw errors.forbidden("User unavailable");
    }
  }
  if (body.replyToMessageId) {
    const reply = await prisma.message.findUnique({ where: { id: body.replyToMessageId } });
    if (!reply || reply.conversationId !== body.conversationId) throw errors.validation("Invalid reply");
  }
  const message = await prisma.message.create({
    data: {
      conversationId: body.conversationId,
      senderId,
      messageType: body.messageType,
      ciphertext: body.ciphertext,
      encryptionVersion: body.encryptionVersion ?? 1,
      replyToMessageId: body.replyToMessageId,
      forwardedFromId: body.forwardedFromId,
    },
    include: { sender: true, attachments: true, reactions: true, receipts: true },
  });
  await prisma.conversation.update({ where: { id: body.conversationId }, data: { updatedAt: new Date() } });
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: body.conversationId, userId: senderId } },
    data: { lastReadMessageId: message.id },
  });
  for (const m of members) {
    if (m.userId === senderId) continue;
    if (await isOnline(m.userId)) {
      await prisma.messageReceipt.upsert({
        where: { messageId_userId: { messageId: message.id, userId: m.userId } },
        update: { deliveredAt: new Date() },
        create: { messageId: message.id, userId: m.userId, deliveredAt: new Date() },
      });
    }
  }
  return prisma.message.findUniqueOrThrow({
    where: { id: message.id },
    include: { sender: true, attachments: true, reactions: true, receipts: true },
  });
}

export function serializeMessage(m: {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: string;
  ciphertext: string;
  encryptionVersion: number;
  replyToMessageId: string | null;
  forwardedFromId?: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  attachments?: { id: string; storageKey: string; originalFilename: string; mimeType: string; size: number }[];
  reactions?: { userId: string; reaction: string }[];
  receipts?: { userId: string; deliveredAt: Date | null; readAt: Date | null }[];
  sender?: { username: string; displayName: string; avatarUrl: string | null };
}) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    sender: m.sender
      ? { username: m.sender.username, displayName: m.sender.displayName, avatarUrl: m.sender.avatarUrl }
      : undefined,
    messageType: m.messageType,
    ciphertext: m.deletedAt ? "" : m.ciphertext,
    encryptionVersion: m.encryptionVersion,
    replyToMessageId: m.replyToMessageId,
    forwardedFromId: m.forwardedFromId ?? null,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    attachments: (m.attachments ?? []).map((a) => ({
      id: a.id,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      size: a.size,
    })),
    reactions: m.reactions ?? [],
    receipts: m.receipts ?? [],
  };
}
