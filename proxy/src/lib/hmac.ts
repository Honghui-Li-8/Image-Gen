import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_WINDOW_MS = 30_000;

export const canonicalRequestPayload = (
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

const hmacSha256 = (secret: string, payload: string): string =>
  createHmac("sha256", secret).update(payload).digest("hex");

const constantTimeHexEqual = (actual: string, expected: string): boolean => {
  if (!/^[a-f0-9]+$/i.test(actual) || !/^[a-f0-9]+$/i.test(expected)) {
    return false;
  }

  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
};

export const signPayload = (secret: string, payload: string): string =>
  hmacSha256(secret, payload);

export const verifyBackendSignature = (
  secret: string,
  method: string,
  pathWithQuery: string,
  timestamp: string,
  signature: string,
  nowMs = Date.now()
): boolean => {
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Math.abs(nowMs - timestampMs) > SIGNATURE_WINDOW_MS) {
    return false;
  }

  const expected = hmacSha256(
    secret,
    canonicalRequestPayload(method, pathWithQuery, timestamp)
  );
  return constantTimeHexEqual(signature, expected);
};

export const verifyImageToken = (
  secret: string,
  filename: string,
  exp: string,
  token: string,
  nowMs = Date.now()
): boolean => {
  const expSecs = Number(exp);
  if (!Number.isFinite(expSecs)) {
    return false;
  }

  if (expSecs <= Math.floor(nowMs / 1000)) {
    return false;
  }

  const expected = hmacSha256(secret, canonicalImagePayload(filename, exp));
  return constantTimeHexEqual(token, expected);
};
