import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  joinSchema,
  loginSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@ixm/shared";
import { prisma } from "../db.js";
import { errors } from "../errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { publicUser, randomToken, hmacHash } from "../lib/crypto.js";
import {
  clearSessionCookie,
  createSession,
  readSessionToken,
  requireUser,
  revokeAllUserSessions,
  revokeSessionByToken,
  rotateSession,
  setCsrfCookie,
  setSessionCookie,
  type AuthedRequest,
} from "../lib/session.js";
import { audit } from "../lib/audit.js";
import { sendMail } from "../lib/mail.js";
import { isLocked } from "../lib/rate-limit.js";
import { env } from "../config.js";
import { csrfGuard } from "../lib/csrf.js";
import { ensureAccessUsers, matchAccessCode } from "../lib/identities.js";
import { isLivecamStreamer } from "../lib/livecam.js";

const dummyHashPromise = hashPassword("dummy-password-check-padding");

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw errors.validation(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async () => {
    throw errors.forbidden("Registration is closed. Use your secret code to sign in.");
  });

  app.post("/login", async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const ident = matchAccessCode(body.code);
    if (!ident) {
      await dummyHashPromise;
      await audit({ event: "login_failed", ip: req.ip, userAgent: req.headers["user-agent"] });
      throw errors.credentials();
    }
    let user;
    try {
      user = await prisma.user.findUnique({ where: { username: ident.username } });
      if (!user) {
        await ensureAccessUsers();
        user = await prisma.user.findUnique({ where: { username: ident.username } });
      }
    } catch {
      throw errors.unavailable();
    }
    if (!user) throw errors.credentials();
    if (user.status === "disabled") {
      user = await prisma.user.update({ where: { id: user.id }, data: { status: "active" } });
    }
    const old = readSessionToken(req);
    if (old) await revokeSessionByToken(old).catch(() => undefined);
    const token = await createSession({
      userId: user.id,
      deviceName: body.deviceName ?? "web",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const csrf = randomToken(24);
    setSessionCookie(reply, token, req);
    setCsrfCookie(reply, csrf, req);
    await audit({ userId: user.id, event: "login_success", ip: req.ip, userAgent: req.headers["user-agent"] });
    return {
      user: {
        ...publicUser(user),
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        livecamPublisher: isLivecamStreamer(user.username),
      },
      csrfToken: csrf,
    };
  });

  app.post("/join", async (req, reply) => {
    const body = parse(joinSchema, req.body);
    if (await isLocked(`join:${req.ip}`)) throw errors.rateLimited();
    const asCode = matchAccessCode(body.displayName);
    if (!asCode) throw errors.credentials();
    await ensureAccessUsers();
    const user = await prisma.user.findUnique({ where: { username: asCode.username } });
    if (!user) throw errors.credentials();
    if (user.status === "disabled") {
      await prisma.user.update({ where: { id: user.id }, data: { status: "active" } });
    }
    const old = readSessionToken(req);
    if (old) await revokeSessionByToken(old);
    const token = await createSession({
      userId: user.id,
      deviceName: body.deviceName ?? "web",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const csrf = randomToken(24);
    setSessionCookie(reply, token, req);
    setCsrfCookie(reply, csrf, req);
    await audit({ userId: user.id, event: "login_success", ip: req.ip, userAgent: req.headers["user-agent"] });
    return {
      user: {
        ...publicUser(user),
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        livecamPublisher: isLivecamStreamer(user.username),
      },
      csrfToken: csrf,
    };
  });

  app.post("/logout", { preHandler: [csrfGuard, requireUser] }, async (req, reply) => {
    const token = readSessionToken(req);
    if (token) await revokeSessionByToken(token);
    clearSessionCookie(reply);
    await audit({ userId: (req as AuthedRequest).user.id, event: "logout", ip: req.ip });
    return { ok: true };
  });

  app.post("/logout-all", { preHandler: [csrfGuard, requireUser] }, async (req, reply) => {
    const user = (req as AuthedRequest).user;
    await revokeAllUserSessions(user.id);
    clearSessionCookie(reply);
    await audit({ userId: user.id, event: "logout_all", ip: req.ip });
    return { ok: true };
  });

  app.get("/me", { preHandler: [requireUser] }, async (req) => {
    const user = (req as AuthedRequest).user;
    return {
      user: {
        ...publicUser(user),
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        status: user.status,
        livecamPublisher: isLivecamStreamer(user.username),
      },
    };
  });

  app.post("/change-password", { preHandler: [csrfGuard, requireUser] }, async (req, reply) => {
    const user = (req as AuthedRequest).user;
    const body = parse(changePasswordSchema, req.body);
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) throw errors.credentials();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), passwordChangedAt: new Date() },
    });
    await revokeAllUserSessions(user.id);
    const token = await createSession({ userId: user.id, deviceName: "web", ip: req.ip, userAgent: req.headers["user-agent"] });
    const csrf = randomToken(24);
    setSessionCookie(reply, token, req);
    setCsrfCookie(reply, csrf, req);
    await audit({ userId: user.id, event: "password_change", ip: req.ip });
    return { ok: true, csrfToken: csrf };
  });

  app.post("/forgot-password", async (req) => {
    const body = parse(forgotPasswordSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (user) {
      const token = randomToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hmacHash(token),
          expiresAt: new Date(Date.now() + 1000 * 60 * 30),
        },
      });
      const link = `${env.APP_URL}/reset-password?token=${token}`;
      await sendMail(user.email, "Reset your Infinity X Messenger password", `Reset link (30 minutes): ${link}`);
      await audit({ userId: user.id, event: "password_reset_requested", ip: req.ip });
    } else {
      await audit({ event: "password_reset_unknown", ip: req.ip });
    }
    return { ok: true };
  });

  app.post("/reset-password", async (req, reply) => {
    const body = parse(resetPasswordSchema, req.body);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hmacHash(body.token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw errors.validation("Invalid or expired token");
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(body.newPassword), passwordChangedAt: new Date() },
      }),
      prisma.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    const token = await createSession({ userId: row.userId, ip: req.ip, userAgent: req.headers["user-agent"] });
    const csrf = randomToken(24);
    setSessionCookie(reply, token, req);
    setCsrfCookie(reply, csrf, req);
    await audit({ userId: row.userId, event: "password_reset", ip: req.ip });
    return { ok: true, csrfToken: csrf };
  });

  app.post("/verify-email", { preHandler: [requireUser] }, async (req) => {
    const body = parse(verifyEmailSchema, req.body);
    const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hmacHash(body.token) } });
    const user = (req as AuthedRequest).user;
    if (!row || row.userId !== user.id || row.usedAt || row.expiresAt < new Date()) {
      throw errors.validation("Invalid or expired token");
    }
    await prisma.$transaction([
      prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), status: "active" },
      }),
    ]);
    await audit({ userId: user.id, event: "email_verified", ip: req.ip });
    return { ok: true };
  });

  app.post("/rotate-session", { preHandler: [csrfGuard, requireUser] }, async (req, reply) => {
    const old = readSessionToken(req);
    if (!old) throw errors.unauthorized();
    const next = await rotateSession(old, { ip: req.ip, userAgent: req.headers["user-agent"] });
    if (!next) throw errors.unauthorized();
    const csrf = randomToken(24);
    setSessionCookie(reply, next, req);
    setCsrfCookie(reply, csrf, req);
    await audit({ userId: (req as AuthedRequest).user.id, event: "session_rotate", ip: req.ip });
    return { csrfToken: csrf };
  });
}
