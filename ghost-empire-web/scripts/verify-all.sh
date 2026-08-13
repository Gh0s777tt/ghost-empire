#!/usr/bin/env bash
# scripts/verify-all.sh — local stand-in for CI while GitHub Actions is down.
#
# Runs the same gates CI runs (typecheck · lint · docs:check · docs:env ·
# docs:i18n · docs:i18n:dup · docs:rls · unit tests · integration tests) plus an optional
# production build and an optional Playwright E2E smoke run.
# The integration step
# needs a real Postgres; this script spins up a THROWAWAY local cluster
# (postgresql@16 via Homebrew — macOS-only; there is no Docker/Linux/Windows
# path here), points the tests at it, and tears it down on exit. Nothing
# touches prod — a fresh empty DB on a random free port.
#
# AUDIT [3]: an integration gate that was REQUESTED but could not run (no
# Homebrew Postgres — i.e. every Linux/Windows/container box) used to degrade
# to a silent `skip`, and the script still exited 0 printing "all gates green"
# — zero integration tests run, full-suite pass claimed. That is now a hard
# failure (`miss` status): skip integration DELIBERATELY with --fast/--no-db.
# The summary also refuses to say "all gates green" whenever anything was
# skipped, so a --fast run can never be mistaken for full CI parity.
#
# Usage (from ghost-empire-web/):
#   npm run verify-all            # all gates incl. integration
#   npm run verify-all -- --build # + `next build` (slow; needs a healthy node_modules)
#   npm run verify-all -- --e2e   # + Playwright smoke (needs `npx playwright install chromium`)
#   npm run verify-all -- --fast  # skip integration (no DB) — quick pre-push
#
# Exit code is non-zero if ANY gate fails, so it works as a git pre-push hook.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

# ---- flags ----------------------------------------------------------------
RUN_DB=1; RUN_BUILD=0; RUN_E2E=0
for arg in "$@"; do
  case "$arg" in
    --fast) RUN_DB=0 ;;
    --no-db) RUN_DB=0 ;;
    --build) RUN_BUILD=1 ;;
    --e2e) RUN_E2E=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ---- pretty output --------------------------------------------------------
bold=$(printf '\033[1m'); red=$(printf '\033[31m'); grn=$(printf '\033[32m')
ylw=$(printf '\033[33m'); dim=$(printf '\033[2m'); rst=$(printf '\033[0m')
declare -a RESULTS
step() { printf '\n%s▶ %s%s\n' "$bold" "$1" "$rst"; }
record() { RESULTS+=("$1|$2"); } # name|status(ok/fail/skip/miss)
# `skip` = gate NOT requested (e.g. --fast) — allowed, but disqualifies the
# "all gates green" claim. `miss` = gate requested but the environment cannot
# run it — counts as a FAILURE, never as a pass (audit [3]).

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
    echo "${ylw}Postgres server not found (brew install postgresql@16) — integration gate will FAIL; skip it deliberately with --fast/--no-db.${rst}" >&2
    return 1
  fi
  PGBIN="$prefix/bin"
  local port; port=$(find_free_port) || { echo "${ylw}No free port for test DB — integration gate will FAIL; skip it deliberately with --fast/--no-db.${rst}" >&2; return 1; }
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
gate "docs:env"          npm run --silent docs:env
gate "docs:i18n"         npm run --silent docs:i18n
gate "docs:i18n:dup"     npm run --silent docs:i18n:dup
gate "docs:rls"          npm run --silent docs:rls
gate "unit tests"        npm run --silent test

if [[ "$RUN_DB" == 1 ]]; then
  if start_test_db; then
    gate "integration tests" npm run --silent test:integration
  else
    # Requested but unrunnable → `miss`, i.e. FAIL. Previously this recorded a
    # plain `skip`, so any box without Homebrew Postgres "passed" the full gate
    # while running zero integration tests (audit [3]).
    record "integration tests" miss
  fi
else
  record "integration tests" skip
fi

if [[ "$RUN_BUILD" == 1 ]]; then
  gate "build (next build)" npm run --silent build
else
  record "build (next build)" skip
fi

# ---- E2E (opt-in) ---------------------------------------------------------
# AUDIT: e2e/smoke.spec.ts was wired into NO gate at all — not here, not in
# .gitlab-ci.yml — even though it is the ONLY automated check on the nonce +
# strict-dynamic CSP built in src/proxy.ts, and the only coverage of /api/health's
# db ping, the dynamic OG content-type, per-tenant og:image, and the guest 401 on
# /api/gt-games/play. TEST_REPORT.md §7 logged the skip as deliberately temporary;
# it became permanent. Opt-in rather than default because Playwright needs a real
# browser binary (`npx playwright install chromium`) and boots the app via
# playwright.config.ts's webServer — too heavy for a pre-push hook.
if [[ "$RUN_E2E" == 1 ]]; then
  gate "e2e (playwright)" npm run --silent test:e2e
else
  record "e2e (playwright)" skip
fi

# ---- summary --------------------------------------------------------------
printf '\n%s──────── verify-all summary ────────%s\n' "$bold" "$rst"
fails=0; skips=0
for r in "${RESULTS[@]}"; do
  name=${r%|*}; status=${r#*|}
  case "$status" in
    ok)   printf '  %s✓%s %s\n' "$grn" "$rst" "$name" ;;
    fail) printf '  %s✗%s %s\n' "$red" "$rst" "$name"; fails=$((fails+1)) ;;
    # A missed gate is a failed gate: it was requested and did not run (audit [3]).
    miss) printf '  %s✗%s %s %s(requested but env cannot run it — skip deliberately with --fast/--no-db)%s\n' "$red" "$rst" "$name" "$dim" "$rst"; fails=$((fails+1)) ;;
    skip) printf '  %s–%s %s %s(skipped)%s\n' "$ylw" "$rst" "$name" "$dim" "$rst"; skips=$((skips+1)) ;;
  esac
done

if [[ "$fails" -gt 0 ]]; then
  printf '\n%s✗ %d gate(s) failed%s\n' "$red$bold" "$fails" "$rst"
  exit 1
fi
# Never claim "all gates green" when something was skipped — a --fast run is a
# quick pre-push subset, NOT CI parity (audit [3]).
if [[ "$skips" -gt 0 ]]; then
  printf '\n%s✓ requested gates green%s %s(%d skipped — NOT full CI parity; full run: npm run verify-all -- --build --e2e)%s\n' "$grn$bold" "$rst" "$ylw" "$skips" "$rst"
  exit 0
fi
printf '\n%s✓ all gates green%s\n' "$grn$bold" "$rst"
