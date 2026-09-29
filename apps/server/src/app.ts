import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { AppError } from "./errors.js";
import { env, isProd } from "./config.js";
import { logger } from "./logger.js";
import { registerRateLimitHooks } from "./hooks.js";
import { csrfGuard, originGuard } from "./lib/csrf.js";
import { authRoutes } from "./routes/auth.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { conversationRoutes, messageRoutes } from "./routes/conversations.js";
import { blockRoutes, contactRoutes, deviceRoutes, sessionRoutes, settingsRoutes, userRoutes } from "./routes/users.js";
import { registerWebsocket } from "./ws/index.js";
import { adminLibraryRoutes, deviceFileRoutes } from "./routes/admin-files.js";
import { adminUserInfoRoutes, presenceRoutes } from "./routes/presence.js";
import { adminOtaRoutes, appOtaRoutes } from "./routes/ota.js";
import { adminAccessRoutes } from "./routes/access-admin.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 550_000_000,
    requestIdHeader: "x-request-id",
  });

  await app.register(helmet, {
    global: true,
    hsts: isProd,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });

  const origins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origins.includes(origin)) return cb(null, true);
      if (origin.endsWith(".trycloudflare.com") || origin.endsWith(".cfargotunnel.com")) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 50 } });
  await app.register(websocket);

  app.addHook("onRequest", async (req) => {
    await originGuard(req);
  });

  registerRateLimitHooks(app);

  app.addHook("preHandler", async (req) => {
    if (req.url.startsWith("/api/v1") && !req.url.startsWith("api/v1/auth/login") && !req.url.startsWith("/api/v1/auth/register") && !req.url.startsWith("/api/v1/auth/forgot") && !req.url.startsWith("/api/v1/auth/reset")) {
      if (req.url.startsWith("/api/v1/auth/login") || req.url.startsWith("/api/v1/auth/register")) return;
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) {
      return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
    }
    if ((err as { code?: string }).code === "FST_ERR_VALIDATION" || status === 400) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } });
    }
    req.log.error({ err }, "unhandled_error");
    const message = err instanceof Error ? err.message : "Internal error";
    return reply.code(status >= 400 && status < 600 ? status : 500).send({
      error: { code: "INTERNAL", message: isProd ? "Internal error" : message },
    });
  });

  app.get("/health", async () => ({ ok: true, service: "infinity-x-messenger" }));

  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  await app.register(messageRoutes, { prefix: "/api/v1/messages" });
  await app.register(attachmentRoutes, { prefix: "/api/v1/attachments" });
  await app.register(contactRoutes, { prefix: "/api/v1/contacts" });
  await app.register(blockRoutes, { prefix: "/api/v1/blocks" });
  await app.register(deviceRoutes, { prefix: "/api/v1/devices" });
  await app.register(sessionRoutes, { prefix: "/api/v1/sessions" });
  await app.register(settingsRoutes, { prefix: "/api/v1/settings" });
  await app.register(adminLibraryRoutes, { prefix: "/api/v1/admin" });
  await app.register(adminUserInfoRoutes, { prefix: "/api/v1/admin" });
  await app.register(adminOtaRoutes, { prefix: "/api/v1/admin" });
  await app.register(adminAccessRoutes, { prefix: "/api/v1/admin" });
  await app.register(presenceRoutes, { prefix: "/api/v1/presence" });
  await app.register(appOtaRoutes, { prefix: "/api/v1/app" });
  await app.register(deviceFileRoutes, { prefix: "/api/v1/device-files" });
  await registerWebsocket(app);

  void csrfGuard;

  return app;
}
