import type { FastifyRequest } from "fastify";
import { errors } from "../errors.js";
import { isProd } from "../config.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export async function csrfGuard(req: FastifyRequest): Promise<void> {
  if (SAFE.has(req.method)) return;
  const url = req.url.split("?")[0] ?? "";
  const ua = String(req.headers["user-agent"] ?? "");
  if (ua.includes("InfinityXApp") && url.startsWith("/api/v1/device-files") && req.cookies.ixm_session) {
    return;
  }
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return;
      const forwarded = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
      if (forwarded && originHost === forwarded) return;
      if (originHost.endsWith(".trycloudflare.com")) return;
    } catch {
      /* ignore */
    }
  }
  const cookie = req.cookies.ixm_csrf;
  const header = req.headers["x-csrf-token"];
  if (!cookie || typeof header !== "string" || cookie !== header) {
    throw errors.csrf();
  }
}

/** Double-submit cookie is enough for cookie-authenticated SPA. Origin check extra. */
export async function originGuard(req: FastifyRequest): Promise<void> {
  if (SAFE.has(req.method) || !isProd) return;
  const origin = req.headers.origin;
  const allowed = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? [];
  if (origin && allowed.length && !allowed.includes(origin)) {
    throw errors.forbidden("Invalid origin");
  }
}
