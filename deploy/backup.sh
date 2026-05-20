#!/usr/bin/env bash
# Faye nightly backup. Runs on the Hetzner box via /etc/cron.d/faye.
# Dumps the compose-managed postgres container via `docker compose exec`.
# Requires: b2 CLI authenticated as the faye-backups bucket owner.
# Set BACKUP_BUCKET / BACKUP_PREFIX env vars (defaulted below).

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/faye}"
BUCKET="${BACKUP_BUCKET:-faye-backups}"
PREFIX="${BACKUP_PREFIX:-db}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"

if [[ -f "$APP_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -o allexport
  source "$APP_DIR/.env"
  set +o allexport
fi

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD not set in $APP_DIR/.env; aborting" >&2
  exit 2
fi

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT="/tmp/faye-${TS}.sql.gz"

echo "Dumping DB to ${OUT}..."
umask 077
docker compose -f "$APP_DIR/docker-compose.yml" exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  pg_dump --no-owner --no-privileges -U faye -d faye | gzip -9 > "${OUT}"

SIZE="$(stat -c%s "${OUT}" 2>/dev/null || stat -f%z "${OUT}")"
if [[ "${SIZE}" -lt 1024 ]]; then
  echo "Dump suspiciously small (${SIZE} bytes); aborting upload" >&2
  rm -f "${OUT}"
  exit 3
fi

REMOTE_KEY="${PREFIX}/${TS}.sql.gz"
echo "Uploading to b2://${BUCKET}/${REMOTE_KEY}..."
b2 file upload "${BUCKET}" "${OUT}" "${REMOTE_KEY}"

rm -f "${OUT}"

# Prune old objects beyond RETAIN_DAYS. The b2 CLI doesn't support a one-liner;
# rely on bucket lifecycle rules in B2 for hard retention. This script just notes
# the policy.
echo "OK. Retention policy is bucket-level (configure in B2 console for ${RETAIN_DAYS}-day max)."
