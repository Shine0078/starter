#!/usr/bin/env sh
set -eu

# Backups contain the complete financial database. Keep every directory and
# archive owner-readable while the archive is handed to the encrypted storage
# process documented by the deployment runbook.
umask 077

backup_dir="${FINVERSE_BACKUP_DIR:-/var/backups/finverse}"
retention_days="${FINVERSE_BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/finverse-$stamp.sql.gz"
tmp="$backup_dir/.finverse-$stamp.sql"
trap 'rm -f "$tmp" "$tmp.gz"' EXIT HUP INT TERM
docker compose --env-file infra/.env.oracle -f infra/docker-compose.oracle.yml exec -T db \
  sh -c 'pg_dump --clean --if-exists --no-owner --no-privileges \
    -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$tmp"
gzip -9 "$tmp"
mv "$tmp.gz" "$file"
chmod 600 "$file"
trap - EXIT HUP INT TERM

find "$backup_dir" -type f -name 'finverse-*.sql.gz' -mtime "+$retention_days" -delete
printf 'Created %s\n' "$file"
