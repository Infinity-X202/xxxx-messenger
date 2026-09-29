import { prisma } from "../db.js";
import { env } from "../config.js";
import { hashPassword } from "./password.js";
import { applyDisabledUsers, listAccess, normalizeAccess, readAccessStore } from "./access-store.js";

export type AccessIdentity = {
  username: string;
  displayName: string;
  code: string;
};

export function builtinIdentities(): AccessIdentity[] {
  return [
    { username: "dua", displayName: "Dua", code: env.ACCESS_CODE_DUA },
    { username: "adil", displayName: "Adil", code: env.ACCESS_CODE_ADIL },
    { username: "ghosty", displayName: "Ghosty", code: env.ACCESS_CODE_GHOSTY },
    { username: "maria", displayName: "Maria", code: env.ACCESS_CODE_MARIA },
  ];
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
    dua: "dua",
    due: "dua",
    duea: "dua",
    dueaa: "dua",
    duaa: "dua",
    duwa: "dua",
    adil: "adil",
    deal: "adil",
    adeal: "adil",
    adl: "adil",
    ghosty: "ghosty",
    ghost: "ghosty",
    gosti: "ghosty",
    gosty: "ghosty",
    maria: "maria",
    marie: "maria",
    mariya: "maria",
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
  const dua = created.find((u) => u.username === "dua");
  const adil = created.find((u) => u.username === "adil");
  const ghosty = created.find((u) => u.username === "ghosty");
  const maria = created.find((u) => u.username === "maria");
  if (dua && adil) await ensureDirectChat(dua.id, adil.id);
  if (ghosty && adil) await ensureDirectChat(ghosty.id, adil.id);
  if (dua && ghosty) await ensureDirectChat(dua.id, ghosty.id);
  if (maria && adil) await ensureDirectChat(maria.id, adil.id);
  if (maria && dua) await ensureDirectChat(maria.id, dua.id);
  if (maria && ghosty) await ensureDirectChat(maria.id, ghosty.id);
  if (adil) {
    for (const user of created) {
      if (user.username !== "adil") await ensureDirectChat(user.id, adil.id);
    }
  }
  await applyDisabledUsers();
}
