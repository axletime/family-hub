#!/bin/bash
#description=Back up Family Hub (database, secret key and .env) to a dated .tar.gz and keep the last few days.
#arrayStarted=true
#
# Family Hub backup for Unraid (User Scripts plugin or any cron).
#
# What it backs up
#   - the data folder (SQLite database, .secret-key and anything else in it)
#   - the .env file (optional)
#
# The database is copied with SQLite's online backup API *inside* the running
# container (using the app's own better-sqlite3), so Family Hub keeps running.
# If that fails, the container is stopped for a few seconds, the files are
# copied and it is started again.
#
# The archive contains the encryption key and your API keys/tokens: keep it on
# the array or on encrypted off-site storage, never anywhere public.
#
# Every setting below can also be given as an environment variable, e.g.
#   KEEP_DAYS=30 DEST=/mnt/user/backups/fh bash backup-family-hub.sh

# ============================ Settings ======================================
CONTAINER="${CONTAINER:-family-hub}"                          # docker container name
DATA_DIR="${DATA_DIR:-/mnt/user/appdata/family-hub-data}"      # host folder mounted at /data
ENV_FILE="${ENV_FILE:-/mnt/user/appdata/family-hub-src/.env}"  # leave blank to skip the .env
DEST="${DEST:-/mnt/user/backups/family-hub}"                   # where archives are written
KEEP_DAYS="${KEEP_DAYS:-14}"                                   # delete archives older than this (0 = keep all)
DB_NAME="${DB_NAME:-family-hub.db}"                            # database file name inside the data folder
CONTAINER_DATA="${CONTAINER_DATA:-/data}"                      # data folder path inside the container
ALLOW_STOP="${ALLOW_STOP:-yes}"                                # yes = briefly stop the container if the online copy fails
APP_UID="${APP_UID:-99}"                                       # owner of the data folder (Unraid: nobody)
APP_GID="${APP_GID:-100}"                                      # group of the data folder (Unraid: users)

# Optional ntfy alerts. Leave NTFY_TOPIC blank to disable.
NTFY_URL="${NTFY_URL:-https://ntfy.sh}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
NTFY_TOKEN="${NTFY_TOKEN:-}"                                   # tk_... or user:password, if your server needs it
NOTIFY_ON_SUCCESS="${NOTIFY_ON_SUCCESS:-no}"                   # yes = also send a quiet message on success
# ============================================================================

set -uo pipefail
umask 077

TS="$(date +%Y-%m-%d_%H%M%S)"
ARCHIVE_NAME="family-hub-${TS}.tar.gz"
TMP_DB=".fh-backup-${TS}.db"         # temporary copy inside the data folder
STAGING=""
STOPPED_BY_US=0
METHOD=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

notify() { # notify <title> <message> <priority> <tags>
  [ -n "$NTFY_TOPIC" ] || return 0
  command -v curl >/dev/null 2>&1 || { log "WARNING: curl not found, cannot send ntfy alert"; return 0; }
  local auth=()
  if [ -n "$NTFY_TOKEN" ]; then
    case "$NTFY_TOKEN" in
      tk_*) auth=(-H "Authorization: Bearer $NTFY_TOKEN") ;;
      *:*) auth=(-u "$NTFY_TOKEN") ;;
      *) auth=(-H "Authorization: Bearer $NTFY_TOKEN") ;;
    esac
  fi
  curl -fsS -m 15 "${auth[@]}" -H "Title: $1" -H "Priority: $3" -H "Tags: $4" \
    -d "$2" "${NTFY_URL%/}/$NTFY_TOPIC" >/dev/null 2>&1 || log "WARNING: could not send ntfy alert"
}

# shellcheck disable=SC2317  # called via trap
cleanup() {
  if [ "$STOPPED_BY_US" = 1 ]; then
    log "Starting the container again..."
    docker start "$CONTAINER" >/dev/null 2>&1 || log "ERROR: could not start $CONTAINER - start it from the Docker tab!"
    STOPPED_BY_US=0
  fi
  rm -f "$DATA_DIR/$TMP_DB" "$DATA_DIR/$TMP_DB-wal" "$DATA_DIR/$TMP_DB-shm" "$DATA_DIR/$TMP_DB-journal" 2>/dev/null
  [ -n "$STAGING" ] && rm -rf "$STAGING"
  rm -f "$DEST/$ARCHIVE_NAME.partial" 2>/dev/null
}
trap cleanup EXIT

fail() {
  log "BACKUP FAILED: $*"
  notify "Family Hub backup failed" "$(hostname): $*" high warning
  exit 1
}

running() { [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]; }

