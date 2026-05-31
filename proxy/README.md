# Image Gen ComfyUI Proxy

Standalone proxy service that runs on the GPU machine alongside ComfyUI. The backend API talks to this service instead of exposing ComfyUI directly to the internet. Browsers load generated image bytes from this service through short-lived signed URLs.

## Architecture

```
Browser ──HTTPS──▶ CloudFront ──HTTPS──▶ API (Lightsail)
                                              │
                                         HTTPS (Cloudflare Tunnel)
                                              │
                                      Cloudflare edge
                                      (TLS terminates here)
                                              │
                                         HTTP (localhost)
                                              │
                                       Proxy :PROXY_PORT
                                              │
                                         HTTP (localhost)
                                              │
                                       ComfyUI :8188
```

The Cloudflare Tunnel is the HTTPS boundary — the API calls the tunnel URL (`https://...cfargotunnel.com`) which Cloudflare terminates and forwards over localhost HTTP to the proxy. The two localhost hops (tunnel → proxy, proxy → ComfyUI) never leave the machine so HTTP is intentional and correct.

The HMAC signature provides a second layer: even if the tunnel URL is discovered, requests without a valid `PROXY_AUTH_SECRET` signature are rejected.

## Environment

| Variable | Required | Description |
|---|---:|---|
| `PROXY_PORT` | Yes | Port for the proxy HTTP server. Must match the port in `setup-tunnel.sh`. |
| `PROXY_AUTH_SECRET` | Yes | Shared HMAC secret. Must match `api/.env`. Never expose to the frontend. |
| `COMFYUI_URL` | No | ComfyUI URL reachable from the proxy. Defaults to `http://localhost:8188`. |
| `COMFYUI_IMAGE_ROOT` | Yes | Absolute path to ComfyUI's output directory. Only files in this directory are served. |

## Cloudflare Tunnel

For a temporary random Cloudflare URL that does not require a spare domain, run:

```bash
./setup-temp-tunnel.sh
```

It prints a `https://*.trycloudflare.com` URL. Set that as `PROXY_URL` in `api/.env.production`. The temporary URL can change each time you restart the tunnel.

If you later have a Cloudflare account/domain ready for a named tunnel, run:

```bash
./setup-tunnel.sh
```

Both setup scripts read `PROXY_PORT` from `proxy/.env` and require the proxy to already be running and healthy on that port. Stop either tunnel style with:

```bash
./stop-tunnel.sh
```

## Running the Proxy

Use `run_proxy.sh` for all deployments — it handles stopping any existing instance, launches the proxy in the background, and writes logs to a timestamped file:

```bash
PROXY_PORT=3001 ./run_proxy.sh
```

Or export `PROXY_PORT` in your shell profile / `.env` and run:

```bash
./run_proxy.sh
```

The script:
- Fails immediately if `PROXY_PORT` is not set
- Checks if the port is already in use
  - If occupied by the proxy: prompts for confirmation before stopping and restarting
  - If occupied by a different process: prints a warning and exits without touching anything
- Launches `pnpm start` in the background via `nohup`
- Appends all output to `logs/proxy-YYYYMMDD-HHMMSS.log` (each launch gets its own file)
- Saves the PID to `logs/proxy.pid`

After launch the terminal is free — the proxy keeps running in the background.

## Logs

Each launch writes to its own file under `logs/`:

```
logs/proxy-20260530-140523.log
logs/proxy-20260530-160901.log
```

Each log line is a JSON object:

```json
{"timestamp":"2026-05-30T14:05:24.000Z","type":"http","method":"POST","path":"/comfy/prompt","status":200,"durationMs":341}
{"timestamp":"2026-05-30T14:05:24.000Z","type":"ws","event":"connect","path":"/comfy/ws"}
{"timestamp":"2026-05-30T14:05:45.000Z","type":"ws","event":"disconnect","path":"/comfy/ws"}
{"timestamp":"2026-05-30T14:06:00.000Z","type":"http","method":"POST","path":"/comfy/prompt","status":401,"durationMs":1}
{"timestamp":"2026-05-30T14:06:00.000Z","type":"ws","event":"auth_fail","path":"/comfy/ws"}
```

## HMAC Auth

Every request to `/comfy/*` must include two headers signed with `PROXY_AUTH_SECRET`:

- `X-Proxy-Timestamp` — ISO timestamp of the request
- `X-Proxy-Signature` — HMAC-SHA256 of `METHOD:path:timestamp`

The proxy recomputes the signature and rejects requests with an invalid signature or a timestamp outside the acceptance window. It never calls the backend to verify — auth is fully self-contained.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | None | Reports proxy status and whether ComfyUI is reachable. |
| `ALL /comfy/*` | HMAC | Forwards ComfyUI HTTP API calls, stripping the `/comfy` prefix before forwarding. |
| `GET /comfy/ws` | HMAC | Tunnels ComfyUI WebSocket progress messages. |
| `GET /images/:filename?token=...&exp=...` | Signed URL | Streams a generated image from `COMFYUI_IMAGE_ROOT`. |

## Image Serving Trade-Off

Serving directly from disk keeps the MVP simple and keeps the backend out of the image byte path. For production durability, caching, and global delivery, move generated images to object storage or a CDN such as CloudFront or Bunny and keep the same signed-URL pattern at the edge.
