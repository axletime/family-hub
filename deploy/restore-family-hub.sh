#!/bin/bash
#
# Restore Family Hub from an archive made by backup-family-hub.sh.
#
# Usage:
#   bash restore-family-hub.sh /mnt/user/backups/family-hub/family-hub-2026-11-26_030000.tar.gz [--with-env] [--yes]
#
#   --with-env   also restore the .env file (the current one is kept as .env.pre-restore-<time>)
#   --yes        do not ask for confirmation
#
# Steps: checks the archive, stops the container, moves the current data folder
# aside to <data folder>.pre-restore-<time> (nothing is deleted), puts the backed-up
# data in place, fixes ownership and starts the container again.

# ============================ Settings ======================================
CONTAINER="${CONTAINER:-family-hub}"
DATA_DIR="${DATA_DIR:-/mnt/user/appdata/family-hub-data}"
ENV_FILE="${ENV_FILE:-/mnt/user/appdata/family-hub-src/.env}"
DB_NAME="${DB_NAME:-family-hub.db}"
APP_UID="${APP_UID:-99}"
APP_GID="${APP_GID:-100}"
# ============================================================================

set -uo pipefail
umask 077

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "RESTORE FAILED: $*"; exit 1; }

ARCHIVE=""
WITH_ENV=0
YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --with-env) WITH_ENV=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) fail "unknown option $arg" ;;
    *) if [ -z "$ARCHIVE" ]; then ARCHIVE="$arg"; else fail "only one archive can be given"; fi ;;
  esac
done
[ -n "$ARCHIVE" ] || { sed -n '2,14p' "$0"; exit 1; }
[ -f "$ARCHIVE" ] || fail "archive $ARCHIVE not found"
command -v docker >/dev/null 2>&1 || fail "docker command not found"

TS="$(date +%Y-%m-%d_%H%M%S)"
WORK="$(mktemp -d "$(dirname "$DATA_DIR")/.fh-restore-XXXXXX")" || fail "cannot create a work folder next to $DATA_DIR"
STOPPED=0
# shellcheck disable=SC2317  # called via trap
cleanup() {
  rm -rf "$WORK"
  if [ "$STOPPED" = 1 ]; then
    log "Starting $CONTAINER again..."
    docker start "$CONTAINER" >/dev/null 2>&1 || log "ERROR: could not start $CONTAINER - start it from the Docker tab."
  fi
}
trap cleanup EXIT

log "Checking $ARCHIVE ..."
tar -tzf "$ARCHIVE" >/dev/null 2>&1 || fail "the archive is damaged or not a .tar.gz"
tar -xzf "$ARCHIVE" -C "$WORK" || fail "could not unpack the archive"
[ -f "$WORK/data/$DB_NAME" ] || fail "the archive has no data/$DB_NAME - is it a Family Hub backup?"
[ -f "$WORK/MANIFEST.txt" ] && sed -n '1,9p' "$WORK/MANIFEST.txt"
[ -f "$WORK/data/.secret-key" ] || log "Note: the archive has no .secret-key (fine if APP_SECRET is set in .env)."
if [ "$WITH_ENV" = 1 ] && [ ! -f "$WORK/env/.env" ]; then fail "--with-env given but the archive has no .env"; fi

echo
echo "This will:"
echo "  - stop the container '$CONTAINER'"
echo "  - move the current data folder to $DATA_DIR.pre-restore-$TS"
echo "  - restore the data folder from the archive"
[ "$WITH_ENV" = 1 ] && echo "  - restore $ENV_FILE (current one kept as $ENV_FILE.pre-restore-$TS)"
echo "  - start the container again"
echo "Anything added since the backup was made (requests, settings) will be lost."
if [ "$YES" != 1 ]; then
  printf 'Type "yes" to continue: '
  read -r answer || answer=""
  [ "$answer" = "yes" ] || { log "Cancelled, nothing was changed."; exit 1; }
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]; then
  log "Stopping $CONTAINER..."
  docker stop -t 30 "$CONTAINER" >/dev/null || fail "could not stop $CONTAINER"
  STOPPED=1
else
  log "$CONTAINER is not running (it will be started at the end if it exists)."
  docker inspect "$CONTAINER" >/dev/null 2>&1 && STOPPED=1
fi

if [ -e "$DATA_DIR" ]; then
  mv "$DATA_DIR" "$DATA_DIR.pre-restore-$TS" || fail "could not move the current data folder aside"
  log "Current data moved to $DATA_DIR.pre-restore-$TS"
fi
if ! mv "$WORK/data" "$DATA_DIR"; then
  [ -e "$DATA_DIR.pre-restore-$TS" ] && mv "$DATA_DIR.pre-restore-$TS" "$DATA_DIR"
  fail "could not put the restored data in place (the original folder was put back)"
fi
rm -f "$DATA_DIR/$DB_NAME-wal" "$DATA_DIR/$DB_NAME-shm"
chown -R "$APP_UID:$APP_GID" "$DATA_DIR" 2>/dev/null || log "Note: could not change ownership to $APP_UID:$APP_GID"
chmod 755 "$DATA_DIR"
[ -f "$DATA_DIR/.secret-key" ] && chmod 600 "$DATA_DIR/.secret-key"
log "Data folder restored."

if [ "$WITH_ENV" = 1 ]; then
  [ -f "$ENV_FILE" ] && cp -p "$ENV_FILE" "$ENV_FILE.pre-restore-$TS"
  mkdir -p "$(dirname "$ENV_FILE")"
  cp "$WORK/env/.env" "$ENV_FILE" || fail "could not restore $ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "Restored $ENV_FILE. Note: a changed .env only takes effect when the container is re-created (docker rm + docker run)."
fi

if [ "$STOPPED" = 1 ]; then
  log "Starting $CONTAINER..."
  docker start "$CONTAINER" >/dev/null || fail "could not start $CONTAINER - start it from the Docker tab"
  STOPPED=0
fi
log "Restore finished. Check the hub, then delete $DATA_DIR.pre-restore-$TS when you are happy."
exit 0
