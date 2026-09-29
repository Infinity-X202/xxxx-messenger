export type ApiError = { error?: { code?: string; message?: string } };

let csrfToken = "";

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken || readCookie("ixm_csrf");
}

function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parse(res: Response) {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(res.ok ? "Bad response" : "Server is starting, try again");
    }
  }
  if (!res.ok) {
    const message =
      (data as ApiError).error?.message ??
      (res.status === 429
        ? "Too many attempts, try again"
        : res.status >= 500
          ? "Server offline. Riprova tra un attimo."
          : "Request failed");
    const err = new Error(message) as Error & { status: number; code?: string };
    err.status = res.status;
    err.code = (data as ApiError).error?.code;
    throw err;
  }
  if (data.csrfToken) setCsrfToken(String(data.csrfToken));
  return data;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const login = path.includes("/auth/login") || path.includes("/auth/join");
  const me = path.includes("/auth/me");
  const tries = login || me ? 5 : 1;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const headers = new Headers(init.headers);
      if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(method) && !login) {
        headers.set("x-csrf-token", getCsrfToken());
      }
      const res = await fetch(path, { ...init, headers, credentials: "include" });
      if ((res.status === 502 || res.status === 503 || res.status === 429) && i < tries - 1) {
        await sleep(400 * (i + 1));
        continue;
      }
      return parse(res) as Promise<T>;
    } catch (err) {
      last = err instanceof Error ? err : new Error("Request failed");
      if (!(err instanceof Error && "status" in err)) {
        last = new Error("Server offline. Riprova tra un attimo.");
      }
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403 || status === 400) throw err;
      if (i < tries - 1) await sleep(400 * (i + 1));
    }
  }
  throw last instanceof Error ? last : new Error("Request failed");
}
