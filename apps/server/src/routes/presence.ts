import type { FastifyInstance } from "fastify";
import { devicePresenceSchema } from "@ixm/shared";
import { prisma } from "../db.js";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { getDeviceSnapshot, isOnline, saveDeviceSnapshot } from "../lib/presence.js";
import { isLivecamAdmin } from "../lib/livecam.js";
import { errors } from "../errors.js";
import { publicUser } from "../lib/crypto.js";
import { accessUsernames } from "../lib/identities.js";

export async function presenceRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    const me = req as AuthedRequest;
    const body = devicePresenceSchema.parse(req.body ?? {});
    await saveDeviceSnapshot(me.user.id, {
      ...body,
      ip: req.ip,
      userAgent: body.userAgent || String(req.headers["user-agent"] ?? "").slice(0, 400),
    });
    return { ok: true };
  });
}

export async function adminUserInfoRoutes(app: FastifyInstance) {
  app.get("/users", { preHandler: [requireUser] }, async (req) => {
    const me = req as AuthedRequest;
    if (!isLivecamAdmin(me.user.username)) throw errors.forbidden();
    const users = await prisma.user.findMany({
      where: { username: { in: [...accessUsernames()] } },
      orderBy: { username: "asc" },
    });
    const sessions = await prisma.session.findMany({
      where: { userId: { in: users.map((u) => u.id) }, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const byUser = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const list = byUser.get(s.userId) ?? [];
      list.push(s);
      byUser.set(s.userId, list);
    }
    const out = await Promise.all(
      users.map(async (u) => {
        const snap = await getDeviceSnapshot(u.id);
        const sess = (byUser.get(u.id) ?? []).slice(0, 5).map((s) => ({
          id: s.id,
          deviceName: s.deviceName,
          userAgent: s.userAgent,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        }));
        return {
          ...publicUser(u),
          online: await isOnline(u.id),
          phone: snap,
          sessions: sess,
        };
      }),
    );
    return { users: out };
  });
}
