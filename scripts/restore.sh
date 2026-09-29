#!/usr/bin/env bash
set -euo pipefail
FILE="${1:?Usage: restore.sh backups/ixm-....sql.gz}"
gzip -dc "$FILE" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-ixm}" -d "${POSTGRES_DB:-infinity_x}"
