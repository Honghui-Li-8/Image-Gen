import { signImageUrl } from "../lib/proxy-auth.js";
import type { GenerationStatus } from "../db/schema.js";

const getProxyUrl = (): string => {
  const url = process.env.PROXY_URL ?? "http://localhost:3001";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

const getProxySecret = (): string => {
  const secret = process.env.PROXY_AUTH_SECRET;
  if (!secret) {
    throw new Error("PROXY_AUTH_SECRET is required");
  }
  return secret;
};

export const buildSignedImageUrl = (filename: string): string =>
  signImageUrl(getProxyUrl(), getProxySecret(), filename);

export const serializeGenerationImageUrl = (
  status: GenerationStatus,
  imageUrl: string | null
): string | null => {
  if (status !== "completed" || !imageUrl) {
    return imageUrl;
  }
  return buildSignedImageUrl(imageUrl);
};
