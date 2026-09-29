# Cloudflare Tunnel (Windows / WSL)

HTTPS verso gli utenti passa da Cloudflare. TLS **non** è E2EE.

## 1. Crea il tunnel

1. Apri https://one.dash.cloudflare.com/ → **Networks** → **Tunnels** → **Create a tunnel**.
2. Nome: `infinity-x`.
3. Scegli **Cloudflared** / Windows o Docker e **copia solo il token** (`eyJ...`).
4. Incolla il token in `.env` come `CLOUDFLARE_TUNNEL_TOKEN`.
5. Public hostname: `https://chat.TUODOMINIO.com` → servizio `http://127.0.0.1:5173` (sviluppo) oppure `http://frontend:80` (Docker Compose).

## 2. Variabili app

In `.env` imposta anche:

```
APP_URL=https://chat.TUODOMINIO.com
CORS_ORIGIN=https://chat.TUODOMINIO.com
TRUST_PROXY=true
```

## 3. Avvio locale del connettore

Con Docker:

```
docker compose --profile tunnel up -d cloudflared
```

Senza Docker, con `cloudflared` installato:

```
cloudflared tunnel --no-autoupdate run --token %CLOUDFLARE_TUNNEL_TOKEN%
```

SSL/TLS sul dominio: **Full**. HSTS dal dashboard Cloudflare.

Il token non va mai nel git.
