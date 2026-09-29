DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ixm') THEN
    CREATE ROLE ixm LOGIN PASSWORD 'change_me_strong_password' SUPERUSER;
  ELSE
    ALTER ROLE ixm WITH LOGIN PASSWORD 'change_me_strong_password' SUPERUSER;
  END IF;
END $$;
SELECT 'ok' WHERE EXISTS (SELECT 1 FROM pg_database WHERE datname = 'infinity_x');
