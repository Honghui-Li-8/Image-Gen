import http from "http";
import https from "https";
import type { RequestHandler } from "express";
import { buildComfyHttpUrl } from "../config.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const stripComfyPrefix = (originalUrl: string): string => {
  const stripped = originalUrl.startsWith("/comfy")
    ? originalUrl.slice("/comfy".length)
    : originalUrl;
  return stripped || "/";
};

const buildForwardHeaders = (
  headers: http.IncomingHttpHeaders,
  target: URL
): http.OutgoingHttpHeaders => {
  const forwarded: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lower) ||
      lower === "host" ||
      lower === "x-proxy-signature" ||
      lower === "x-proxy-timestamp"
    ) {
      continue;
    }
    forwarded[key] = value;
  }
  forwarded.host = target.host;
  return forwarded;
};

export const comfyProxyHandler: RequestHandler = (req, res) => {
  const target = buildComfyHttpUrl(stripComfyPrefix(req.originalUrl));
  const client = target.protocol === "https:" ? https : http;

  const upstreamReq = client.request(
    target,
    {
      method: req.method,
      headers: buildForwardHeaders(req.headers, target),
    },
    (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode ?? 502;
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on("error", () => {
    if (!res.headersSent) {
      res.status(502).json({ error: "ComfyUI unreachable" });
      return;
    }
    res.end();
  });

  req.pipe(upstreamReq);
};
