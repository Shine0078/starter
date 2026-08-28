#!/usr/bin/env sh
set -eu

# Backups contain the complete financial database. Encryption is mandatory:
# compression and filesystem permissions are not confidentiality controls.
umask 077

backup_dir="${FINVERSE_BACKUP_DIR:-/var/backups/finverse}"
retention_days="${FINVERSE_BACKUP_RETENTION_DAYS:-14}"
age_recipient="${FINVERSE_BACKUP_AGE_RECIPIENT:-}"
if [ -z "$age_recipient" ]; then
  echo 'FINVERSE_BACKUP_AGE_RECIPIENT is required; refusing an unencrypted backup.' >&2
  exit 1
fi
case "$age_recipient" in
  age1[0-9a-z]*) ;;
  *) echo 'FINVERSE_BACKUP_AGE_RECIPIENT must be an age1 recipient.' >&2; exit 1 ;;
esac
if ! command -v age >/dev/null 2>&1; then
  echo 'The age binary is required for encrypted backups.' >&2
  exit 1
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/finverse-$stamp.sql.gz.age"
tmp="$backup_dir/.finverse-$stamp.sql"
tmp_gz="$tmp.gz"
tmp_age="$backup_dir/.finverse-$stamp.sql.gz.age"
trap 'rm -f -- "$tmp" "$tmp_gz" "$tmp_age"' EXIT HUP INT TERM
docker compose --env-file infra/.env.oracle -f infra/docker-compose.oracle.yml exec -T db \
  sh -c 'pg_dump --clean --if-exists --no-owner --no-privileges \
    -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$tmp"
gzip -9 "$tmp"
age --encrypt --recipient "$age_recipient" --output "$tmp_age" "$tmp_gz"
mv -- "$tmp_age" "$file"
rm -f -- "$tmp_gz"
chmod 600 "$file"
trap - EXIT HUP INT TERM

find "$backup_dir" -type f -name 'finverse-*.sql.gz.age' -mtime "+$retention_days" -delete
printf 'Created %s\n' "$file"
