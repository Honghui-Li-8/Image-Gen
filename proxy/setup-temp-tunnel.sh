#!/usr/bin/env bash
# Temporary Cloudflare Tunnel using a random trycloudflare.com URL.
# This does not require a Cloudflare account or domain.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/cloudflared-temp-$(date +%Y%m%d-%H%M%S).log"
PID_FILE="${LOG_DIR}/cloudflared-temp.pid"
URL_FILE="${LOG_DIR}/cloudflared-temp.url"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

PROXY_PORT="${PROXY_PORT:-3001}"

port_pids() {
  lsof -ti tcp:"${PROXY_PORT}" 2>/dev/null || true
}

is_our_proxy() {
  local response
  response=$(curl -sf --max-time 2 "http://localhost:${PROXY_PORT}/health" 2>/dev/null || echo "")
  echo "${response}" | grep -q '"status"'
}

require_proxy_running() {
  local pids
  pids=$(port_pids)
  if [[ -z "${pids}" ]]; then
    echo "ERROR: proxy is not running on port ${PROXY_PORT}."
    echo "       Start it first: ./proxy/run_proxy.sh"
    exit 1
  fi

  if ! is_our_proxy; then
    local first_pid proc_name
    first_pid=$(echo "${pids}" | head -1)
    proc_name=$(ps -p "${first_pid}" -o comm= 2>/dev/null || echo "unknown")
    echo "ERROR: port ${PROXY_PORT} is occupied by a different process or unhealthy service."
    echo "       PIDs:    ${pids}"
    echo "       Process: ${proc_name}"
    echo "       Stop the process or set PROXY_PORT to a different value."
    exit 1
  fi
}

install_cloudflared() {
  if command -v cloudflared &>/dev/null; then
    return 0
  fi

  echo "cloudflared not found — installing..."
  OS="$(uname -s)"
  if [[ "${OS}" == "Darwin" ]]; then
    if command -v brew &>/dev/null; then
      brew install cloudflare/cloudflare/cloudflared
    else
      echo "Error: Homebrew required on macOS. Install from https://brew.sh then re-run."
      exit 1
    fi
  elif [[ "${OS}" == "Linux" ]]; then
    ARCH="$(uname -m)"
    case "${ARCH}" in
      x86_64) DEB_ARCH="amd64" ;;
      aarch64) DEB_ARCH="arm64" ;;
      *) echo "Unsupported architecture: ${ARCH}"; exit 1 ;;
    esac
    TMP="$(mktemp -d)"
    curl -fsSL \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${DEB_ARCH}.deb" \
      -o "${TMP}/cloudflared.deb"
    sudo dpkg -i "${TMP}/cloudflared.deb"
    rm -rf "${TMP}"
  else
    echo "Unsupported OS: ${OS}"
    exit 1
  fi
}

existing_temp_tunnel_pid() {
  if [[ ! -f "${PID_FILE}" ]]; then
    return 0
  fi

  local pid
  pid=$(tr -d '[:space:]' < "${PID_FILE}")
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "${pid}"
  else
    rm -f "${PID_FILE}" "${URL_FILE}"
  fi
}

mkdir -p "${LOG_DIR}"
require_proxy_running
install_cloudflared

EXISTING_PID=$(existing_temp_tunnel_pid)
if [[ -n "${EXISTING_PID}" ]]; then
  echo "ERROR: temporary Cloudflare tunnel is already running."
  echo "       PID: ${EXISTING_PID}"
  echo "       Stop it first: ./proxy/stop-tunnel.sh"
  exit 1
fi

echo "cloudflared $(cloudflared --version)"
echo "Using PROXY_PORT=${PROXY_PORT} from proxy/.env or default"
echo "Forwarding to proxy on http://localhost:${PROXY_PORT}"
echo "Starting temporary Cloudflare tunnel..."

nohup cloudflared tunnel --url "http://localhost:${PROXY_PORT}" >> "${LOG_FILE}" 2>&1 &
TUNNEL_PID=$!
echo "${TUNNEL_PID}" > "${PID_FILE}"

TUNNEL_URL=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if ! kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    echo "ERROR: cloudflared exited before publishing a temporary URL."
    echo "       Log: ${LOG_FILE}"
    rm -f "${PID_FILE}"
    exit 1
  fi

  TUNNEL_URL=$(grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "${LOG_FILE}" | tail -1 || true)
  if [[ -n "${TUNNEL_URL}" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "${TUNNEL_URL}" ]]; then
  echo "ERROR: timed out waiting for Cloudflare temporary URL."
  echo "       PID: ${TUNNEL_PID}"
  echo "       Log: ${LOG_FILE}"
  exit 1
fi

echo "${TUNNEL_URL}" > "${URL_FILE}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Temporary Tunnel URL: ${TUNNEL_URL}"
echo "  PID:                  ${TUNNEL_PID}"
echo "  Log:                  ${LOG_FILE}"
echo ""
echo "  Next steps:"
echo "  1. Set in api/.env.production:  PROXY_URL=${TUNNEL_URL}"
echo "  2. Verify:                      curl ${TUNNEL_URL}/health"
echo "  3. Stop the tunnel:             ./proxy/stop-tunnel.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