# --- Node snippets run inside the container (cwd /app has node_modules/better-sqlite3) ---
JS_LOAD='let D;try{D=require("better-sqlite3")}catch(e){D=require("/app/node_modules/better-sqlite3")}'
# Online backup: argv = <source db> <destination file>
JS_BACKUP="$JS_LOAD"'
const [src,dst]=process.argv.slice(1);
const db=new D(src,{readonly:true,fileMustExist:true});
db.backup(dst).then(()=>{db.close();console.log("ok")}).catch(e=>{console.error(e.message);process.exit(1)});'
# Integrity check, then fold any WAL into the file so it is self-contained: argv = <db file>
JS_VERIFY="$JS_LOAD"'
const f=process.argv[1];
const db=new D(f,{fileMustExist:true});
const r=db.pragma("integrity_check",{simple:true});
if(r!=="ok"){console.error("integrity_check: "+r);process.exit(2)}
db.pragma("wal_checkpoint(TRUNCATE)");db.pragma("journal_mode = DELETE");
const t=n=>{try{return db.prepare("SELECT COUNT(*) AS c FROM "+n).get().c}catch(e){return "?"}};
console.log("ok ("+t("users")+" users, "+t("requests")+" requests, "+t("settings")+" settings)");db.close();'

# Check $DATA_DIR/$TMP_DB with integrity_check. Uses the running container, else a
# throwaway container from the same image, else the host's sqlite3 if installed.
verify_tmp_db() {
  local out
  if running; then
    out="$(docker exec "$CONTAINER" node -e "$JS_VERIFY" "$CONTAINER_DATA/$TMP_DB" 2>&1)" || { echo "$out"; return 1; }
  else
    local image
    image="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER" 2>/dev/null)"
    if [ -n "$image" ] && out="$(docker run --rm --user "$APP_UID:$APP_GID" -v "$DATA_DIR:$CONTAINER_DATA" --entrypoint node "$image" -e "$JS_VERIFY" "$CONTAINER_DATA/$TMP_DB" 2>&1)"; then
      :
    elif command -v sqlite3 >/dev/null 2>&1; then
      out="$(sqlite3 "$DATA_DIR/$TMP_DB" 'PRAGMA integrity_check;' 2>&1)"
      [ "$out" = "ok" ] || { echo "$out"; return 1; }
      sqlite3 "$DATA_DIR/$TMP_DB" 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;' >/dev/null 2>&1
    else
      echo "${out:-no way to run integrity_check (container not running, no image, no sqlite3)}"
      return 1
    fi
  fi
  echo "$out"
}

# Copy the live database files to $TMP_DB (only when nothing is writing to them).
copy_db_files() {
  rm -f "$DATA_DIR/$TMP_DB"*
  cp -p "$DATA_DIR/$DB_NAME" "$DATA_DIR/$TMP_DB" || return 1
  [ -f "$DATA_DIR/$DB_NAME-wal" ] && { cp -p "$DATA_DIR/$DB_NAME-wal" "$DATA_DIR/$TMP_DB-wal" || return 1; }
  chown "$APP_UID:$APP_GID" "$DATA_DIR/$TMP_DB"* 2>/dev/null
  return 0
}

# ============================== Main ========================================
log "Family Hub backup starting (container: $CONTAINER, data: $DATA_DIR, destination: $DEST)"

command -v docker >/dev/null 2>&1 || fail "docker command not found"
[ -d "$DATA_DIR" ] || fail "data folder $DATA_DIR does not exist"
[ -f "$DATA_DIR/$DB_NAME" ] || fail "database $DATA_DIR/$DB_NAME not found"
case "$KEEP_DAYS" in ''|*[!0-9]*) fail "KEEP_DAYS must be a whole number (got '$KEEP_DAYS')" ;; esac
[ -f "$DATA_DIR/.secret-key" ] || log "Note: no .secret-key in the data folder (fine if APP_SECRET is set in .env)."

mkdir -p "$DEST" || fail "cannot create $DEST"
chmod 700 "$DEST" || fail "cannot set permissions on $DEST"
STAGING="$(mktemp -d "$DEST/.staging-XXXXXX")" || fail "cannot create a staging folder in $DEST"
mkdir -p "$STAGING/data" "$STAGING/env"

# 1. Consistent copy of the database ------------------------------------------
if running; then
  log "Copying the database with SQLite's online backup (container keeps running)..."
  if out="$(docker exec "$CONTAINER" node -e "$JS_BACKUP" "$CONTAINER_DATA/$DB_NAME" "$CONTAINER_DATA/$TMP_DB" 2>&1)" && [ -s "$DATA_DIR/$TMP_DB" ]; then
    METHOD="online backup (container kept running)"
  else
    log "Online backup did not work: ${out:-no output}"
    [ "$ALLOW_STOP" = "yes" ] || fail "online backup failed and ALLOW_STOP is not 'yes'"
    log "Stopping $CONTAINER briefly to copy the files..."
    docker stop -t 30 "$CONTAINER" >/dev/null || fail "could not stop $CONTAINER"
    STOPPED_BY_US=1
    copy_db_files || fail "could not copy the database files"
    log "Starting $CONTAINER again..."
    docker start "$CONTAINER" >/dev/null || fail "could not start $CONTAINER again - start it from the Docker tab!"
    STOPPED_BY_US=0
    METHOD="file copy (container stopped briefly)"
    sleep 3
  fi
