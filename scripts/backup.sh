#!/usr/bin/env bash
set -euo pipefail
# PostgreSQL backup. Cloudflare Tunnel does NOT replace backups.
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$DIR"
FILE="$DIR/ixm-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-ixm}" "${POSTGRES_DB:-infinity_x}" | gzip > "$FILE"
echo "Wrote $FILE"
find "$DIR" -name "ixm-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
