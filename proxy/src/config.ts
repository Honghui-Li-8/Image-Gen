export const getProxyAuthSecret = (): string => {
  const secret = process.env.PROXY_AUTH_SECRET;
  if (!secret) {
    throw new Error("PROXY_AUTH_SECRET is required");
  }
  return secret;
};

export const getComfyUrl = (): string => {
  const url = process.env.COMFYUI_URL ?? "http://localhost:8188";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

const BLOCKED_PORTS = new Set([
  80, 443,           // HTTP / HTTPS
  8080, 8443,        // common HTTP alternatives
  8188,              // ComfyUI default
  3000,              // api
  5173,              // Vite dev server
]);

export const resolveProxyPort = (): number => {
  const raw = process.env.PROXY_PORT ?? "3001";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`PROXY_PORT "${raw}" is not a valid port (1–65535)`);
    process.exit(1);
  }
  if (BLOCKED_PORTS.has(port)) {
    console.error(`PROXY_PORT ${port} conflicts with a reserved or commonly-used port`);
    process.exit(1);
  }
  return port;
};

export const getProxyPort = resolveProxyPort;

export const getComfyImageRoot = (): string => {
  const root = process.env.COMFYUI_IMAGE_ROOT;
  if (!root) {
    throw new Error("COMFYUI_IMAGE_ROOT is required");
  }
  return root;
};

export const buildComfyHttpUrl = (pathWithQuery: string): URL =>
  new URL(pathWithQuery, `${getComfyUrl()}/`);

export const buildComfyWsUrl = (): string => {
  const url = new URL(getComfyUrl());
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
};