else
  log "Container is not running: copying the database files directly."
  copy_db_files || fail "could not copy the database files"
  METHOD="file copy (container was not running)"
fi

# 2. Integrity check ------------------------------------------------------------
log "Checking the copied database..."
check="$(verify_tmp_db)" || fail "database check failed: $check"
log "Database check: $check"
mv "$DATA_DIR/$TMP_DB" "$STAGING/data/$DB_NAME" || fail "could not move the database copy"
rm -f "$DATA_DIR/$TMP_DB-wal" "$DATA_DIR/$TMP_DB-shm" "$DATA_DIR/$TMP_DB-journal"

# 3. Everything else in the data folder (secret key etc.) -----------------------
shopt -s dotglob nullglob
for item in "$DATA_DIR"/*; do
  name="$(basename "$item")"
  case "$name" in
    "$DB_NAME"|"$DB_NAME-wal"|"$DB_NAME-shm"|"$DB_NAME-journal"|.fh-backup-*) continue ;;
  esac
  cp -a "$item" "$STAGING/data/" || fail "could not copy $item"
done
shopt -u dotglob nullglob

# 4. .env -----------------------------------------------------------------------
if [ -n "$ENV_FILE" ]; then
  if [ -f "$ENV_FILE" ]; then
    cp -p "$ENV_FILE" "$STAGING/env/.env" || fail "could not copy $ENV_FILE"
  else
    log "Note: $ENV_FILE not found, skipping it."
  fi
fi

# 5. Manifest -------------------------------------------------------------------
{
  echo "Family Hub backup"
  echo "Created:   $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Host:      $(hostname)"
  echo "Container: $CONTAINER ($(docker inspect -f '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || echo unknown))"
  echo "Data dir:  $DATA_DIR"
  echo "Env file:  ${ENV_FILE:-not included}"
  echo "Method:    $METHOD"
  echo "DB check:  $check"
  echo
  echo "Restore with: deploy/restore-family-hub.sh <this archive>"
  echo "WARNING: contains the encryption key and API keys/tokens. Keep it private."
} > "$STAGING/MANIFEST.txt"

# 6. Archive + verify -------------------------------------------------------------
log "Writing $DEST/$ARCHIVE_NAME ..."
tar -czf "$DEST/$ARCHIVE_NAME.partial" -C "$STAGING" . || fail "tar failed (disk full?)"
chmod 600 "$DEST/$ARCHIVE_NAME.partial"
listing="$(tar -tzf "$DEST/$ARCHIVE_NAME.partial" 2>&1)" || fail "archive verification failed: $listing"
echo "$listing" | grep -q "data/$DB_NAME\$" || fail "archive is missing data/$DB_NAME"
if [ -f "$DATA_DIR/.secret-key" ]; then
  echo "$listing" | grep -q 'data/\.secret-key$' || fail "archive is missing data/.secret-key"
fi
mv "$DEST/$ARCHIVE_NAME.partial" "$DEST/$ARCHIVE_NAME" || fail "could not rename the archive"
size="$(du -h "$DEST/$ARCHIVE_NAME" | cut -f1)"
files="$(echo "$listing" | grep -vc '/$')"
log "Archive OK: $ARCHIVE_NAME ($size, $files files)"

# 7. Rotation -------------------------------------------------------------------
if [ "$KEEP_DAYS" -gt 0 ]; then
  removed=0
  while IFS= read -r old; do
    [ -n "$old" ] || continue
    [ "$(basename "$old")" = "$ARCHIVE_NAME" ] && continue
    rm -f "$old" && removed=$((removed + 1)) && log "Deleted old backup $(basename "$old")"
  done < <(find "$DEST" -maxdepth 1 -type f -name 'family-hub-*.tar.gz' -mmin +$((KEEP_DAYS * 1440)) 2>/dev/null)
  log "Rotation: kept the last $KEEP_DAYS days, deleted $removed old archive(s)."
fi
kept="$(find "$DEST" -maxdepth 1 -type f -name 'family-hub-*.tar.gz' | wc -l | tr -d ' ')"

log "Backup finished: $DEST/$ARCHIVE_NAME ($METHOD). $kept archive(s) in $DEST."
[ "$NOTIFY_ON_SUCCESS" = "yes" ] && notify "Family Hub backup OK" "$(hostname): $ARCHIVE_NAME ($size). $kept archive(s) kept." low floppy_disk
exit 0
