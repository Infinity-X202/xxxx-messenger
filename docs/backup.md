# Backup PostgreSQL

Cloudflare Tunnel **non** è un backup. Un incident sull’host o un `volume rm` distrugge i dati anche con tunnel attivo.

## Backup

`scripts/backup.sh` esegue `pg_dump` nel container `postgres`, comprime, applica retention (`BACKUP_RETENTION_DAYS`).

Cron esempio (host):

```
0 3 * * * cd /path/to/xxx && bash scripts/backup.sh
```

Copia i file `backups/` su storage offline/object storage cifrato.

## Restore

```
bash scripts/restore.sh backups/ixm-YYYYMMDDThhmmssZ.sql.gz
```

Verifica su un ambiente di staging prima della produzione.

Redis: AOF è abilitato in Compose; non contiene i messaggi (solo rate limit/presence). Si può ricostruire.
