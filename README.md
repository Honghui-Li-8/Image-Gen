# Image-Gen

Initial scaffold with a React web app in `app` and a Node.js API in `api`.

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

The React app reads the API base URL from `VITE_API_URL`. If it is not set, it defaults to `http://localhost:3000`.

## Versions

- Node.js project target: `22.22.3`
- Node.js active LTS: `24.x`
- Vite: `8.0.14`
- Express: `5.2.1`
