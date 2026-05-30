import type { RequestHandler } from "express";
import { getProxyAuthSecret } from "../config.js";
import { verifyBackendSignature } from "../lib/hmac.js";

export const requireBackendAuth: RequestHandler = (req, res, next) => {
  const timestamp = req.header("X-Proxy-Timestamp");
  const signature = req.header("X-Proxy-Signature");

  if (
    !timestamp ||
    !signature ||
    !verifyBackendSignature(getProxyAuthSecret(), req.method, req.originalUrl, timestamp, signature)
  ) {
    res.status(401).json({ error: "Invalid proxy signature" });
    return;
  }

  next();
};
