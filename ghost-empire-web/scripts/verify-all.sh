#!/usr/bin/env bash
# scripts/verify-all.sh — local stand-in for CI while GitHub Actions is down.
#
# Runs the same gates CI runs (typecheck · lint · docs:check · unit tests ·
# integration tests) plus an optional production build. The integration step
# needs a real Postgres; this script spins up a THROWAWAY local cluster
# (postgresql@16 via Homebrew), points the tests at it, and tears it down on
# exit. Nothing touches prod — a fresh empty DB on a random free port.
#
# Usage (from ghost-empire-web/):
#   npm run verify-all            # all gates incl. integration
#   npm run verify-all -- --build # + `next build` (slow; needs a healthy node_modules)
#   npm run verify-all -- --fast  # skip integration (no DB) — quick pre-push
#
# Exit code is non-zero if ANY gate fails, so it works as a git pre-push hook.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

# ---- flags ----------------------------------------------------------------
RUN_DB=1; RUN_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --fast) RUN_DB=0 ;;
    --no-db) RUN_DB=0 ;;
    --build) RUN_BUILD=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ---- pretty output --------------------------------------------------------
bold=$(printf '\033[1m'); red=$(printf '\033[31m'); grn=$(printf '\033[32m')
ylw=$(printf '\033[33m'); dim=$(printf '\033[2m'); rst=$(printf '\033[0m')
declare -a RESULTS
step() { printf '\n%s▶ %s%s\n' "$bold" "$1" "$rst"; }
record() { RESULTS+=("$1|$2"); } # name|status(ok/fail/skip)

# Run a named gate; capture pass/fail without aborting the whole script.
gate() {
  local name="$1"; shift
  step "$name"
  if "$@"; then record "$name" ok; else record "$name" fail; fi
}

# ---- ephemeral Postgres for the integration step --------------------------
PG_PID_DIR=""; PG_STARTED=0
cleanup() {
  if [[ "$PG_STARTED" == 1 && -n "$PG_PID_DIR" ]]; then
    "$PGBIN/pg_ctl" -D "$PG_PID_DIR/data" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$PG_PID_DIR"
  fi
}
trap cleanup EXIT INT TERM

find_free_port() {
  local p
  for p in 5433 5434 5435 5436 5437; do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "$p"; return 0; fi
    exec 3>&- 2>/dev/null || true
  done
  return 1
}

start_test_db() {
  local prefix; prefix=$(brew --prefix postgresql@16 2>/dev/null)
  [[ -z "$prefix" ]] && prefix=$(brew --prefix postgresql@17 2>/dev/null)
  [[ -z "$prefix" ]] && prefix=$(brew --prefix postgresql@15 2>/dev/null)
  if [[ -z "$prefix" || ! -x "$prefix/bin/postgres" ]]; then
    echo "${ylw}Postgres server not found (brew install postgresql@16) — skipping integration.${rst}" >&2
    return 1
  fi
  PGBIN="$prefix/bin"
  local port; port=$(find_free_port) || { echo "${ylw}No free port for test DB — skipping integration.${rst}" >&2; return 1; }
  PG_PID_DIR=$(mktemp -d "${TMPDIR:-/tmp}/ghost-verify.XXXXXX")
  export LC_ALL=C LANG=C
  "$PGBIN/initdb" -U postgres --auth=trust -D "$PG_PID_DIR/data" >/dev/null 2>&1 || return 1
  # Short socket dir (unix path length limit); TCP is what the tests use.
  "$PGBIN/pg_ctl" -D "$PG_PID_DIR/data" -o "-p $port -k /tmp" -l "$PG_PID_DIR/pg.log" -w start >/dev/null 2>&1 || {
    echo "${red}Postgres failed to start:${rst}"; tail -5 "$PG_PID_DIR/pg.log" 2>/dev/null; return 1; }
  PG_STARTED=1
  "$PGBIN/createdb" -h 127.0.0.1 -p "$port" -U postgres ghost_test >/dev/null 2>&1 || return 1
  # db-url.ts reads TEST_DATABASE_URL first; globalSetup runs `prisma db push`.
  export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/ghost_test"
  echo "${dim}test DB up on 127.0.0.1:$port (throwaway)${rst}"
  return 0
}

# ---- gates ----------------------------------------------------------------
gate "typecheck (tsc)"   npm run --silent typecheck
gate "lint (eslint)"     npm run --silent lint
gate "docs:check"        npm run --silent docs:check
gate "unit tests"        npm run --silent test

if [[ "$RUN_DB" == 1 ]]; then
  if start_test_db; then
    gate "integration tests" npm run --silent test:integration
  else
    record "integration tests" skip
  fi
else
  record "integration tests" skip
fi

if [[ "$RUN_BUILD" == 1 ]]; then
  gate "build (next build)" npm run --silent build
else
  record "build (next build)" skip
fi

# ---- summary --------------------------------------------------------------
printf '\n%s──────── verify-all summary ────────%s\n' "$bold" "$rst"
fails=0
for r in "${RESULTS[@]}"; do
  name=${r%|*}; status=${r#*|}
  case "$status" in
    ok)   printf '  %s✓%s %s\n' "$grn" "$rst" "$name" ;;
    fail) printf '  %s✗%s %s\n' "$red" "$rst" "$name"; fails=$((fails+1)) ;;
    skip) printf '  %s–%s %s %s(skipped)%s\n' "$ylw" "$rst" "$name" "$dim" "$rst" ;;
  esac
done

if [[ "$fails" -gt 0 ]]; then
  printf '\n%s✗ %d gate(s) failed%s\n' "$red$bold" "$fails" "$rst"
  exit 1
fi
printf '\n%s✓ all gates green%s\n' "$grn$bold" "$rst"
