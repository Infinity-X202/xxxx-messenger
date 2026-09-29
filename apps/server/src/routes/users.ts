import type { FastifyInstance } from "fastify";
import { deviceRegisterSchema, searchQuerySchema, updateProfileSchema } from "@ixm/shared";
import { prisma } from "../db.js";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { errors } from "../errors.js";
import { publicUser } from "../lib/crypto.js";
import { isOnline } from "../lib/presence.js";
import { accessUsernames } from "../lib/identities.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/directory", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const blocked = await prisma.blockedUser.findMany({
      where: { OR: [{ userId: me }, { blockedUserId: me }] },
    });
    const blockedIds = new Set(blocked.flatMap((b) => [b.userId, b.blockedUserId]));
    const declined = await prisma.contact.findMany({ where: { userId: me, status: "declined" } });
    const declinedIds = new Set(declined.map((d) => d.contactUserId));
    blockedIds.add(me);
    const users = await prisma.user.findMany({
      where: { status: { not: "disabled" }, username: { in: [...accessUsernames()] } },
      orderBy: { displayName: "asc" },
      take: 100,
    });
    return {
      users: await Promise.all(
        users
          .filter((u) => !blockedIds.has(u.id) && !declinedIds.has(u.id))
          .map(async (u) => ({ ...publicUser(u), online: await isOnline(u.id), lastSeen: u.lastSeen })),
      ),
    };
  });

  app.get("/search", { preHandler: [requireUser] }, async (req) => {
    const q = searchQuerySchema.parse(req.query).q.toLowerCase();
    const me = (req as AuthedRequest).user.id;
    const blocked = await prisma.blockedUser.findMany({
      where: { OR: [{ userId: me }, { blockedUserId: me }] },
    });
    const blockedIds = new Set(blocked.flatMap((b) => [b.userId, b.blockedUserId]));
    blockedIds.add(me);
    const users = await prisma.user.findMany({
      where: {
        status: { not: "disabled" },
        AND: [
          {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: 20,
    });
    return {
      users: await Promise.all(
        users
          .filter((u) => !blockedIds.has(u.id))
          .map(async (u) => ({ ...publicUser(u), online: await isOnline(u.id) })),
      ),
    };
  });

  app.get("/:id", { preHandler: [requireUser] }, async (req) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.status === "disabled") throw errors.notFound();
    return { user: { ...publicUser(user), online: await isOnline(user.id) } };
  });

  app.patch("/me", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user;
    const body = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: me.id },
      data: {
        displayName: body.displayName,
        bio: body.bio,
        avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl,
      },
    });
    return { user: { ...publicUser(user), email: user.email } };
  });
}

export async function contactRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const rows = await prisma.contact.findMany({
      where: { userId: me },
      include: { contact: true },
    });
    return {
      contacts: await Promise.all(
        rows.map(async (r) => ({
          status: r.status,
          createdAt: r.createdAt,
          user: { ...publicUser(r.contact), online: await isOnline(r.contact.id) },
        })),
      ),
    };
  });

  app.post("/", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { userId } = req.body as { userId: string };
    if (!userId || userId === me) throw errors.validation();
    const other = await prisma.user.findUnique({ where: { id: userId } });
    if (!other) throw errors.notFound();
    await prisma.contact.upsert({
      where: { userId_contactUserId: { userId: me, contactUserId: userId } },
      update: { status: "accepted" },
      create: { userId: me, contactUserId: userId, status: "accepted" },
    });
    return { ok: true };
  });

  app.delete("/:userId", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { userId } = req.params as { userId: string };
    await prisma.contact.upsert({
      where: { userId_contactUserId: { userId: me, contactUserId: userId } },
      update: { status: "declined" },
      create: { userId: me, contactUserId: userId, status: "declined" },
    });
    const shared = await prisma.conversation.findMany({
      where: {
        type: "direct",
        AND: [{ members: { some: { userId: me } } }, { members: { some: { userId } } }],
      },
    });
    await prisma.conversationMember.updateMany({
      where: { userId: me, conversationId: { in: shared.map((c) => c.id) } },
      data: { mutedUntil: new Date("2099-01-01T00:00:00.000Z") },
    });
    return { ok: true };
  });
}

export async function blockRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const rows = await prisma.blockedUser.findMany({
      where: { userId: me },
      include: { blocked: true },
    });
    return { blocked: rows.map((r) => publicUser(r.blocked)) };
  });

  app.post("/:userId", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { userId } = req.params as { userId: string };
    if (userId === me) throw errors.validation();
    await prisma.blockedUser.upsert({
      where: { userId_blockedUserId: { userId: me, blockedUserId: userId } },
      update: {},
      create: { userId: me, blockedUserId: userId },
    });
    return { ok: true };
  });

  app.delete("/:userId", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { userId } = req.params as { userId: string };
    await prisma.blockedUser.deleteMany({ where: { userId: me, blockedUserId: userId } });
    return { ok: true };
  });
}

export async function deviceRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const devices = await prisma.device.findMany({
      where: { userId: me, revokedAt: null },
      orderBy: { lastSeen: "desc" },
    });
    return { devices };
  });

  app.post("/", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const body = deviceRegisterSchema.parse(req.body);
    const device = await prisma.device.create({
      data: { userId: me, deviceName: body.deviceName, publicKey: body.publicKey },
    });
    return { device };
  });

  app.delete("/:id", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user.id;
    const { id } = req.params as { id: string };
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device || device.userId !== me) throw errors.notFound();
    await prisma.device.update({ where: { id }, data: { revokedAt: new Date() } });
    return { ok: true };
  });
}

export async function sessionRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user;
    const sessions = await prisma.session.findMany({
      where: { userId: me.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, deviceName: true, createdAt: true, expiresAt: true, userAgent: true },
    });
    return { sessions, currentId: (req as AuthedRequest).sessionId };
  });

  app.delete("/:id", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.userId !== me.id) throw errors.notFound();
    await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
    return { ok: true };
  });
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireUser] }, async (req) => {
    const me = (req as AuthedRequest).user;
    return { settings: { email: me.email, role: me.role, emailVerifiedAt: me.emailVerifiedAt, lastSeen: me.lastSeen } };
  });
}
