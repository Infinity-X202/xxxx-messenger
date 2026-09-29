import { prisma } from "../db.js";
import { env } from "../config.js";
import { hashPassword } from "./password.js";
import { applyDisabledUsers, listAccess, normalizeAccess, readAccessStore, writeAccessStore } from "./access-store.js";

export type AccessIdentity = {
  username: string;
  displayName: string;
  code: string;
};

export function builtinIdentities(): AccessIdentity[] {
  return [{ username: "adil", displayName: "Adil", code: env.ACCESS_CODE_ADIL }];
}

/** Legacy demo users are disabled — admin adds people in Access. */
export function retireLegacyBuiltinUsers(): void {
  const store = readAccessStore();
  let changed = false;
  for (const legacy of ["dua", "ghosty", "maria"]) {
    if (!store.disabled.includes(legacy)) {
      store.disabled.push(legacy);
      changed = true;
    }
  }
  if (changed) writeAccessStore(store);
}

export function accessIdentities(): AccessIdentity[] {
  return listAccess(builtinIdentities()).map(({ username, displayName, code }) => ({ username, displayName, code }));
}

export function accessUsernames(): string[] {
  return accessIdentities().map((i) => i.username);
}

function normalizeCode(input: string): string {
  return normalizeAccess(input);
}

export function matchAccessCode(input: string): AccessIdentity | null {
  const n = normalizeCode(input);
  if (!n) return null;
  const identities = accessIdentities();
  for (const ident of identities) {
    if (n === normalizeCode(ident.code) || n === ident.username) return ident;
  }
  const aliases: Record<string, string> = {
    adil: "adil",
    deal: "adil",
    adeal: "adil",
    adl: "adil",
  };
  const mapped = aliases[n];
  if (!mapped) return null;
  if (readAccessStore().disabled.includes(mapped)) return null;
  return identities.find((ident) => ident.username === mapped) ?? null;
}

async function ensureDirectChat(a: string, b: string) {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "direct",
      AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }],
    },
    include: { members: true },
  });
  if (existing && existing.members.length === 2) return;
  await prisma.conversation.create({
    data: {
      type: "direct",
      members: {
        create: [
          { userId: a, role: "owner" },
          { userId: b, role: "member" },
        ],
      },
    },
  });
}

export async function ensureAccessUsers(): Promise<void> {
  retireLegacyBuiltinUsers();
  const created: { id: string; username: string }[] = [];
  let dummy: string | null = null;
  for (const ident of accessIdentities()) {
    const email = `${ident.username}@infinityx.local`;
    const existing = await prisma.user.findUnique({ where: { username: ident.username } });
    if (existing) {
      created.push({ id: existing.id, username: existing.username });
      if (existing.status !== "active") {
        await prisma.user.update({
          where: { id: existing.id },
          data: { status: "active", displayName: ident.displayName, emailVerifiedAt: new Date() },
        });
      }
      continue;
    }
    dummy ??= await hashPassword(`locked-${env.SESSION_SECRET}`);
    const user = await prisma.user.create({
      data: {
        username: ident.username,
        email,
        passwordHash: dummy,
        displayName: ident.displayName,
        status: "active",
        emailVerifiedAt: new Date(),
      },
    });
    created.push({ id: user.id, username: user.username });
  }
  const adil = created.find((u) => u.username === "adil");
  if (adil) {
    for (const user of created) {
      if (user.username !== "adil") await ensureDirectChat(user.id, adil.id);
    }
  }
  await applyDisabledUsers();
}
