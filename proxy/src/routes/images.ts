import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import type { RequestHandler } from "express";
import { getComfyImageRoot, getProxyAuthSecret } from "../config.js";
import { verifyImageToken } from "../lib/hmac.js";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const isValidFilename = (filename: string): boolean => {
  if (!filename) return false;
  const segments = filename.split(/[\\/]/);
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
};

export const imageHandler: RequestHandler = async (req, res) => {
  const param = req.params.filename;
  const filename = Array.isArray(param) ? param[0] : param;
  if (!filename || !isValidFilename(filename)) {
    res.status(400).json({ error: "Malformed filename" });
    return;
  }

  const token = typeof req.query.token === "string" ? req.query.token : null;
  const exp = typeof req.query.exp === "string" ? req.query.exp : null;
  if (!token || !exp) {
    res.status(403).json({ error: "Invalid or expired image token" });
    return;
  }

  if (!verifyImageToken(getProxyAuthSecret(), filename, exp, token)) {
    console.log(JSON.stringify({ type: "image_token_invalid", filename }));
    res.status(403).json({ error: "Invalid or expired image token" });
    return;
  }

  const root = path.resolve(getComfyImageRoot());
  const absPath = path.resolve(root, filename);
  const relative = path.relative(root, absPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.status(403).json({ error: "Path escape detected" });
    return;
  }

  let file;
  try {
    file = await stat(absPath);
    if (!file.isFile()) {
      console.log(JSON.stringify({ type: "image_not_file", absPath }));
      res.status(404).json({ error: "Image file not found" });
      return;
    }
  } catch {
    console.log(JSON.stringify({ type: "image_not_found", absPath }));
    res.status(404).json({ error: "Image file not found" });
    return;
  }

  res.setHeader(
    "Content-Type",
    CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream"
  );
  res.setHeader("Content-Length", file.size);
  res.setHeader("Cache-Control", "private, max-age=86400");
  createReadStream(absPath)
    .on("error", () => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    })
    .pipe(res);
};
