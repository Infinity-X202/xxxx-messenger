import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config.js";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** HMAC-SHA256 for session/IP hashing. Not used for passwords. */
export function hmacHash(value: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return hmacHash(ip);
}

export function publicUser(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  lastSeen: Date | null;
  status: string;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    lastSeen: user.lastSeen,
  };
}
