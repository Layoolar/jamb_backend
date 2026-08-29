#!/usr/bin/env bash
#
# Proves the newest backup actually restores.
#
#   ./deploy/restore-check.sh
#
# Run this before launch and after any schema change. The failure mode this
# exists to catch is the common one: nightly dumps running happily for months
# and turning out to be unrestorable on the day you need them.

set -Eeuo pipefail

: "${BACKUP_DIR:=/var/backups/sabipass}"
: "${PGDATABASE:=sabipass}"
: "${PGUSER:=sabipass}"
SCRATCH="sabipass_restore_check_$$"

log() { printf '%s  %s\n' "$(date -u +%FT%TZ)" "$*"; }

newest="$(find "$BACKUP_DIR" -name "${PGDATABASE}-*.dump" -printf '%T@ %p\n' \
  | sort -rn | head -1 | cut -d' ' -f2-)"

if [ -z "$newest" ]; then
  log "no dumps found in ${BACKUP_DIR}"
  exit 1
fi

age_days=$(( ( $(date +%s) - $(stat -c %Y "$newest") ) / 86400 ))
log "newest dump: ${newest} (${age_days} days old)"
if [ "$age_days" -gt 2 ]; then
  log "WARNING: that backup is stale — is the cron job running?"
fi

cleanup() {
  dropdb --username="$PGUSER" --if-exists "$SCRATCH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "restoring into scratch database ${SCRATCH}"
createdb --username="$PGUSER" "$SCRATCH"
pg_restore --username="$PGUSER" --dbname="$SCRATCH" --no-owner --no-privileges "$newest"

log "row counts in the restored copy:"
psql --username="$PGUSER" --dbname="$SCRATCH" -tA -c "
  select 'users: '       || count(*) from users
  union all select 'questions: '  || count(*) from questions
  union all select 'matches: '    || count(*) from matches
  union all select 'answers: '    || count(*) from answers;
"

questions=$(psql --username="$PGUSER" --dbname="$SCRATCH" -tAc "select count(*) from questions where status='live';")
if [ "$questions" -lt 1 ]; then
  log "FAIL: the restored copy has no live questions"
  exit 1
fi

log "OK — backup restores and contains ${questions} live questions"
