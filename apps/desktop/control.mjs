import { spawn, execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
const storageDir = path.join(repo, "storage");
const setupDoneFlag = path.join(storageDir, ".admin-setup-done");

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpm(args) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", "npm", ...args], { cwd: repo });
  }
  return run("npm", args, { cwd: repo });
}

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
  phase: "idle",
  busy: false,
  tunnelUrl: "",
  error: "",
  step: "",
  log: [],
  setup: readSetupHints(),
};
const children = [];

function log(line) {
  const text = `[${new Date().toLocaleTimeString("en-GB")}] ${line}`;
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

function loadDotEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync(path.join(repo, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    /* optional until .env exists */
  }
  return env;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repo,
      windowsHide: true,
      shell: false,
      env: opts.env || process.env,
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

async function ensureFirstRunReady() {
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });

  const envPath = path.join(repo, ".env");
  const envExample = path.join(repo, ".env.example");

  if (!existsSync(envPath)) {
    state.phase = "setup";
    log("First-time setup (1/4): creating .env…");
    if (!existsSync(envExample)) throw new Error("Missing .env.example — re-download the Admin Panel zip.");
    let content = readFileSync(envExample, "utf8");
    const secret = randomBytes(32).toString("hex");
    const pgPass = randomBytes(16).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x").slice(0, 24);
    content = content.replace(/SESSION_SECRET=generate_a_64_byte_random_string/g, `SESSION_SECRET=${secret}`);
    content = content.replace(/change_me_strong_password/g, pgPass);
    writeFileSync(envPath, content, "utf8");
    log(".env ready (random secrets).");
  }

  if (!existsSync(path.join(repo, "node_modules"))) {
    state.phase = "setup";
    log("First-time setup (2/4): installing packages — please wait…");
    await runNpm(["install"]);
    log("Packages installed.");
  }

  state.setup = readSetupHints();
}

function databasePassword() {
  try {
    const envText = readFileSync(path.join(repo, ".env"), "utf8");
    const line = envText.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (!line) return "change_me_strong_password";
    const url = line.slice("DATABASE_URL=".length).trim();
    const m = url.match(/postgresql:\/\/[^:]+:([^@]+)@/);
    return m ? decodeURIComponent(m[1]) : "change_me_strong_password";
  } catch {
    return "change_me_strong_password";
  }
}

async function alignDatabaseLogin() {
  const pass = databasePassword().replace(/'/g, "''");
  mkdirSync(storageDir, { recursive: true });
  const sqlPath = path.join(storageDir, "align-db.sql");
  writeFileSync(
    sqlPath,
    `DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ixm') THEN
    CREATE ROLE ixm LOGIN PASSWORD '${pass}' SUPERUSER;
  ELSE
    ALTER ROLE ixm WITH LOGIN PASSWORD '${pass}' SUPERUSER;
  END IF;
END $$;
SELECT 'ok';
`,
    "utf8",
  );
  const wslSql = sqlPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
  await run(
    "wsl.exe",
    [
      "-u",
      "postgres",
      "-e",
      "bash",
      "-lc",
      `psql -d postgres -v ON_ERROR_STOP=1 -f '${wslSql}' && (psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='infinity_x'" | grep -q 1 || createdb -O ixm infinity_x)`,
    ],
    { allowFail: true },
  );
}

async function startPostgres() {
  if (await portOpen(5432)) return;
  log("Looking for Postgres in WSL…");
  const found = await run(
    "wsl.exe",
    ["-e", "bash", "-lc", "ls -d /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1"],
    { allowFail: true },
  );
  const pgCtl = found.trim().split(/\r?\n/).filter(Boolean).pop();
  if (pgCtl && pgCtl.includes("pg_ctl")) {
    const major = pgCtl.match(/postgresql\/(\d+)\//)?.[1] || "18";
    await run(
      "wsl.exe",
      [
        "-u",
        "postgres",
        "-e",
        "bash",
        "-lc",
        `${pgCtl} -D /var/lib/postgresql/${major}/main -l /tmp/pg-ixm.log -o '-c config_file=/etc/postgresql/${major}/main/postgresql.conf -c unix_socket_directories=/tmp -c listen_addresses=*' start`,
      ],
      { allowFail: true },
    );
  } else {
    await run("wsl.exe", ["-e", "bash", "-lc", "sudo service postgresql start || sudo pg_ctlcluster 18 main start || true"], {
      allowFail: true,
    });
  }
}

async function ensureDatabaseMigrated() {
  if (existsSync(setupDoneFlag)) return;
  state.phase = "setup";
  log("Preparing database…");
  await alignDatabaseLogin();
  const env = loadDotEnv();
  const prisma = path.join(repo, "node_modules", "prisma", "build", "index.js");
  await run(node, [prisma, "generate", "--schema", "prisma/schema.prisma"], { env });
  await run(node, [prisma, "migrate", "deploy", "--schema", "prisma/schema.prisma"], { env });
  writeFileSync(setupDoneFlag, new Date().toISOString(), "utf8");
  log("Database ready.");
}

async function ensureCloudflared() {
  if (existsSync(cloudflared) && cloudflared.endsWith(".exe")) return cloudflared;
  const bundled = path.join(storageDir, "bin", "cloudflared.exe");
  if (existsSync(bundled)) return bundled;
  const which = await run("where.exe", ["cloudflared"], { allowFail: true });
  const hit = which.split(/\r?\n/).map((s) => s.trim()).find((s) => s.toLowerCase().endsWith("cloudflared.exe"));
  if (hit && existsSync(hit)) return hit;
  state.phase = "setup";
  log("Downloading Cloudflare tunnel tool (one time)…");
  mkdirSync(path.dirname(bundled), { recursive: true });
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '${bundled.replace(/'/g, "''")}'`,
    ],
    { cwd: repo },
  );
  if (!existsSync(bundled)) throw new Error("Could not download cloudflared");
  return bundled;
}

