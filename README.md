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

By default:

- React app: `http://localhost:5173`
- API: `http://localhost:3000`
- API health check: `http://localhost:3000/health`
- Generation options: `http://localhost:3000/generation-options`

The React app reads the API base URL from `VITE_API_URL`. If it is not set, it defaults to `http://localhost:3000`.

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

## Versions

- Node.js project target: `22.22.3`
- Node.js active LTS: `24.x`
- Vite: `8.0.14`
- Express: `5.2.1`
