#!/usr/bin/env sh
set -eu

backup_dir="${FINVERSE_BACKUP_DIR:-/var/backups/finverse}"
retention_days="${FINVERSE_BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/finverse-$stamp.sql.gz"
docker compose --env-file infra/.env.oracle -f infra/docker-compose.oracle.yml exec -T db \
  pg_dump --clean --if-exists --no-owner --no-privileges \
  -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip -9 > "$file"

find "$backup_dir" -type f -name 'finverse-*.sql.gz' -mtime "+$retention_days" -delete
printf 'Created %s\n' "$file"
