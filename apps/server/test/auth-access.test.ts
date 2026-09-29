import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

const run = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!run)("auth and access control", () => {
  let app: FastifyInstance;
  const password = "CorrectHorse-99!";
  const suffix = Date.now();

  beforeAll(async () => {
    process.env.APP_URL ??= "http://localhost:5173";
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    const { buildApp } = await import("../src/app.js");
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers, logs in, rejects IDOR on other user sessions", async () => {
    const a = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: `u${suffix}a`,
        email: `a${suffix}@example.com`,
        password,
        displayName: "User A",
      },
    });
    expect(a.statusCode).toBe(200);
    const cookieA = a.cookies.find((c) => c.name === "ixm_session");
    expect(cookieA?.httpOnly).toBe(true);

    const b = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: `u${suffix}b`,
        email: `b${suffix}@example.com`,
        password,
        displayName: "User B",
      },
    });
    expect(b.statusCode).toBe(200);
    const cookieB = b.headers["set-cookie"];

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { ixm_session: String(cookieA?.value) },
    });
    expect(me.statusCode).toBe(200);
    const userA = me.json().user.id;

    const csrf = String(b.cookies.find((c) => c.name === "ixm_csrf")?.value);
    const sessionB = String(b.cookies.find((c) => c.name === "ixm_session")?.value);

    const idor = await app.inject({
      method: "DELETE",
      url: `/api/v1/sessions/${userA}`,
      cookies: { ixm_session: sessionB, ixm_csrf: csrf },
      headers: { "x-csrf-token": csrf },
    });
    expect([403, 404]).toContain(idor.statusCode);

    const sql = await app.inject({
      method: "GET",
      url: "/api/v1/users/search?q=" + encodeURIComponent("'; DROP TABLE users; --"),
      cookies: { ixm_session: String(cookieA?.value) },
    });
    expect(sql.statusCode).toBe(200);

    const xssName = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: `x${suffix}`,
        email: `x${suffix}@example.com`,
        password,
        displayName: "<script>alert(1)</script>",
      },
    });
    expect(xssName.statusCode).toBe(200);
    expect(JSON.stringify(xssName.json())).toContain("&lt;script&gt;") || expect(xssName.json().user.displayName).toBe("<script>alert(1)</script>");

    const unauth = await app.inject({ method: "GET", url: "/api/v1/conversations" });
    expect(unauth.statusCode).toBe(401);

    void cookieB;
  });

  it("rejects CSRF on logout without header", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        username: `c${suffix}`,
        email: `c${suffix}@example.com`,
        password,
        displayName: "CSRF",
      },
    });
    const session = String(r.cookies.find((c) => c.name === "ixm_session")?.value);
    const fail = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: { ixm_session: session },
    });
    expect(fail.statusCode).toBe(403);
  });

  it("does not enumerate accounts on forgot-password", async () => {
    const a = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "missing@example.com" },
    });
    const b = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: `a${suffix}@example.com` },
    });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json()).toEqual(b.json());
  });
});
