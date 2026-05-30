import "dotenv/config";
import { createServer } from "http";
import express from "express";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { getProxyAuthSecret, getProxyPort, buildComfyWsUrl } from "./config.js";
import { verifyBackendSignature } from "./lib/hmac.js";
import { requireBackendAuth } from "./middleware/require-backend-auth.js";
import { comfyProxyHandler } from "./routes/comfy.js";
import { healthHandler } from "./routes/health.js";
import { imageHandler } from "./routes/images.js";

export const createApp = () => {
  const app = express();
  app.get("/health", healthHandler);
  app.use("/comfy", requireBackendAuth, comfyProxyHandler);
  app.get("/images/:filename", imageHandler);
  return app;
};

const verifyUpgradeAuth = (req: IncomingMessage): boolean => {
  const timestamp = req.headers["x-proxy-timestamp"];
  const signature = req.headers["x-proxy-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string" || !req.url) {
    return false;
  }

  return verifyBackendSignature(
    getProxyAuthSecret(),
    "GET",
    req.url,
    timestamp,
    signature
  );
};

const writeUpgradeError = (socket: Duplex, statusCode: number): void => {
  socket.write(`HTTP/1.1 ${statusCode} Unauthorized\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};

const REQUIRED_ENV_VARS = ["PROXY_AUTH_SECRET", "COMFYUI_IMAGE_ROOT"] as const;
const missingVars = REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
if (missingVars.length > 0) {
  console.error(`Missing required env vars: ${missingVars.join(", ")}`);
  process.exit(1);
}

const port = getProxyPort(); // validates and rejects invalid or blocked ports at startup

const app = createApp();
const server = createServer(app);
const wsServer = new WebSocketServer({ noServer: true });

const pipeWebSockets = (clientWs: WebSocket, upstreamWs: WebSocket): void => {
  clientWs.on("message", (data, isBinary) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
    }
  });

  upstreamWs.on("message", (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  const closeBoth = () => {
    clientWs.close();
    upstreamWs.close();
  };

  clientWs.on("close", closeBoth);
  upstreamWs.on("close", closeBoth);
};

server.on("upgrade", (req, socket, head) => {
  const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "";
  if (pathname !== "/comfy/ws") {
    socket.destroy();
    return;
  }

  if (!verifyUpgradeAuth(req)) {
    writeUpgradeError(socket, 401);
    return;
  }

  wsServer.handleUpgrade(req, socket, head, (clientWs) => {
    const upstreamWs = new WebSocket(buildComfyWsUrl());

    const pingInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
    }, 30_000);

    clientWs.on("close", () => clearInterval(pingInterval));

    upstreamWs.on("open", () => {
      pipeWebSockets(clientWs, upstreamWs);
    });

    upstreamWs.on("error", () => {
      clearInterval(pingInterval);
      clientWs.close(1011, "ComfyUI WebSocket unreachable");
    });
  });
});

server.listen(port, () => {
  console.log(`image-gen-proxy listening on http://localhost:${port}`);
});
