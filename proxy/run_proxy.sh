#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

# ── env validation ─────────────────────────────────────────────────────────

if [[ -z "${PROXY_PORT:-}" ]]; then
  echo "ERROR: PROXY_PORT is not set."
  exit 1
fi

HEALTH_URL="http://localhost:${PROXY_PORT}/health"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/proxy-$(date +%Y%m%d-%H%M%S).log"
PID_FILE="${LOG_DIR}/proxy.pid"

# ── helpers ────────────────────────────────────────────────────────────────

port_pids() {
  lsof -ti tcp:"${PROXY_PORT}" 2>/dev/null || true
}

is_our_proxy() {
  local response
  response=$(curl -sf --max-time 2 "${HEALTH_URL}" 2>/dev/null || echo "")
  echo "${response}" | grep -q '"status"'
}

# ── port check ─────────────────────────────────────────────────────────────

PIDS=$(port_pids)

if [[ -n "${PIDS}" ]]; then
  if is_our_proxy; then
    echo "proxy is running on :${PROXY_PORT} (PID ${PIDS}) — stop and restart? [y/N]"

    if [[ ! -t 0 ]]; then
      echo "ERROR: port ${PROXY_PORT} is in use; run this script interactively to confirm stop."
      exit 1
    fi

    read -r REPLY
    if [[ "${REPLY}" != "y" && "${REPLY}" != "Y" ]]; then
      echo "aborted."
      exit 0
    fi

    echo "${PIDS}" | xargs kill 2>/dev/null || true
    sleep 1

    if [[ -n "$(port_pids)" ]]; then
      echo "ERROR: could not stop proxy — PIDs still alive: $(port_pids)"
      echo "       Investigate manually before retrying."
      exit 1
    fi

    echo "stopped."
  else
    FIRST_PID=$(echo "${PIDS}" | head -1)
    PROC_NAME=$(ps -p "${FIRST_PID}" -o comm= 2>/dev/null || echo "unknown")
    echo "ERROR: port ${PROXY_PORT} is occupied by a different process."
    echo "       PIDs:    ${PIDS}"
    echo "       Process: ${PROC_NAME}"
    echo "       Free the port or set PROXY_PORT to a different value."
    exit 1
  fi
fi

# ── launch ─────────────────────────────────────────────────────────────────

mkdir -p "${LOG_DIR}"
cd "${SCRIPT_DIR}"
nohup pnpm start >> "${LOG_FILE}" 2>&1 &
PROXY_PID=$!
echo "${PROXY_PID}" > "${PID_FILE}"

echo "proxy started  PID=${PROXY_PID}"
echo "log            ${LOG_FILE}"
echo "pid file       ${PID_FILE}"
