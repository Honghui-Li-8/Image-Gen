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

LOG_DIR="${SCRIPT_DIR}/logs"
PID_FILE="${LOG_DIR}/proxy.pid"

port_pids() {
  if [[ -z "${PROXY_PORT:-}" ]]; then
    return 0
  fi

  lsof -ti tcp:"${PROXY_PORT}" 2>/dev/null || true
}

is_our_proxy() {
  if [[ -z "${PROXY_PORT:-}" ]]; then
    return 1
  fi

  local response
  response=$(curl -sf --max-time 2 "http://localhost:${PROXY_PORT}/health" 2>/dev/null || echo "")
  echo "${response}" | grep -q '"status"'
}

stop_pids() {
  local pids="$1"

  if [[ -z "${pids}" ]]; then
    return 0
  fi

  echo "${pids}" | xargs kill 2>/dev/null || true
  sleep 1

  local alive=""
  while read -r pid; do
    [[ -z "${pid}" ]] && continue
    if kill -0 "${pid}" 2>/dev/null; then
      alive="${alive}${pid} "
    fi
  done <<< "${pids}"

  if [[ -n "${alive}" ]]; then
    echo "ERROR: could not stop proxy — PIDs still alive: ${alive}"
    exit 1
  fi
}

PIDS=""

if [[ -f "${PID_FILE}" ]]; then
  PID=$(tr -d '[:space:]' < "${PID_FILE}")
  if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
    PIDS="${PID}"
  else
    echo "stale pid file removed: ${PID_FILE}"
    rm -f "${PID_FILE}"
  fi
fi

if [[ -z "${PIDS}" ]]; then
  PORT_PIDS=$(port_pids)
  if [[ -n "${PORT_PIDS}" ]]; then
    if ! is_our_proxy; then
      echo "ERROR: port ${PROXY_PORT} is occupied by a different process."
      echo "       PIDs: ${PORT_PIDS}"
      exit 1
    fi

    PIDS="${PORT_PIDS}"
  fi
fi

if [[ -z "${PIDS}" ]]; then
  echo "proxy is not running."
  exit 0
fi

stop_pids "${PIDS}"

REMAINING_PORT_PIDS=$(port_pids)
if [[ -n "${REMAINING_PORT_PIDS}" ]]; then
  if ! is_our_proxy; then
    echo "ERROR: port ${PROXY_PORT} is still occupied by a different process."
    echo "       PIDs: ${REMAINING_PORT_PIDS}"
    exit 1
  fi

  stop_pids "${REMAINING_PORT_PIDS}"
fi

rm -f "${PID_FILE}"
echo "proxy stopped  PID=${PIDS}"
