# Image-Gen

Image generation workspace with a React frontend, Node.js API, shared generation
options, and ComfyUI workflow integration.

## Project Structure

- `app`: React/Vite frontend for configuring works and launching generations.
- `api`: Express API for auth, works, prompt building, and ComfyUI requests.
- `shared`: Shared model, category, preset, and tag option definitions.
- `proxy`: Optional proxy utilities for ComfyUI/WebSocket access.
- `deployment.md`: Deployment notes.

## Prerequisites

- Node.js 22.22.3 or newer
- pnpm 11.4.0 or newer

## Setup

Use the pinned pnpm version:

```bash
corepack enable
corepack prepare pnpm@11.4.0 --activate
```

Install dependencies from the repo root:

```bash
pnpm install
```

## Environment

For local development, create:

- `api/.env` from `api/.env.example`
- `proxy/.env` from `proxy/.env.example` only if you are testing the proxy and
  ComfyUI integration

Minimum API variables for local startup:

- `PROXY_AUTH_SECRET`
- `SEED_USER_1_NAME`
- `SEED_USER_1_PASSWORD`

Optional app variable:

- `VITE_API_URL` if the frontend should target a non-default API URL

Default local ports:

- App: `5173`
- API: `3000`
- Proxy: `3001`
- ComfyUI: `8188`

## Run

Start the app and API together:

```bash
pnpm dev
```

Start the React app:

```bash
pnpm --filter image-gen-app dev
```

Start the API:

```bash
pnpm --filter image-gen-api dev
```

`pnpm dev` is intended for local app and API development. Full generation flows
require ComfyUI and, in this project setup, the proxy service.

By default:

- React app: `http://localhost:5173`
- API: `http://localhost:3000`
- API health check: `http://localhost:3000/health`
- Generation options: `http://localhost:3000/generation-options`

The React app reads the API base URL from `VITE_API_URL`. If it is not set, it defaults to `http://localhost:3000`.

## Review Scope

This repository is fully readable and reviewable without private infrastructure.

Expected local scope:

- Inspect and develop the app and API locally
- Review the proxy and generation integration code paths

Not expected for external reviewers:

- Reproducing the full GPU-backed generation stack
- Recreating the private proxy and tunnel environment

The proxy and generation path were built for a specific demo environment, not
as a turnkey public setup.

## Tests and Checks

Run all available package tests:

```bash
pnpm test
```

Run type checks:

```bash
pnpm typecheck
```

Run lint checks:

```bash
pnpm lint
```

## Model Selection

The available models are tuned for anime-style full-body character generation.

Recommended order:

1. `Animagine XL v3`: best overall quality. It usually follows prompts well with
   less regulation and has stronger styling.
2. `Amanatsu Illustrious v2`: fine-tuned variant of the Illustrious v2 base
   model. It performs much better than the base model and is a strong fallback.
3. `Pony Diffusion V6`: useful for Pony-specific prompting, but usually needs
   more careful prompt regulation.

## Notes

Some seeds are simply poor fits for a model and prompt combination. If prompt
changes stop improving the output, change the seed instead of continuing to add
more regulation tags.

## MVP Scope and Tradeoffs

This project is intentionally scoped for a private single-server demo. The
choices below reduce setup time, hosting cost, and integration overhead. They
are deliberate MVP tradeoffs, not production claims.

| Area | Current choice | Intended scope |
|---|---|---|
| Auth | Preset users gate access to the app | Simple demo protection, not full user onboarding |
| Session storage | API sessions are stored in memory; frontend auth is stored in `localStorage` | Simple demo auth; not durable across restarts |
| SSE auth transport | `EventSource` status streams carry the real session token in the URL | Practical browser tradeoff for demo use |
| Database | SQLite | Fast single-instance MVP database |
| Scalability | Built for one API process and one GPU-serving path | Does not target horizontal scale or distributed workers |
| Image delivery | Proxy serves ComfyUI output directly with temporary signed file URLs | CDN/object storage is the stronger production choice and was intentionally deferred to reduce MVP cost and integration overhead |
| Proxy packaging | `proxy` lives outside the main workspace | Treated as an adjacent service during MVP; tooling cleanup remains |
| Logging hardening | Tokenized request paths may appear in logs | Acceptable for a private demo; should be redacted before production |

Notes:
- Image delivery URLs use a separate temporary file token, not the login
  session token.
- A stronger production auth model would use invitation-based account creation
  and likely OAuth, with persistent backend sessions and cookie-based auth.

## Versions

- Node.js project target: `22.22.3`
- Node.js active LTS: `24.x`
- Vite: `8.0.14`
- Express: `5.2.1`
