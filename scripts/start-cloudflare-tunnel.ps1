param(
  [string]$Token = $env:CLOUDFLARE_TUNNEL_TOKEN
)
if (-not $Token) {
  Write-Host "Imposta CLOUDFLARE_TUNNEL_TOKEN in .env (dashboard Cloudflare → Tunnels → token eyJ...)."
  exit 1
}
cloudflared tunnel --no-autoupdate run --token $Token
