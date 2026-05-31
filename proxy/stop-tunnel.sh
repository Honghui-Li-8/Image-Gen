#!/usr/bin/env bash
# Stop either a temporary trycloudflare tunnel or an installed named Cloudflare tunnel service.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/logs"
TEMP_PID_FILE="${LOG_DIR}/cloudflared-temp.pid"
TEMP_URL_FILE="${LOG_DIR}/cloudflared-temp.url"
STOPPED=0

stop_temp_tunnel() {
  if [[ ! -f "${TEMP_PID_FILE}" ]]; then
    return 0
  fi

  local pid
  pid=$(tr -d '[:space:]' < "${TEMP_PID_FILE}")
  if [[ -z "${pid}" ]]; then
    rm -f "${TEMP_PID_FILE}" "${TEMP_URL_FILE}"
    return 0
  fi

  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "stale temporary tunnel pid file removed: ${TEMP_PID_FILE}"
    rm -f "${TEMP_PID_FILE}" "${TEMP_URL_FILE}"
    return 0
  fi

  kill "${pid}" 2>/dev/null || true
  sleep 1

  if kill -0 "${pid}" 2>/dev/null; then
    echo "ERROR: could not stop temporary tunnel — PID still alive: ${pid}"
    exit 1
  fi

  rm -f "${TEMP_PID_FILE}" "${TEMP_URL_FILE}"
  echo "temporary Cloudflare tunnel stopped  PID=${pid}"
  STOPPED=1
}

stop_named_tunnel_service() {
  if ! command -v cloudflared &>/dev/null; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]]; then
    if launchctl print system/com.cloudflare.cloudflared &>/dev/null; then
      sudo launchctl stop com.cloudflare.cloudflared || true
      echo "named Cloudflare tunnel service stopped"
      STOPPED=1
    fi
    return 0
  fi

  if command -v systemctl &>/dev/null && systemctl list-unit-files cloudflared.service &>/dev/null; then
    if systemctl is-active --quiet cloudflared; then
      sudo systemctl stop cloudflared
      echo "named Cloudflare tunnel service stopped"
      STOPPED=1
    fi
  fi
}

stop_temp_tunnel
stop_named_tunnel_service

if [[ "${STOPPED}" -eq 0 ]]; then
  echo "Cloudflare tunnel is not running."
fi
