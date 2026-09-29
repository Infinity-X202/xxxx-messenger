type Handler = (msg: { type: string; payload?: unknown; ts?: number }) => void;

let ws: WebSocket | null = null;
let closed = false;
let delay = 500;
const listeners = new Set<Handler>();
const openListeners = new Set<() => void>();
let started = false;
const pending: string[] = [];

function open() {
  if (closed) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    delay = 500;
    while (pending.length && ws?.readyState === WebSocket.OPEN) {
      ws.send(pending.shift()!);
    }
    openListeners.forEach((fn) => fn());
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "ping") {
        ws?.send(JSON.stringify({ type: "ping" }));
        return;
      }
      listeners.forEach((fn) => fn(msg));
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    if (closed) return;
    setTimeout(open, delay);
    delay = Math.min(delay * 2, 8000);
  };
}

export function startRealtime() {
  if (started) return;
  started = true;
  closed = false;
  open();
}

export function onRealtime(fn: Handler) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function onWsOpen(fn: () => void) {
  openListeners.add(fn);
  if (ws?.readyState === WebSocket.OPEN) fn();
  return () => {
    openListeners.delete(fn);
  };
}

export function sendRealtime(data: unknown) {
  const raw = JSON.stringify(data);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(raw);
    return;
  }
  if (pending.length < 40) pending.push(raw);
}
