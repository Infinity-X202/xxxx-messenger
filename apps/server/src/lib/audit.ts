import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashIp } from "../lib/crypto.js";
import { logger } from "../logger.js";

const SENSITIVE = /password|token|cookie|secret|private.?key|ciphertext|authorization/i;

export async function audit(input: {
  userId?: string | null;
  event: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const metadata = sanitize(input.metadata);
  logger.info({ event: input.event, userId: input.userId, metadata }, "audit");
  await prisma.auditEvent.create({
    data: {
      userId: input.userId ?? null,
      event: input.event,
      ipHash: hashIp(input.ip),
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function sanitize(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) continue;
    if (typeof v === "string" && SENSITIVE.test(v)) continue;
    out[k] = v;
  }
  return out;
}
