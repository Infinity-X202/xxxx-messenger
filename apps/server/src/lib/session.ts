import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { env, isProd } from "../config.js";
import { hmacHash, randomToken } from "../lib/crypto.js";
import { errors } from "../errors.js";
import type { User } from "@prisma/client";

export type AuthedRequest = FastifyRequest & { user: User; sessionId: string };

export function cookieOptions(req?: FastifyRequest) {
  const proto = String(req?.headers["x-forwarded-proto"] ?? "");
  const host = String(req?.headers["x-forwarded-host"] ?? req?.headers.host ?? "");
  const tunnel = host.includes("trycloudflare.com") || host.includes("cfargotunnel.com");
  const https = isProd || proto.includes("https") || tunnel;
  return {
    path: "/",
    httpOnly: true,
    secure: https,
    sameSite: (https ? "none" : "lax") as "none" | "lax",
    maxAge: env.SESSION_TTL_SECONDS,
  };
}

export async function createSession(opts: {
  userId: string;
  deviceName?: string;
  ip?: string;
  userAgent?: string;
}): Promise<string> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({
    data: {
      userId: opts.userId,
      tokenHash: hmacHash(token),
      deviceName: opts.deviceName?.slice(0, 80),
      ipHash: opts.ip ? hmacHash(opts.ip) : null,
      userAgent: opts.userAgent?.slice(0, 300),
      expiresAt,
    },
  });
  return token;
}

export async function rotateSession(oldToken: string, meta: { ip?: string; userAgent?: string }): Promise<string | null> {
  const existing = await prisma.session.findUnique({
    where: { tokenHash: hmacHash(oldToken) },
  });
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) return null;
  await prisma.session.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  const token = randomToken(32);
  await prisma.session.create({
    data: {
      userId: existing.userId,
      tokenHash: hmacHash(token),
      deviceName: existing.deviceName,
      ipHash: meta.ip ? hmacHash(meta.ip) : existing.ipHash,
      userAgent: meta.userAgent?.slice(0, 300) ?? existing.userAgent,
      expiresAt: existing.expiresAt,
      rotatedFromId: existing.id,
    },
  });
  return token;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hmacHash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function loadSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hmacHash(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status === "disabled") return null;
  return session;
}

export function readSessionToken(req: FastifyRequest): string | undefined {
  return req.cookies[env.SESSION_COOKIE_NAME];
}

export async function requireUser(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = readSessionToken(req);
  if (!token) throw errors.unauthorized();
  const session = await loadSession(token);
  if (!session) throw errors.unauthorized();
  (req as AuthedRequest).user = session.user;
  (req as AuthedRequest).sessionId = session.id;
}

export function setSessionCookie(reply: FastifyReply, token: string, req?: FastifyRequest) {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, cookieOptions(req));
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
}

export function setCsrfCookie(reply: FastifyReply, token: string, req?: FastifyRequest) {
  const opts = cookieOptions(req);
  reply.setCookie("ixm_csrf", token, {
    ...opts,
    httpOnly: false,
  });
}
