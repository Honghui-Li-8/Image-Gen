#!/bin/bash
set -e

run_check() {
  local name=$1; shift
  if [ "${VERBOSE:-0}" = "1" ]; then
    echo "=== $name ==="
    "$@"
  else
    local out
    if out=$("$@" 2>&1); then
      echo "✓ $name"
    else
      echo "✗ $name"
      echo "$out"
      exit 1
    fi
  fi
}

run_check "test"         pnpm test
run_check "lint"         pnpm lint
run_check "typecheck"    pnpm typecheck
run_check "format:check" pnpm format:check
echo -n "spell: " && (pnpm spellcheck 2>&1 | grep "CSpell:" || true)
