#!/bin/bash
set -euo pipefail
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ixm') THEN
    CREATE ROLE ixm LOGIN PASSWORD 'change_me_strong_password' SUPERUSER;
  ELSE
    ALTER ROLE ixm WITH LOGIN PASSWORD 'change_me_strong_password' SUPERUSER;
  END IF;
END
$$;
SQL
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = 'infinity_x'" | grep -q 1 \
  || sudo -u postgres createdb -O ixm infinity_x
echo "db ready"