async function accessCmd(args) {
  const out = await run(node, [tsx, "--env-file=.env", "apps/server/src/cli/access-cmd.ts", ...args], { allowFail: true });
  const line = out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("["))
    .pop();
  if (!line) {
    const err = out.trim().split(/\r?\n/).filter(Boolean).pop() || "Access command failed";
    throw new Error(err);
  }
  return JSON.parse(line);
}

async function startStack() {
  if (state.busy) return;
  state.busy = true;
  state.phase = "starting";
  state.tunnelUrl = "";
  try {
    state.error = "";
    state.step = "Preparing…";
    await ensureFirstRunReady();
    if ((await portOpen(3000)) && (await portOpen(5173))) {
      try {
        const health = await fetch("http://127.0.0.1:3000/health");
        if (health.ok) {
          log("Server already running.");
          state.phase = "online";
          state.error = "";
          if (!state.tunnelUrl) {
            const tunnelBin = await ensureCloudflared();
            const tunnel = track(
              spawn(tunnelBin, ["tunnel", "--url", "http://127.0.0.1:5173", "--protocol", "http2"], {
                cwd: repo,
                windowsHide: true,
              }),
            );
            state.tunnelUrl = await new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("Cloudflare did not return a link")), 45000);
              const onData = (buf) => {
                const found = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
                if (found) {
                  clearTimeout(timer);
                  resolve(found[0]);
                }
              };
              tunnel.stdout?.on("data", onData);
              tunnel.stderr?.on("data", onData);
              tunnel.on("exit", () => {
                clearTimeout(timer);
                reject(new Error("Cloudflare exited"));
              });
            });
          }
          log(`Link ready: ${state.tunnelUrl}`);
          return;
        }
      } catch {
        /* start fresh below */
      }
    }
    state.step = "Starting database…";
    log("Starting Postgres…");
    await startPostgres();
    await waitUntil(() => portOpen(5432), 35000, "Postgres is not responding. Install WSL + PostgreSQL, then press Start server again.");
    log("Postgres ready.");

    state.step = "Starting cache…";
    log("Starting Redis…");
    if (!(await portOpen(6379))) {
      await run("wsl.exe", ["-e", "bash", "-lc", "redis-cli ping || redis-server --daemonize yes"], { allowFail: true });
    }
    await waitUntil(() => portOpen(6379), 15000, "Redis is not responding");
    log("Redis ready.");

    await ensureDatabaseMigrated();

    state.step = "Starting API…";
    log("Starting backend…");
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
    }, 40000, "Backend did not start");
    log("Backend ready.");

    state.step = "Building site…";
    log("Building the xxxx site…");
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
    await waitUntil(() => portOpen(5173), 20000, "Site did not start");
    log("Site ready.");

    state.step = "Creating public link…";
    log("Opening Cloudflare tunnel…");
    const tunnelBin = await ensureCloudflared();
    await new Promise((resolve) => {
      execFile("taskkill", ["/IM", "cloudflared.exe", "/F"], { windowsHide: true }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 500));
    const tunnel = track(
      spawn(tunnelBin, ["tunnel", "--url", "http://127.0.0.1:5173", "--protocol", "http2"], {
        cwd: repo,
        windowsHide: true,
      }),
    );
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Cloudflare did not return a link")), 45000);
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
        reject(new Error("Cloudflare exited"));
      });
    });
    state.tunnelUrl = url;
    state.phase = "online";
    state.step = "Ready — copy your link";
    log(`Link ready: ${url}`);
    log("Send this link to the admin. After login, add guests in Access and grant permissions — live cam and folders will follow.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.phase = "error";
    state.error = message.replace(/\s+/g, " ").slice(0, 180);
    log(message);
  } finally {
    state.busy = false;
  }
}

async function stopStack() {
  state.busy = true;
  log("Stopping backend, site and tunnel…");
  for (const child of [...children]) killPid(child.pid);
  await killPort(3000);
  await killPort(5173);
  await new Promise((resolve) => {
    execFile("taskkill", ["/IM", "cloudflared.exe", "/F"], { windowsHide: true }, () => resolve());
  });
  state.tunnelUrl = "";
  state.phase = "idle";
  state.busy = false;
  log("Stopped. Postgres and Redis stay running.");
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
    send(res, 400, { error: err instanceof Error ? err.message : "error" });
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
  log("xxxx admin panel open.");
  openWindow();
});
