#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env.deploy not found. Copy .env.deploy.example and fill in values."
  exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ENV_FILE"
set +a

REQUIRED_VARS=(
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION
  APP_S3_BUCKET APP_CF_DISTRIBUTION_ID VITE_API_URL
  API_HOST API_USER API_SSH_KEY API_REMOTE_DIR
)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  [[ -z "${!var:-}" ]] && MISSING+=("$var")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: missing values in .env.deploy: ${MISSING[*]}"
  exit 1
fi

echo "Deploy target: [app] [api] [all]"
read -rp "> " TARGET

deploy_app() {
  echo "==> Building app..."
  VITE_API_URL="$VITE_API_URL" pnpm --filter image-gen-app build

  echo "==> Syncing to S3..."
  aws s3 sync "$SCRIPT_DIR/app/dist/" "s3://$APP_S3_BUCKET" --delete

  echo "==> Invalidating CloudFront..."
  aws cloudfront create-invalidation \
    --distribution-id "$APP_CF_DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text
  echo "    CloudFront invalidation submitted (propagates in ~1-3 min)."
}

deploy_api() {
  local env_prod="$SCRIPT_DIR/api/.env.production"
  if [[ ! -f "$env_prod" ]]; then
    echo "Error: api/.env.production not found. Create it before deploying the API."
    exit 1
  fi

  echo "==> Building shared..."
  NODE_ENV=development pnpm --filter image-gen-shared build

  echo "==> Building API..."
  NODE_ENV=development pnpm --filter image-gen-api build

  echo "==> Bundling dependencies (pnpm deploy)..."
  local deploy_dir="/tmp/image-gen-api-deploy"
  rm -rf "$deploy_dir"
  pnpm --filter image-gen-api deploy --prod --legacy "$deploy_dir"
  cp -r "$SCRIPT_DIR/api/dist/." "$deploy_dir/"
  cp -r "$SCRIPT_DIR/api/drizzle" "$deploy_dir/"
  cp -r "$SCRIPT_DIR/workflow" "$deploy_dir/"

  echo "==> Syncing bundle to Lightsail..."
  rsync -avz \
    --exclude 'data/' \
    --exclude '.env' \
    -e "ssh -i $API_SSH_KEY -o StrictHostKeyChecking=accept-new" \
    "$deploy_dir/" \
    "$API_USER@$API_HOST:$API_REMOTE_DIR/"

  echo "==> Copying .env.production..."
  scp -i "$API_SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$env_prod" \
    "$API_USER@$API_HOST:$API_REMOTE_DIR/.env"

  echo "==> Restarting..."
  ssh -i "$API_SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$API_USER@$API_HOST" \
    "cd $API_REMOTE_DIR && (pm2 restart image-gen-api 2>/dev/null || pm2 start server.js --name image-gen-api) && pm2 save"

  echo "==> API deployed."
}

case "$TARGET" in
  app)  deploy_app ;;
  api)  deploy_api ;;
  all)  deploy_app && deploy_api ;;
  *)    echo "Unknown target '$TARGET'. Choose app, api, or all."; exit 1 ;;
esac
