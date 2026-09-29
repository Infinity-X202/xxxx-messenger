# Desktop admin · install from the hub

> **Target:** chi arriva da [Infinity X Admin Hub](https://infinity-x202.github.io/xxxx-messenger/) e vuole il pannello sul PC Windows — senza perdere la testa tra Docker e tunnel.

---

## 0 · Cosa stai installando

Non è un `.exe` misterioso: è **questo repository** + **Node.js** + il launcher **`xxxx Admin.bat`**.

Il desktop controller ([`apps/desktop/control.mjs`](../apps/desktop/control.mjs)):

- verifica/avvia **Postgres** e **Redis** (Docker se presente),
- alza **API + WebSocket** e **frontend Vite**,
- opzionalmente **cloudflared** (tunnel pubblico),
- serve una **UI locale** con iframe verso il pannello admin.

*Super-hacker aesthetic, operator-grade behavior.*

---

## 1 · Prerequisiti

| Tool | Versione | Note |
| --- | --- | --- |
| **Node.js** | ≥ 20.11 | [nodejs.org](https://nodejs.org/) |
| **Git** | recente | clone del repo |
| **Docker Desktop** | consigliato | Postgres + Redis senza drama |
| **cloudflared** | opzionale | tunnel Cloudflare (Windows Program Files) |

---

## 1b · Comandi Windows (gli stessi per tutti)

Dentro la cartella scompattata, in CMD:

```bat
prepara.bat
xxxx Admin.bat
```

Sono gli unici comandi. Stesso testo in [`COMANDI.txt`](../COMANDI.txt) sul repository.

## 2 · Clone & env · non skippare

```powershell
git clone https://github.com/Infinity-X202/xxxx-messenger.git
cd xxxx-messenger
copy .env.example .env
```

Apri `.env` e imposta almeno:

- `SESSION_SECRET` — stringa casuale lunga (64+ char in prod),
- `POSTGRES_PASSWORD` / `DATABASE_URL` coerenti,
- `REDIS_URL` se non usi default Docker.

**Mai** committare `.env`. Il repo ignora già i secret file.

```powershell
npm install
```

Prima migrazione (con DB up):

```powershell
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
```

---

## 3 · Launch · `xxxx Admin.bat`

Doppio clic su:

```text
xxxx Admin.bat
```

Equivalente:

```powershell
node apps\desktop\control.mjs
```

Si apre il pannello locale (porta **4780** di default). Da lì: avvio stack, log, URL tunnel quando cloudflared è attivo.

---

## 4 · Hub → GitHub → bat

Flusso consigliato dal sito:

1. Apri l’[Admin Hub](https://infinity-x202.github.io/xxxx-messenger/).
2. **Scarica da GitHub** → clone o ZIP di `Infinity-X202/xxxx-messenger`.
3. Completa **§2** (env + `npm install` + migrate).
4. **§3** — doppio clic sul `.bat`.

Query `?tunnel=https://…` sull’hub imposta il link “Apri login web” sul tuo tunnel attivo.

---

## 5 · Admin web · codice & accessi

- Login admin con codice **`adil`** (solo dispositivi di fiducia).
- **Admin → Accessi:** massimo **3** utenti oltre l’operatore principale.
- Ogni **nome** compare sulla **live cam**; dopo nuovo accesso → **re-login** sul telefono per attivare la cam.
- Registrazioni: **Cartelle / LiveCam** nel pannello.

---

## 6 · Troubleshooting · terminal energy

| Sintomo | Fix |
| --- | --- |
| `node` non riconosciuto | Reinstall Node, riapri terminale |
| DB connection refused | `docker compose up -d postgres redis`, controlla `DATABASE_URL` |
| Tunnel vuoto | Installa cloudflared, token in `.env` se usi compose profile tunnel |
| Live cam morta post-accesso | Utente deve **uscire e rifare login** |
| Porta 4780 occupata | Chiudi altra istanza del controller |

Log utili: output del `.bat` / `control.mjs` e log server (`npm run dev:server`).

---

## 7 · Link utili

- Repo: [github.com/Infinity-X202/xxxx-messenger](https://github.com/Infinity-X202/xxxx-messenger)
- Hub: [infinity-x202.github.io/xxxx-messenger](https://infinity-x202.github.io/xxxx-messenger/)
- Security: [`security.md`](security.md)

**Created by Infinity X** — Admin Panel App for **xxxx**.
