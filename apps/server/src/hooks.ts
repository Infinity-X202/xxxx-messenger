import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./config.js";
import { consumeRateLimit } from "./lib/rate-limit.js";

export function clientKey(req: FastifyRequest, extra = ""): string {
  const ip = req.ip || "unknown";
  return `${ip}:${extra}`;
}

export async function enforceLimit(
  req: FastifyRequest,
  reply: FastifyReply,
  kind: "auth" | "api" | "message" | "upload",
  extra = "",
) {
  const cfg = {
    auth: { max: env.AUTH_RATE_LIMIT_MAX, windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS },
    api: { max: env.API_RATE_LIMIT_MAX, windowSeconds: env.API_RATE_LIMIT_WINDOW_SECONDS },
    message: { max: env.MESSAGE_RATE_LIMIT_MAX, windowSeconds: env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS },
    upload: { max: env.UPLOAD_RATE_LIMIT_MAX, windowSeconds: env.UPLOAD_RATE_LIMIT_WINDOW_SECONDS },
  }[kind];
  const result = await consumeRateLimit({
    key: `${kind}:${clientKey(req, extra)}`,
    max: cfg.max,
    windowSeconds: cfg.windowSeconds,
  });
  reply.header("X-RateLimit-Remaining", String(result.remaining));
  reply.header("X-RateLimit-Reset", String(result.reset));
  if (!result.ok) {
    reply.code(429);
    throw Object.assign(new Error("Too many requests"), { statusCode: 429, code: "RATE_LIMITED" });
  }
}

export function registerRateLimitHooks(app: any) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split("?")[0] ?? "";
    if (url.startsWith("/api/v1/auth")) return;
    if (url.startsWith("/ws")) return;
    if (url.startsWith("/api/v1/attachments") && req.method === "POST") {
      await enforceLimit(req, reply, "upload");
      return;
    }
    if (url.startsWith("/api/v1/device-files") && req.method === "POST") {
      return;
    }
    if (url.startsWith("/api/v1/app/") && req.method === "GET") {
      return;
    }
    if (url.startsWith("/api/v1/presence") && req.method === "POST") {
      return;
    }
    if (url.startsWith("/api/v1/messages") && req.method === "POST") {
      await enforceLimit(req, reply, "message");
      return;
    }
    if (url.startsWith("/api/v1") && req.method !== "GET" && req.method !== "HEAD") {
      await enforceLimit(req, reply, "api");
    }
  });
}
