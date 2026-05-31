import { createHmac } from "crypto";

export const canonicalProxyRequestPayload = (
  method: string,
  pathWithQuery: string,
  timestamp: string
): string =>
  JSON.stringify({
    method: method.toUpperCase(),
    path: pathWithQuery,
    timestamp,
  });

export const canonicalImagePayload = (filename: string, exp: string): string =>
  JSON.stringify({ filename, exp });

export const signPayload = (secret: string, payload: string): string =>
  createHmac("sha256", secret).update(payload).digest("hex");

export const signProxyRequest = (
  secret: string,
  method: string,
  pathWithQuery: string,
  nowMs = Date.now()
): Record<string, string> => {
  const timestamp = String(nowMs);
  const signature = signPayload(
    secret,
    canonicalProxyRequestPayload(method, pathWithQuery, timestamp)
  );

  return {
    "X-Proxy-Signature": signature,
    "X-Proxy-Timestamp": timestamp,
  };
};

export const signImageUrl = (
  proxyUrl: string,
  secret: string,
  filename: string,
  expSecs = 6 * 3600,
  nowMs = Date.now()
): string => {
  const baseUrl = proxyUrl.endsWith("/") ? proxyUrl.slice(0, -1) : proxyUrl;
  // Quantize to the nearest hour so the URL is stable within a 1-hour window,
  // allowing browser cache hits across page refreshes.
  const BUCKET_SECS = 2 * 3600;
  const exp = String(Math.floor(nowMs / 1000 / BUCKET_SECS) * BUCKET_SECS + expSecs);
  const token = signPayload(secret, canonicalImagePayload(filename, exp));
  const params = new URLSearchParams({ token, exp });

  return `${baseUrl}/images/${encodeURIComponent(filename)}?${params.toString()}`;
};
