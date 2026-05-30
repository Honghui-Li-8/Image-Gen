# Deployment Guide

## Architecture

```
Browser
  │
  ├─── HTTPS ──► CloudFront ──► S3          (app — static SPA)
  │
  ├─── HTTPS ──► Lightsail :3000             (api — Node.js / Express)
  │                   │
  │                   └─── HTTPS ──► Cloudflare Tunnel ──► local proxy :3001
  │                                                               │
  └─── HTTPS ──► Cloudflare Tunnel ──► local proxy :3001         └──► ComfyUI :8188
         (image fetches via signed URL)
```

Three services, three hosts:

| Service | Host | Notes |
|---|---|---|
| `app/` | AWS S3 + CloudFront | Static files; CloudFront is the CDN |
| `api/` | AWS Lightsail | Always-on VPS; SQLite on disk; PM2 process manager |
| `proxy/` + ComfyUI | Local machine | Cloudflare Tunnel provides the public HTTPS URL |

---

## Prerequisites checklist

Complete all three setup steps before running `./deploy.sh`. They are independent and can be done in any order or in parallel.

- [ ] **Step 1** — S3 + CloudFront created; `APP_S3_BUCKET`, `APP_CF_DISTRIBUTION_ID`, `VITE_API_URL` filled in `.env.deploy`
- [ ] **Step 2** — Lightsail instance running with PM2; `api/.env.production` filled; SSH key saved
- [ ] **Step 3** — Cloudflare Tunnel running; `PROXY_URL` set in `api/.env.production`

---

## Step 1 — S3 + CloudFront (app hosting)

### Create the S3 bucket

```bash
# Replace <BUCKET> and <REGION> with your values
aws s3api create-bucket \
  --bucket <BUCKET> \
  --region <REGION> \
  --create-bucket-configuration LocationConstraint=<REGION>

aws s3api put-public-access-block \
  --bucket <BUCKET> \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Create the CloudFront distribution

In the AWS Console (easier than CLI for initial setup):

1. Go to **CloudFront → Create distribution**
2. **Origin domain** — select your S3 bucket; choose **Origin access control (OAC)**; create a new OAC and copy the bucket policy it generates into your S3 bucket policy
3. **Default root object** — `index.html`
4. After creation, go to **Error pages → Create custom error response**:
   - HTTP error code: `404`
   - Response page path: `/index.html`
   - HTTP response code: `200`
   *(Required for React client-side routing — without this, page refreshes on any sub-route return 403)*

### Note the distribution details

```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[].{Id:Id,Domain:DomainName,Status:Status}" \
  --output table
```

### Fill in `.env.deploy`

```
APP_S3_BUCKET=<your-bucket-name>
APP_CF_DISTRIBUTION_ID=<distribution-id>
VITE_API_URL=https://<lightsail-ip>:3000   # points at the API, not CloudFront
```

Also set in `api/.env.production`:
```
ALLOWED_ORIGIN=https://<cloudfront-domain>
```

---

## Step 2 — Lightsail instance + PM2 (api hosting)

### Create the instance

```bash
aws lightsail create-instances \
  --instance-names image-gen-api \
  --availability-zone <REGION>a \
  --blueprint-id node_22 \
  --bundle-id nano_3_0

# Wait ~2 min, then confirm running:
aws lightsail get-instance-state --instance-name image-gen-api

# Open the application port:
aws lightsail open-instance-public-ports \
  --instance-name image-gen-api \
  --port-info fromPort=3000,toPort=3000,protocol=TCP

# Get public IP:
aws lightsail get-instance \
  --instance-name image-gen-api \
  --query "instance.publicIpAddress" \
  --output text
```

### Download the SSH key

```bash
aws lightsail download-default-key-pair \
  --query "privateKeyBase64" \
  --output text | base64 -d > ~/.ssh/lightsail-image-gen.pem
chmod 400 ~/.ssh/lightsail-image-gen.pem
```

### Set up PM2 (SSH into instance once)

```bash
ssh -i ~/.ssh/lightsail-image-gen.pem ubuntu@<PUBLIC_IP>
```

Inside the instance:

```bash
npm install -g pm2
mkdir -p /home/ubuntu/image-gen-api

# Start a placeholder so PM2 registers the process name
echo '{}' > /home/ubuntu/image-gen-api/package.json
pm2 start /home/ubuntu/image-gen-api/package.json --name image-gen-api || true
pm2 save

# Register PM2 as a system service — copy-paste the printed sudo command
pm2 startup
# → Run the command it prints, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

