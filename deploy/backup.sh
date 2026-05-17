#!/usr/bin/env bash
# Faye nightly backup. Runs on the Hetzner box via /etc/cron.d/faye.
# Requires: pg_dump (postgres-client), b2 (Backblaze CLI authenticated as faye-backups bucket owner).
# Set BACKUP_BUCKET / BACKUP_PREFIX env vars (defaulted below) and ensure DATABASE_URL is in /opt/faye/.env.

set -euo pipefail

BUCKET="${BACKUP_BUCKET:-faye-backups}"
PREFIX="${BACKUP_PREFIX:-db}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"

if [[ -f /opt/faye/.env ]]; then
  # shellcheck disable=SC1091
  set -o allexport
  source /opt/faye/.env
  set +o allexport
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set; aborting" >&2
  exit 2
fi

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT="/tmp/faye-${TS}.sql.gz"

echo "Dumping DB to ${OUT}..."
umask 077
pg_dump --no-owner --no-privileges "${DATABASE_URL}" | gzip -9 > "${OUT}"

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
