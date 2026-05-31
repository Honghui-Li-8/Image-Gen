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

const isLegacyComfyUrl = (imageUrl: string): boolean =>
  imageUrl.startsWith("http://") || imageUrl.startsWith("https://");

export const buildSignedImageUrl = (filename: string): string => {
  const url = signImageUrl(getProxyUrl(), getProxySecret(), filename);
  console.log(JSON.stringify({ type: "image_url_built", filename, proxyUrl: getProxyUrl(), signedUrl: url }));
  return url;
};

export const serializeGenerationImageUrl = (
  status: GenerationStatus,
  imageUrl: string | null
): string | null => {
  if (status !== "completed" || !imageUrl) {
    return imageUrl;
  }
  if (isLegacyComfyUrl(imageUrl)) {
    console.log(JSON.stringify({ type: "image_url_legacy", imageUrl }));
    return null;
  }
  return buildSignedImageUrl(imageUrl);
};
