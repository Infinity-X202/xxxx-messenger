import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser, type AuthedRequest } from "../lib/session.js";
import { csrfGuard } from "../lib/csrf.js";
import { errors } from "../errors.js";
import { isLivecamAdmin, livecamStreamers } from "../lib/livecam.js";
import { MAX_ACCESS_USERS } from "../lib/access-store.js";
import { addAccess, listAccess, removeAccess } from "../lib/access-store.js";
import { builtinIdentities, ensureAccessUsers } from "../lib/identities.js";

function adminOnly(req: AuthedRequest) {
  if (!isLivecamAdmin(req.user.username)) throw errors.forbidden();
}

export async function adminAccessRoutes(app: FastifyInstance) {
  app.get("/livecam/slots", { preHandler: [requireUser] }, async (req) => {
    adminOnly(req as AuthedRequest);
    return { slots: livecamStreamers(), maxUsers: MAX_ACCESS_USERS };
  });

  app.get("/access", { preHandler: [requireUser] }, async (req) => {
    adminOnly(req as AuthedRequest);
    return { entries: listAccess(builtinIdentities()) };
  });

  app.post("/access", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    adminOnly(req as AuthedRequest);
    const body = z.object({ name: z.string().min(1).max(40), code: z.string().min(1).max(40) }).safeParse(req.body);
    if (!body.success) throw errors.validation("Nome e codice richiesti.");
    try {
      addAccess(builtinIdentities(), body.data.name, body.data.code);
      await ensureAccessUsers();
    } catch (err) {
      throw errors.validation(err instanceof Error ? err.message : "Impossibile aggiungere");
    }
    return { entries: listAccess(builtinIdentities()) };
  });

  app.delete("/access/:username", { preHandler: [csrfGuard, requireUser] }, async (req) => {
    adminOnly(req as AuthedRequest);
    const username = (req.params as { username?: string }).username ?? "";
    try {
      removeAccess(builtinIdentities(), username);
      await ensureAccessUsers();
    } catch (err) {
      throw errors.validation(err instanceof Error ? err.message : "Impossibile eliminare");
    }
    return { entries: listAccess(builtinIdentities()) };
  });
}
