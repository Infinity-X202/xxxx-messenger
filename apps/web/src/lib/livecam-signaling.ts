import { onRealtime as onWs, onWsOpen as onOpen, sendRealtime as sendWs, startRealtime } from "./realtime";

type Handler = (msg: { type: string; payload?: unknown }) => void;

export function ensureRealtime() {
  startRealtime();
}

export function onRealtime(fn: Handler) {
  return onWs(fn);
}

export function onWsOpen(fn: () => void) {
  return onOpen(fn);
}

export function sendRealtime(data: unknown) {
  sendWs(data);
}
