#!/usr/bin/env sh
set -eu

compose="docker compose --env-file infra/.env.oracle -f infra/docker-compose.oracle.yml"

if [ ! -f infra/.env.oracle ]; then
  echo 'Missing infra/.env.oracle. Copy infra/.env.oracle.example and fill it first.' >&2
  exit 1
fi

$compose config --quiet
$compose up -d --build
$compose ps

echo 'Deployment started. Verify https://YOUR_PUBLIC_HOSTNAME/healthz and /app/.'
