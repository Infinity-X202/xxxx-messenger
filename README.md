<p align="center">
  <strong>∞ INFINITY X · xxxx MESSENGER</strong><br/>
  <sub>self-hosted · websocket · live cam · zero firebase</sub>
</p>

<p align="center">
  <a href="https://infinity-x202.github.io/xxxx-messenger/">Admin Hub</a> ·
  <a href="https://infinitydev25.netlify.app">Hub (Netlify)</a> ·
  <a href="https://github.com/Infinity-X202/xxxx-messenger">GitHub</a> ·
  <a href="docs/desktop-admin.md">Desktop setup</a> ·
  <a href="docs/security.md">Security</a>
</p>

---

## Cos'è **xxxx**

**xxxx** è un messenger **self-hosted** — stile WhatsApp/Telegram, ma **tuo**: Node.js, PostgreSQL, Redis, WebSocket autenticato, tunnel Cloudflare opzionale, roadmap E2EE.

> `HTTPS ≠ E2EE`. Leggi [`docs/e2ee.md`](docs/e2ee.md) prima di promettere “crittografia totale” agli amici.

Niente Firebase. Niente vendor lock-in. Solo codice, `.env` e disciplina.

---

## Admin Panel App · desktop

Il **pannello Infinity X** non è un plugin random: è il **centro di controllo** per server, tunnel, accessi e live cam.

| Modalità | Cosa fa |
| --- | --- |
| **Windows desktop** | Doppio clic su [`xxxx Admin.bat`](xxxx%20Admin.bat) → avvia stack, tunnel, UI admin in iframe ([`apps/desktop/control.mjs`](apps/desktop/control.mjs)) |
| **Web admin** | Login sul tunnel con codice admin → sezione **Admin** (solo dispositivi di fiducia) |
| **Hub pubblico** | [infinity-x202.github.io/xxxx-messenger](https://infinity-x202.github.io/xxxx-messenger/) (GitHub Pages) · [Netlify mirror](https://infinitydev25.netlify.app) |

Scarica / clona da questo repo; il `.bat` è il launcher “one-click” dopo `npm install`.

Dettaglio install da sito → **[`docs/desktop-admin.md`](docs/desktop-admin.md)**.

---

## Live cam · max **3** utenti

Oltre l’admin (**Adil**), puoi avere fino a **3** accessi con codice segreto.

- Ogni **nome** compare sulla **live cam** (telefono → server).
- Gestisci **Accessi** da Admin: elimina, aggiungi, rigenera codici.
- Dopo un **nuovo accesso**, l’utente deve **rifare login** per attivare la live cam sul telefono.
- Registrazioni in **Cartelle / LiveCam** (lato admin).

*Slot limitati by design — non è un TikTok farm.*

---

## Quick start · hack the stack

```bash
git clone https://github.com/Infinity-X202/xxxx-messenger.git
cd xxxx-messenger
cp .env.example .env
# SESSION_SECRET ≥32 char, password DB robusta — mai nel git
npm install
```

**Sviluppo** (Postgres + Redis via Docker o locali):

```bash
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run dev:server    # API + WS :3000
npm run dev:web       # UI :5173
```

**Admin desktop (Windows):**

```text
xxxx Admin.bat
```

Richiede **Node 20.11+** già installato. Il launcher orchestra DB/API/Vite/tunnel.

**Produzione Docker:** `docker compose up --build` — vedi sezioni avanzate sotto.

---

## Security · read before you `push --force`

- [ ] **`.env` fuori dal repo** (già in `.gitignore`) — token tunnel, SMTP, DB solo locali
- [ ] `SESSION_SECRET` e password DB **lunghi e unici**
- [ ] Redis/Postgres **non** esposti su Internet
- [ ] CORS **ristretto** all’origine reale (mai `*` in prod)
- [ ] Codice admin solo su **macchine di fiducia**
- [ ] Checklist completa → [`docs/security.md`](docs/security.md)

Non committare secret. Non hardcodare token. Non fidarti del “è solo un test”.

---

## Docs · deep dive

| Doc | Contenuto |
| --- | --- |
| [`docs/desktop-admin.md`](docs/desktop-admin.md) | Install admin da hub / desktop |
| [`docs/cloudflare.md`](docs/cloudflare.md) | Tunnel & DNS |
| [`docs/backup.md`](docs/backup.md) | Backup PostgreSQL |
| [`docs/api.md`](docs/api.md) | API versionata |
| [`docs/e2ee.md`](docs/e2ee.md) | TLS vs E2EE |

<details>
<summary><strong>Stack completo (Docker, seed, test, migrate)</strong></summary>

**Requisiti:** Node 20.11+, npm 10+, Docker Compose opzionale, `cloudflared` opzionale.

**Variabili `.env` principali:** `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `APP_URL`, `CORS_ORIGIN`, `CLOUDFLARE_TUNNEL_TOKEN`, `SMTP_*`, `BOOTSTRAP_ADMIN_EMAIL` (promuove admin al register se impostata).

**Docker prod:** `docker compose up --build` → UI `http://localhost:8080`. Tunnel: `docker compose --profile tunnel up --build`.

**Seed dev:** `SEED_USER_PASSWORD='…' npm run db:seed` → utenti demo, **nessun admin di default**.

**Test:** `npm test` (integrazione richiede env DB/Redis).

**Backup:** `bash scripts/backup.sh` — vedi `docs/backup.md`.

**Aggiornamenti:** backup → `git pull` → rebuild container → migrate on boot.

</details>

---

<p align="center">
  <strong>Created by <a href="https://infinitydev25.netlify.app">Infinity X</a></strong><br/>
  <sub>Admin Panel App · xxxx messenger · stay sharp, stay private</sub>
</p>
