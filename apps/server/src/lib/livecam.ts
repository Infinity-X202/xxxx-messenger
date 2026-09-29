import { prisma } from "../db.js";
import { accessIdentities } from "./identities.js";

const ADMIN_USERNAME = "adil";

export type LivecamSlot = string;

export function livecamStreamers(): { username: string; displayName: string }[] {
  return accessIdentities()
    .filter((i) => i.username !== ADMIN_USERNAME)
    .slice(0, 3)
    .map((i) => ({ username: i.username, displayName: i.displayName }));
}

export function livecamStreamerUsernames(): string[] {
  return livecamStreamers().map((s) => s.username);
}

export async function livecamAdminId(): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME }, select: { id: true } });
  return u?.id ?? null;
}

export async function livecamStreamerId(slot: LivecamSlot): Promise<string | null> {
  if (!livecamStreamerUsernames().includes(slot)) return null;
  try {
    const u = await prisma.user.findUnique({ where: { username: slot }, select: { id: true } });
    return u?.id ?? null;
  } catch {
    return null;
  }
}

export function isLivecamAdmin(username: string): boolean {
  return username === ADMIN_USERNAME;
}

export function isLivecamStreamer(username: string): boolean {
  return livecamStreamerUsernames().includes(username);
}

export function slotForUsername(username: string): LivecamSlot | null {
  return isLivecamStreamer(username) ? username : null;
}

export function parseSlot(raw: unknown): LivecamSlot {
  const slot = String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const allowed = livecamStreamerUsernames();
  if (slot && allowed.includes(slot)) return slot;
  return allowed[0] ?? "dua";
}
