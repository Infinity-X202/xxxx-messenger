# Infinity X Admin Hub (`sites/infinityx-admin`)

Static marketing site for the **Admin Panel App** (desktop launcher), not the in-browser web admin as the primary product.

## Deploy (Agent 2–3)

- **Live hub (GitHub Pages):** [https://infinity-x202.github.io/xxxx-messenger/](https://infinity-x202.github.io/xxxx-messenger/)
- **Netlify mirror:** offline while account quota exceeded (`infinitydev25.netlify.app`)
- **Publish directory:** `sites/infinityx-admin` (see `netlify.toml`: `publish = "."` when build context is this folder)
- No build step — single `index.html` + optional assets.

## URLs

| Path | Purpose |
|------|---------|
| `/` | Landing / install instructions |
| `/?tunnel=https://….trycloudflare.com` | Highlights active tunnel + “Apri login” (validated host suffix) |

Desktop app sets Hub link to `https://infinitydev25.netlify.app/?tunnel=<encoded>` when tunnel is online.

## Copy & branding

- **Created by:** Infinity X
- **Messenger name:** xxxx
- **Download source:** https://github.com/Infinity-X202/xxxx-messenger (until GitHub Releases exist)

## Related repo paths

- Desktop launcher: `apps/desktop/control.mjs`, `apps/desktop/index.html`
- Windows entry: `xxxx Admin.bat` (repo root)
- Web admin (iframe inside desktop): `apps/web` — build via desktop start or `npm run build -w @ixm/web`

## Fresh-install blockers (document on site)

Users need: Node 20+, `npm install`, `.env` from `.env.example`, WSL Postgres (5432) + Redis (6379), optional `cloudflared`, and `npm run db:migrate` before first successful API start.
