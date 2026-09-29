type Handler = (msg: { type: string; payload?: unknown; ts?: number }) => void;

export function connectSocket(onMessage: Handler) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let ws: WebSocket | null = null;
  let closed = false;
  let delay = 500;

  function open() {
    if (closed) return;
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      delay = 500;
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "ping") {
          ws?.send(JSON.stringify({ type: "ping" }));
          return;
        }
        onMessage(msg);
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

  open();
  const heartbeat = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
  }, 20000);

  return {
    send(data: unknown) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    },
    close() {
      closed = true;
      clearInterval(heartbeat);
      ws?.close();
    },
  };
}
