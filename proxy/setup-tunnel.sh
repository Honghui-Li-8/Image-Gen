#!/usr/bin/env bash
# Named Cloudflare Tunnel setup for machines with a Cloudflare account/domain.
# If you do not have a domain available, use setup-temp-tunnel.sh instead.
set -euo pipefail

TUNNEL_NAME="image-gen-proxy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
LOG_DIR="${SCRIPT_DIR}/logs"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

PROXY_PORT="${PROXY_PORT:-3001}"
PUBLIC_HOSTNAME="${PUBLIC_HOSTNAME:-}"
if [[ "$(uname -s)" == "Darwin" ]]; then
  SERVICE_CONFIG_DIR="/usr/local/etc/cloudflared"
else
  SERVICE_CONFIG_DIR="/etc/cloudflared"
fi

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

install_service() {
  sudo mkdir -p "${SERVICE_CONFIG_DIR}"
  sudo cp "${CONFIG_FILE}" "${SERVICE_CONFIG_DIR}/config.yml"
  sudo cp "${CREDENTIALS_FILE}" "${SERVICE_CONFIG_DIR}/${TUNNEL_ID}.json"

  if [[ "$(uname -s)" == "Darwin" ]]; then
    if ! launchctl print system/com.cloudflare.cloudflared &>/dev/null; then
      sudo cloudflared service install
    else
      echo "  cloudflared service already installed — updating config and restarting."
    fi
    sudo launchctl stop com.cloudflare.cloudflared 2>/dev/null || true
    sudo launchctl start com.cloudflare.cloudflared
    return 0
  fi

  if [[ ! -f /etc/systemd/system/cloudflared.service ]]; then
    sudo cloudflared service install
  else
    echo "  cloudflared service already installed — updating config and restarting."
  fi
  sudo systemctl restart cloudflared
  sudo systemctl enable cloudflared
}

mkdir -p "${LOG_DIR}"
require_proxy_running
install_cloudflared

echo "cloudflared $(cloudflared --version)"
echo "Using PROXY_PORT=${PROXY_PORT} from proxy/.env or default"
echo "Forwarding to proxy on http://localhost:${PROXY_PORT}"

echo ""
echo "Step 1: Authenticating with Cloudflare (opens browser)..."
cloudflared tunnel login

echo ""
echo "Step 2: Creating tunnel '${TUNNEL_NAME}'..."
if cloudflared tunnel list 2>/dev/null | grep -q "${TUNNEL_NAME}"; then
  echo "  Tunnel '${TUNNEL_NAME}' already exists — skipping create."
else
  cloudflared tunnel create "${TUNNEL_NAME}"
fi

TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null \
  | python3 -c "import sys,json; ts=json.load(sys.stdin); print(next(t['id'] for t in ts if t['name']=='${TUNNEL_NAME}'))")"
CREDENTIALS_FILE="${HOME}/.cloudflared/${TUNNEL_ID}.json"
echo "  Tunnel ID: ${TUNNEL_ID}"

CONFIG_DIR="${HOME}/.cloudflared"
mkdir -p "${CONFIG_DIR}"
CONFIG_FILE="${CONFIG_DIR}/config.yml"

cat > "${CONFIG_FILE}" <<YAML
tunnel: ${TUNNEL_ID}
credentials-file: ${SERVICE_CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  - service: http://localhost:${PROXY_PORT}
YAML

echo ""
echo "Step 3: Wrote ${CONFIG_FILE}"
cat "${CONFIG_FILE}"

echo ""
echo "Step 4: Installing system service..."
install_service

echo "  Service started."

if [[ -n "${PUBLIC_HOSTNAME}" ]]; then
  echo ""
  echo "Step 5: Routing ${PUBLIC_HOSTNAME} to '${TUNNEL_NAME}'..."
  cloudflared tunnel route dns "${TUNNEL_NAME}" "${PUBLIC_HOSTNAME}"
  TUNNEL_URL="https://${PUBLIC_HOSTNAME}"
else
  TUNNEL_URL=""
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -n "${TUNNEL_URL}" ]]; then
  echo "  Tunnel URL: ${TUNNEL_URL}"
else
  echo "  Named tunnel service is running, but no public hostname was routed."
  echo "  To create a stable URL, set PUBLIC_HOSTNAME in proxy/.env and rerun."
  echo "  Example: PUBLIC_HOSTNAME=proxy.example.com"
fi
echo ""
echo "  Next steps:"
if [[ -n "${TUNNEL_URL}" ]]; then
  echo "  1. Set in api/.env.production:  PROXY_URL=${TUNNEL_URL}"
  echo "  2. Verify:                      curl ${TUNNEL_URL}/health"
else
  echo "  1. Use a domain hostname, or use: ./proxy/setup-temp-tunnel.sh"
  echo "  2. Stop the tunnel service:      ./proxy/stop-tunnel.sh"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
