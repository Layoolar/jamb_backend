#!/usr/bin/env bash
#
# Nightly Postgres backup to Backblaze B2 (or any S3-compatible store).
#
#   crontab -e   ->   17 2 * * *  /srv/sabipass/api/deploy/backup.sh
#
# An untested backup is not a backup. deploy/restore-check.sh restores the
# newest dump into a scratch database and counts rows — run it before launch
# and after any schema change, not just when something has already gone wrong.

set -Eeuo pipefail

: "${PGDATABASE:=sabipass}"
: "${PGUSER:=sabipass}"
: "${BACKUP_DIR:=/var/backups/sabipass}"
: "${KEEP_DAYS:=14}"
# Set B2_BUCKET to push offsite. Local-only backups die with the machine.
: "${B2_BUCKET:=}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="${BACKUP_DIR}/${PGDATABASE}-${stamp}.dump"

mkdir -p "$BACKUP_DIR"

log() { printf '%s  %s\n' "$(date -u +%FT%TZ)" "$*"; }

fail() {
  log "BACKUP FAILED at line $1"
  exit 1
}
trap 'fail $LINENO' ERR

log "dumping ${PGDATABASE}"
# -Fc is the custom format: compressed, and restorable selectively with pg_restore.
pg_dump --format=custom --no-owner --no-privileges \
  --username="$PGUSER" --dbname="$PGDATABASE" --file="$file"

size=$(stat -c %s "$file")
# A dump this small means pg_dump produced an empty or broken file. Catch it
# here rather than discovering it during a restore.
if [ "$size" -lt 20000 ]; then
  log "dump is only ${size} bytes — refusing to treat that as a good backup"
  exit 1
fi
log "wrote ${file} (${size} bytes)"

if [ -n "$B2_BUCKET" ]; then
  log "uploading to ${B2_BUCKET}"
  rclone copy "$file" "${B2_BUCKET}/postgres/" --no-traverse
  log "upload done"
else
  log "B2_BUCKET unset — LOCAL ONLY. A disk failure loses this backup."
fi

log "pruning local dumps older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -name "${PGDATABASE}-*.dump" -mtime "+${KEEP_DAYS}" -delete

log "ok"
