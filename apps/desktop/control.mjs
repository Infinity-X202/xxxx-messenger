import { spawn, execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 4780;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const tsx = path.join(repo, "node_modules", "tsx", "dist", "cli.mjs");
const viteBin = path.join(repo, "node_modules", "vite", "bin", "vite.js");
const cloudflared =
  ["C:\\Program Files (x86)\\cloudflared\\cloudflared.exe", "C:\\Program Files\\cloudflared\\cloudflared.exe"].find((p) => existsSync(p)) ||
  "cloudflared";

function readSetupHints() {
  const envPath = path.join(repo, ".env");
  const envExample = path.join(repo, ".env.example");
  const nodeModules = path.join(repo, "node_modules");
  return {
    hasEnv: existsSync(envPath),
    hasEnvExample: existsSync(envExample),
    hasNodeModules: existsSync(nodeModules),
    repoRoot: repo,
  };
}

const state = {
  phase: "fermo",
  busy: false,
  tunnelUrl: "",
  log: [],
  setup: readSetupHints(),
};
const children = [];

function log(line) {
  const text = `[${new Date().toLocaleTimeString("it-IT")}] ${line}`;
  state.log.push(text);
  if (state.log.length > 200) state.log.shift();
  console.log(text);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    setTimeout(() => done(false), 800);
  });
}

function waitUntil(check, ms, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await check()) return resolve();
      if (Date.now() - start > ms) return reject(new Error(label));
      setTimeout(tick, 700);
    };
    tick();
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repo,
      windowsHide: true,
      shell: false,
      ...opts,
    });
    let out = "";
    child.stdout?.on("data", (b) => {
      out += b.toString();
    });
    child.stderr?.on("data", (b) => {
      out += b.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || opts.allowFail) resolve(out);
      else reject(new Error(out.trim().slice(-400) || `${cmd} exit ${code}`));
    });
  });
}

function track(child) {
  children.push(child);
  child.on("exit", () => {
    const i = children.indexOf(child);
    if (i >= 0) children.splice(i, 1);
  });
  return child;
}

function killPid(pid) {
  if (!pid) return;
  try {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } catch {
    /* already gone */
  }
}

function killPort(port) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ],
      { windowsHide: true },
      () => resolve(),
    );
  });
}

async function accessCmd(args) {
  const out = await run(node, [tsx, "--env-file=.env", "apps/server/src/cli/access-cmd.ts", ...args], { allowFail: true });
  const line = out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("["))
    .pop();
  if (!line) {
    const err = out.trim().split(/\r?\n/).filter(Boolean).pop() || "Comando accessi fallito";
    throw new Error(err);
  }
  return JSON.parse(line);
}

