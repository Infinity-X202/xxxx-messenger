import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";

export type StoredAccess = { username: string; displayName: string; code: string };

export type AccessListItem = StoredAccess & { builtin: boolean };

const BUILTIN = new Set(["adil", "dua", "ghosty", "maria"]);
export const MAX_ACCESS_USERS = 3;

export function activeNonAdminUsers(builtins: StoredAccess[]): AccessListItem[] {
  return listAccess(builtins).filter((e) => e.username !== "adil");
}

function repoRoot() {
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 10; i++) {
      if (existsSync(path.join(dir, "apps", "server", "package.json")) && existsSync(path.join(dir, "apps", "web"))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

export function accessCodesPath() {
  return path.join(repoRoot(), "storage", "access-codes.json");
}

export function normalizeAccess(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function readAccessStore(): { extra: StoredAccess[]; disabled: string[] } {
  try {
    const raw = JSON.parse(readFileSync(accessCodesPath(), "utf8")) as { extra?: StoredAccess[]; disabled?: string[] };
    return {
      extra: Array.isArray(raw.extra) ? raw.extra.filter((e) => e && typeof e.username === "string") : [],
      disabled: Array.isArray(raw.disabled) ? raw.disabled.map(String) : [],
    };
  } catch {
    return { extra: [], disabled: [] };
  }
}

export function writeAccessStore(data: { extra: StoredAccess[]; disabled: string[] }) {
  const file = accessCodesPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export function listAccess(builtins: StoredAccess[]): AccessListItem[] {
  const store = readAccessStore();
  const disabled = new Set(store.disabled);
  const items: AccessListItem[] = builtins.filter((b) => !disabled.has(b.username)).map((b) => ({ ...b, builtin: true }));
  for (const extra of store.extra) {
    if (disabled.has(extra.username)) continue;
    if (items.some((i) => i.username === extra.username)) continue;
    items.push({ ...extra, builtin: false });
  }
  return items;
}

export function addAccess(builtins: StoredAccess[], name: string, code: string): AccessListItem[] {
  const displayName = name.trim();
  const username = normalizeAccess(displayName);
  const secret = code.trim();
  if (!/^[a-z][a-z0-9]{1,20}$/.test(username)) {
    throw new Error("Name must be 2–21 letters or numbers.");
  }
  if (normalizeAccess(secret).length < 2) throw new Error("Code must be at least 2 characters.");
  if (username === "adil") throw new Error("Adil is the admin and stays fixed.");
  const store = readAccessStore();
  const activeNonAdmin = activeNonAdminUsers(builtins);
  if (!store.disabled.includes(username) && !activeNonAdmin.some((e) => e.username === username) && activeNonAdmin.length >= MAX_ACCESS_USERS) {
    throw new Error(`Maximum ${MAX_ACCESS_USERS} people. Remove someone before adding another.`);
  }
  const activeBuiltins = builtins.filter((b) => !store.disabled.includes(b.username));
  const taken = new Set([...activeBuiltins.map((b) => b.username), ...store.extra.map((e) => e.username)]);
  if (taken.has(username) && !store.disabled.includes(username)) throw new Error("This name already exists.");
  const codes = new Set(
    [...activeBuiltins, ...store.extra.filter((e) => !store.disabled.includes(e.username))].map((e) => normalizeAccess(e.code)),
  );
  if (codes.has(normalizeAccess(secret))) throw new Error("This code is already in use.");
  store.disabled = store.disabled.filter((d) => d !== username);
  store.extra = store.extra.filter((e) => e.username !== username);
  if (!BUILTIN.has(username)) store.extra.push({ username, displayName, code: secret });
  writeAccessStore(store);
  return listAccess(builtins);
}

export function removeAccess(builtins: StoredAccess[], username: string): AccessListItem[] {
  const name = normalizeAccess(username);
  if (!name) throw new Error("Name is missing.");
  if (name === "adil") throw new Error("Adil cannot be removed.");
  const store = readAccessStore();
  const exists = BUILTIN.has(name) || store.extra.some((e) => e.username === name);
  if (!exists) throw new Error("Name not found.");
  store.extra = store.extra.filter((e) => e.username !== name);
  if (!store.disabled.includes(name)) store.disabled.push(name);
  writeAccessStore(store);
  return listAccess(builtins);
}

export async function applyDisabledUsers(): Promise<void> {
  const { disabled } = readAccessStore();
  for (const username of disabled) {
    if (username === "adil") continue;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) continue;
    if (user.status !== "disabled") {
      await prisma.user.update({ where: { id: user.id }, data: { status: "disabled" } });
    }
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
