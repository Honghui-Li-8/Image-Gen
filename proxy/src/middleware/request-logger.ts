import type { RequestHandler } from "express";

const log = (fields: Record<string, unknown>): void => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...fields }));
};

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    log({
      type: "http",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
};

export const logWsEvent = (
  event: "connect" | "disconnect" | "auth_fail",
  path: string,
): void => {
  log({ type: "ws", event, path });
};
