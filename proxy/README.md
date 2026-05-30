# Image Gen ComfyUI Proxy

Standalone proxy service for the GPU machine. The backend talks to this service instead of exposing ComfyUI directly, and browsers load generated image bytes from this service through short-lived signed URLs.

## Environment

| Variable | Required | Description |
|---|---:|---|
| `PROXY_PORT` | No | Port for the proxy HTTP server. Defaults to `3001`. |
| `PROXY_AUTH_SECRET` | Yes | Shared HMAC secret used by the API and proxy. Must match `api/.env`. Never expose this to the frontend. |
| `COMFYUI_URL` | Yes | Private ComfyUI URL reachable from the proxy, for example `http://localhost:8188`. |
| `COMFYUI_IMAGE_ROOT` | Yes | Absolute path to ComfyUI's output directory. The proxy only serves files from this directory. |

## HMAC Flow

Backend-to-proxy requests include `X-Proxy-Timestamp` and `X-Proxy-Signature`. The proxy recomputes the signature with the shared secret and rejects requests outside the timestamp window. The proxy never calls the backend to verify auth.

Image URLs are minted by the backend only after normal user auth and generation ownership checks pass. The URL contains a filename-bound token and expiry. The proxy validates that token before touching the filesystem.

## Image Serving Trade-Off

Serving directly from disk keeps the MVP simple and keeps the backend out of the image byte path. For production durability, caching, and global delivery, move generated images to object storage or a CDN such as CloudFront or Bunny and keep the same signed-URL pattern at the edge.
