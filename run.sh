#!/usr/bin/env bash
#
# One command to get WealthFlow running locally.
#
#   ./run.sh              start the dev server (default)
#   ./run.sh build        production build
#   ./run.sh test         unit tests
#   ./run.sh <script>     any other script in package.json
#
# Everything below checks before it acts, so re-running is cheap and safe.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; RESET=''
fi

step() { printf '%s→%s %s\n' "$DIM" "$RESET" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
die()  { printf '\n%s%serror:%s %s\n\n' "$RED" "$BOLD" "$RESET" "$*" >&2; exit 1; }

case "${1:-}" in
  -h|--help)
    sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

# ---------------------------------------------------------------------------
# Node
#
# The system node here is v14, which Next 16 rejects with a bare
# "SyntaxError: Unexpected token '??='" from inside a bundled dependency. Rather
# than make every shell remember `nvm use`, find a usable node ourselves and put
# it on PATH for this process only. Nothing outside this script is changed.
# ---------------------------------------------------------------------------

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
PINNED="$(tr -d '[:space:]' < .nvmrc 2>/dev/null || true)"
PINNED="${PINNED#v}"

node_is_supported() { # $1 = path to a node binary; package.json wants >=20.9.0
  "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' 2>/dev/null
}

resolve_node_bin() {
  local candidate

  if [ -n "$PINNED" ] && [ -x "$NVM_DIR/versions/node/v$PINNED/bin/node" ]; then
    printf '%s\n' "$NVM_DIR/versions/node/v$PINNED/bin"
    return 0
  fi

  # The pinned version isn't installed. Take the newest nvm install that still
  # satisfies engines rather than failing over an exact-match miss.
  while read -r candidate; do
    [ -n "$candidate" ] || continue
    if node_is_supported "$candidate/node"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(ls -d "$NVM_DIR"/versions/node/v*/bin 2>/dev/null | sort -Vr)

  if command -v node >/dev/null 2>&1 && node_is_supported "$(command -v node)"; then
    dirname "$(command -v node)"
    return 0
  fi

  return 1
}

NODE_BIN="$(resolve_node_bin)" || die "No Node >= 20.9 found.

  This repo pins ${BOLD}${PINNED:-20.20.1}${RESET} in .nvmrc. Install it with:

    nvm install"

export PATH="$NODE_BIN:$PATH"
ok "node $(node -v)  ${DIM}($NODE_BIN)${RESET}"

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

if [ ! -f .env ]; then
  step "no .env — writing one with a fresh AUTH_SECRET"
  cat > .env <<EOF
DATABASE_URL="postgresql://app:app@localhost:55432/finance_saas"
AUTH_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
EOF
fi

DB_URL="$(sed -n 's/^[[:space:]]*DATABASE_URL=//p' .env | tail -n1 | tr -d '"'"'")"
[ -n "$DB_URL" ] || die "DATABASE_URL is not set in .env"

DB_HOSTPORT="${DB_URL#*@}"; DB_HOSTPORT="${DB_HOSTPORT%%/*}"
DB_HOST="${DB_HOSTPORT%%:*}"
DB_PORT="${DB_HOSTPORT##*:}"
[ "$DB_PORT" != "$DB_HOST" ] || DB_PORT=5432

# ---------------------------------------------------------------------------
# Postgres
#
# Deliberately NOT a plain `docker compose up -d`. This directory was renamed
# (WealthFlow-FinTrack -> WealthFlow), so the container holding the real data belongs to
# compose project "WealthFlow-fintrack" while compose here would default to project
# "WealthFlow" — a different project, a different volume, an empty database that
# looks exactly like data loss. So: reuse whatever container already publishes
# the port DATABASE_URL points at, and only create one as a last resort.
# ---------------------------------------------------------------------------

tcp_open() { timeout 2 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null; }

find_db_container() {
  local cid
  for cid in $(docker ps -aq --filter "label=com.docker.compose.service=db" 2>/dev/null); do
    if docker inspect "$cid" \
        --format '{{range $p, $c := .HostConfig.PortBindings}}{{range $c}}{{.HostPort}} {{end}}{{end}}' \
        2>/dev/null | tr ' ' '\n' | grep -qx "$DB_PORT"; then
      printf '%s\n' "$cid"
      return 0
    fi
  done
  return 1
}

ensure_db() {
  if tcp_open "$DB_HOST" "$DB_PORT"; then
    ok "postgres up on $DB_HOST:$DB_PORT"
    return 0
  fi

  case "$DB_HOST" in
    localhost|127.0.0.1|::1) ;;
    *) die "Can't reach postgres at $DB_HOST:$DB_PORT (remote host — start it yourself)." ;;
  esac

  command -v docker >/dev/null 2>&1 || die "Postgres isn't running on port $DB_PORT and docker isn't installed."

  local cid
  if cid="$(find_db_container)"; then
    step "starting existing container $(docker inspect -f '{{.Name}}' "$cid" | sed 's|^/||')"
    docker start "$cid" >/dev/null
  else
    step "no container publishes port $DB_PORT — creating one from docker-compose.yml"
    docker compose up -d db
    cid="$(find_db_container || true)"
  fi

  step "waiting for postgres"
  local waited=0
  until tcp_open "$DB_HOST" "$DB_PORT"; do
    waited=$((waited + 1))
    [ "$waited" -lt 60 ] || die "Postgres didn't come up within 60s. Check: docker logs ${cid:-<container>}"
    sleep 1
  done

  # TCP accepts a moment before postgres will actually answer queries.
  if [ -n "${cid:-}" ]; then
    until docker exec "$cid" pg_isready -q 2>/dev/null; do
      waited=$((waited + 1))
      [ "$waited" -lt 60 ] || die "Postgres accepted connections but never became ready."
      sleep 1
    done
  fi

  ok "postgres up on $DB_HOST:$DB_PORT"
}

ensure_db

# ---------------------------------------------------------------------------
# Dependencies and schema
# ---------------------------------------------------------------------------

if [ ! -d node_modules ]; then
  step "installing dependencies"
  npm install
elif [ package-lock.json -nt node_modules/.package-lock.json ]; then
  step "lockfile changed — installing dependencies"
  npm install
fi

if [ ! -d node_modules/.prisma/client ]; then
  step "generating prisma client"
  npx --no-install prisma generate
fi

step "applying pending migrations"
npx --no-install prisma migrate deploy

# ---------------------------------------------------------------------------
# Go
# ---------------------------------------------------------------------------

SCRIPT="${1:-dev}"
shift || true

printf '\n'
if [ "$#" -gt 0 ]; then
  exec npm run "$SCRIPT" -- "$@"
else
  exec npm run "$SCRIPT"
fi
