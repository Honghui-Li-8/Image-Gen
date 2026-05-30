#!/usr/bin/env bash
# One-time setup for Cloudflare Tunnel.
# Run this on the machine where proxy + ComfyUI will run.
# Prints the tunnel URL to use as PROXY_URL in api/.env.production.
set -euo pipefail

TUNNEL_NAME="image-gen-proxy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_ENV="$SCRIPT_DIR/../proxy/.env"

# ── 1. Detect proxy port ──────────────────────────────────────────────────────
PROXY_PORT=3001
if [[ -f "$PROXY_ENV" ]]; then
  DETECTED=$(grep -E '^PROXY_PORT=' "$PROXY_ENV" | cut -d= -f2 | tr -d '[:space:]' || true)
  [[ -n "$DETECTED" ]] && PROXY_PORT="$DETECTED"
fi
echo "Using PROXY_PORT=$PROXY_PORT (from proxy/.env or default)"

# ── 2. Install cloudflared ────────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo "cloudflared not found — installing..."
  OS="$(uname -s)"
  if [[ "$OS" == "Darwin" ]]; then
    if command -v brew &>/dev/null; then
      brew install cloudflare/cloudflare/cloudflared
    else
      echo "Error: Homebrew required on macOS. Install from https://brew.sh then re-run."
      exit 1
    fi
  elif [[ "$OS" == "Linux" ]]; then
    ARCH="$(uname -m)"
    case "$ARCH" in
      x86_64)  DEB_ARCH="amd64" ;;
      aarch64) DEB_ARCH="arm64" ;;
      *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    TMP="$(mktemp -d)"
    curl -fsSL \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$DEB_ARCH.deb" \
      -o "$TMP/cloudflared.deb"
    sudo dpkg -i "$TMP/cloudflared.deb"
    rm -rf "$TMP"
  else
    echo "Unsupported OS: $OS"
    exit 1
  fi
fi

echo "cloudflared $(cloudflared --version)"

# ── 3. Authenticate ───────────────────────────────────────────────────────────
echo ""
echo "Step 3: Authenticating with Cloudflare (opens browser)..."
cloudflared tunnel login

# ── 4. Create tunnel (idempotent) ─────────────────────────────────────────────
echo ""
echo "Step 4: Creating tunnel '$TUNNEL_NAME'..."
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "  Tunnel '$TUNNEL_NAME' already exists — skipping create."
else
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null \
  | python3 -c "import sys,json; ts=json.load(sys.stdin); print(next(t['id'] for t in ts if t['name']=='$TUNNEL_NAME'))")"
echo "  Tunnel ID: $TUNNEL_ID"

# ── 5. Write config.yml ───────────────────────────────────────────────────────
CONFIG_DIR="$HOME/.cloudflared"
mkdir -p "$CONFIG_DIR"
CONFIG_FILE="$CONFIG_DIR/config.yml"

cat > "$CONFIG_FILE" <<YAML
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - service: http://localhost:$PROXY_PORT
YAML

echo ""
echo "Step 5: Wrote $CONFIG_FILE"
cat "$CONFIG_FILE"

# ── 6. Register as system service ────────────────────────────────────────────
echo ""
echo "Step 6: Installing system service..."
if [[ "$(uname -s)" == "Darwin" ]]; then
  sudo cloudflared service install
  sudo launchctl start com.cloudflare.cloudflared
else
  sudo cloudflared service install
  sudo systemctl start cloudflared
  sudo systemctl enable cloudflared
fi

echo "  Service started."

# ── 7. Print tunnel URL ───────────────────────────────────────────────────────
TUNNEL_URL="https://${TUNNEL_ID}.cfargotunnel.com"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tunnel URL: $TUNNEL_URL"
echo ""
echo "  Next steps:"
echo "  1. Set in api/.env.production:  PROXY_URL=$TUNNEL_URL"
echo "  2. Ensure proxy/.env has:       PROXY_PORT=$PROXY_PORT"
echo "  3. Verify:  curl $TUNNEL_URL/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
