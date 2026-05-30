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

export const getProxyPort = (): number => Number(process.env.PROXY_PORT ?? 3001);

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
