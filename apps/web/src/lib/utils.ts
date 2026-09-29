import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(iso: string | Date) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatLastSeen(iso?: string | Date | null) {
  if (!iso) return "offline";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "last seen just now";
  if (diff < 3600_000) return `last seen ${Math.floor(diff / 60_000)} min ago`;
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) return `last seen at ${formatTime(d)}`;
  return `last seen ${d.toLocaleDateString("en", { day: "numeric", month: "short" })}`;
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