exit
```

### Create `api/.env.production`

```bash
cp api/.env.example api/.env.production
```

Fill in all values:

```
PORT=3000
NODE_ENV=production
DB_PATH=/home/ubuntu/image-gen-api/data/db.sqlite
OBSERVABILITY_LOGS=false

ALLOWED_ORIGIN=https://<cloudfront-domain>          # from Step 1
PROXY_URL=https://<tunnel-url>.cfargotunnel.com      # from Step 3
PROXY_AUTH_SECRET=<generate: openssl rand -hex 32>   # [SECRET] must match proxy/.env

COMFYUI_MAX_ACTIVE_JOBS=1
COMFYUI_WORKFLOW_PATH=
COMFYUI_TIMEOUT_MS=600000
COMFYUI_POLL_INTERVAL_MS=1000

SEED_USER_1_NAME=admin
SEED_USER_1_PASSWORD=<strong-password>
```

### Fill in `.env.deploy`

```
API_HOST=<lightsail-public-ip>
API_USER=ubuntu
API_SSH_KEY=~/.ssh/lightsail-image-gen.pem
API_REMOTE_DIR=/home/ubuntu/image-gen-api
```

---

## Step 3 — Cloudflare Tunnel (proxy public URL)

Run the setup script on the machine where proxy + ComfyUI live:

```bash
bash proxy/setup-tunnel.sh
```

The script:
1. Installs `cloudflared` if missing (Homebrew on macOS, `.deb` on Linux)
2. Opens Cloudflare in the browser for authentication
3. Creates the tunnel `image-gen-proxy`
4. Writes `~/.cloudflared/config.yml` pointing to `localhost:PROXY_PORT`
5. Registers and starts the tunnel as a system service
6. Prints the tunnel URL

Set the printed URL in `api/.env.production`:
```
PROXY_URL=https://<tunnel-id>.cfargotunnel.com
```

Verify:
```bash
curl https://<tunnel-url>/health
# → {"status":"ok","comfyui":{"reachable":...}}
```

### `proxy/.env` required values

```
PROXY_PORT=3001
PROXY_AUTH_SECRET=<same value as api/.env.production PROXY_AUTH_SECRET>  # [SECRET]
COMFYUI_URL=http://localhost:8188
COMFYUI_IMAGE_ROOT=/absolute/path/to/ComfyUI/output
```

---

## Running the deploy

Once all three setup steps are complete:

```bash
# First time only
cp .env.deploy.example .env.deploy
# Fill in all values

# Deploy
./deploy.sh
# Prompts: app | api | all
```

---

## Env var reference

### `api/.env.production`

| Variable | Required | Notes |
|---|---|---|
| `PORT` | No | Default `3000` |
| `NODE_ENV` | Yes | Set to `production` |
| `DB_PATH` | No | Default `./db.sqlite`; use absolute path on Lightsail |
| `ALLOWED_ORIGIN` | Yes (production) | CloudFront distribution URL |
| `PROXY_URL` | Yes (production) | Cloudflare Tunnel URL |
| `PROXY_AUTH_SECRET` | **[SECRET]** | Must match `proxy/.env`; generate with `openssl rand -hex 32` |
| `COMFYUI_MAX_ACTIVE_JOBS` | No | Default `1` |
| `COMFYUI_WORKFLOW_PATH` | No | Path to workflow JSON; falls back to bundled default |
| `COMFYUI_TIMEOUT_MS` | No | Default `600000` (10 min) |
| `COMFYUI_POLL_INTERVAL_MS` | No | Default `1000` |

### `proxy/.env`

| Variable | Required | Notes |
|---|---|---|
| `PROXY_PORT` | No | Default `3001` |
| `PROXY_AUTH_SECRET` | **[SECRET]** | Must match `api/.env.production` |
| `COMFYUI_URL` | No | Default `http://localhost:8188` |
| `COMFYUI_IMAGE_ROOT` | Yes | Absolute path to ComfyUI output folder |

### `app` (build-time via `.env.deploy`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | Yes | Lightsail API URL; baked in at `vite build` time |

---

## Known limitations

**Ephemeral image storage** — `COMFYUI_IMAGE_ROOT` is the ComfyUI output folder on your local machine. If the machine restarts, generated images are lost. Production fix: upload images to S3 after generation and return an S3 signed URL instead of a proxy URL.

**Home internet bandwidth** — generated images are served through your home internet upload via Cloudflare Tunnel. This is adequate for demo use. For production, S3 image storage removes this bottleneck.

**HTTPS** — Cloudflare Tunnel provides HTTPS automatically. No additional TLS setup needed for the proxy. The frontend (CloudFront) is also HTTPS. The browser will not block image URLs because both origins use HTTPS.