async function startStack() {
  if (state.busy) return;
  state.setup = readSetupHints();
  if (!state.setup.hasNodeModules) {
    state.phase = "errore";
    log("Manca node_modules — nella root del repo esegui: npm install");
    return;
  }
  if (!state.setup.hasEnv) {
    state.phase = "errore";
    log("Manca il file .env — copia .env.example → .env e compila DATABASE_URL, REDIS_URL, SESSION_SECRET.");
    return;
  }
  state.busy = true;
  state.phase = "avvio";
  state.tunnelUrl = "";
  try {
    log("Avvio Postgres…");
    if (!(await portOpen(5432))) {
      await run(
        "wsl.exe",
        [
          "-u",
          "postgres",
          "-e",
          "bash",
          "-lc",
          "/usr/lib/postgresql/18/bin/pg_ctl -D /var/lib/postgresql/18/main -l /tmp/pg-18-main.log -o '-c config_file=/etc/postgresql/18/main/postgresql.conf -c unix_socket_directories=/tmp -c listen_addresses=*' start",
        ],
        { allowFail: true },
      );
    }
    await waitUntil(() => portOpen(5432), 25000, "Postgres non risponde");
    log("Postgres pronto.");

    log("Avvio Redis…");
    if (!(await portOpen(6379))) {
      await run("wsl.exe", ["-e", "bash", "-lc", "redis-cli ping || redis-server --daemonize yes"], { allowFail: true });
    }
    await waitUntil(() => portOpen(6379), 15000, "Redis non risponde");
    log("Redis pronto.");

    log("Avvio backend…");
    await killPort(3000);
    await new Promise((r) => setTimeout(r, 800));
    const api = track(
      spawn(node, [tsx, "--env-file=.env", "apps/server/src/index.ts"], {
        cwd: repo,
        windowsHide: true,
      }),
    );
    api.stdout?.on("data", (b) => {
      const line = b.toString().trim();
      if (line) log(`api ${line.slice(0, 180)}`);
    });
    api.stderr?.on("data", (b) => {
      const line = b.toString().trim();
      if (line && !line.includes("ExperimentalWarning")) log(`api ${line.slice(0, 180)}`);
    });
    await waitUntil(async () => {
      try {
        const res = await fetch("http://127.0.0.1:3000/health");
        return res.ok;
      } catch {
        return false;
      }
    }, 40000, "Il backend non è partito");
    log("Backend pronto.");

    log("Preparo il sito xxxx…");
    await run(node, [viteBin, "build"], { cwd: path.join(repo, "apps", "web") });
    await killPort(5173);
    await new Promise((r) => setTimeout(r, 600));
    const web = track(
      spawn(node, [viteBin, "preview", "--port", "5173", "--host", "--strictPort"], {
        cwd: path.join(repo, "apps", "web"),
        windowsHide: true,
      }),
    );
    web.stdout?.on("data", (b) => {
      const line = b.toString().trim();
      if (line) log(line.slice(0, 180));
    });
    web.stderr?.on("data", (b) => {
      const line = b.toString().trim();
      if (line) log(line.slice(0, 180));
    });
    await waitUntil(() => portOpen(5173), 20000, "Il sito non è partito");
    log("Sito pronto.");

    log("Apro il tunnel Cloudflare…");
    await new Promise((resolve) => {
      execFile("taskkill", ["/IM", "cloudflared.exe", "/F"], { windowsHide: true }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 500));
    const tunnel = track(
      spawn(cloudflared, ["tunnel", "--url", "http://127.0.0.1:5173", "--protocol", "http2"], {
        cwd: repo,
        windowsHide: true,
      }),
    );
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Cloudflare non ha dato il link")), 45000);
      const onData = (buf) => {
        const text = buf.toString();
        const found = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (found) {
          clearTimeout(timer);
          resolve(found[0]);
        }
      };
      tunnel.stdout?.on("data", onData);
      tunnel.stderr?.on("data", onData);
      tunnel.on("exit", () => {
        clearTimeout(timer);
        reject(new Error("Cloudflare si è chiuso"));
      });
    });
    state.tunnelUrl = url;
    state.phase = "online";
    log(`Link pronto: ${url}`);
  } catch (err) {
    state.phase = "errore";
    log(err instanceof Error ? err.message : String(err));
  } finally {
    state.busy = false;
  }
}

async function stopStack() {
  state.busy = true;
  log("Spengo backend, sito e tunnel…");
  for (const child of [...children]) killPid(child.pid);
  await killPort(3000);
  await killPort(5173);
  await new Promise((resolve) => {
    execFile("taskkill", ["/IM", "cloudflared.exe", "/F"], { windowsHide: true }, () => resolve());
  });
  state.tunnelUrl = "";
  state.phase = "fermo";
  state.busy = false;
  log("Spento. Postgres e Redis restano attivi.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

async function handleDesktop(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/desktop")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(path.join(desktopDir, "index.html")).pipe(res);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    state.setup = readSetupHints();
    send(res, 200, state);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/start") {
    void startStack();
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/stop") {
    await stopStack();
    send(res, 200, state);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/access") {
    send(res, 200, { entries: await accessCmd(["list"]) });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/access") {
    const body = await readBody(req);
    const entries = await accessCmd(["add", String(body.name || ""), String(body.code || "")]);
    send(res, 200, { entries });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/access/remove") {
    const body = await readBody(req);
    const entries = await accessCmd(["remove", String(body.username || "")]);
    send(res, 200, { entries });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (await handleDesktop(req, res)) return;
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : "errore" });
  }
});

function openWindow() {
  const appUrl = `http://127.0.0.1:${PORT}`;
  const browsers = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const exe = browsers.find((p) => existsSync(p));
  if (exe) {
    spawn(exe, [`--app=${appUrl}`, "--window-size=1480,920"], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("cmd", ["/c", "start", "", appUrl], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
}

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    openWindow();
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  log("Pannello xxxx aperto.");
  openWindow();
});
