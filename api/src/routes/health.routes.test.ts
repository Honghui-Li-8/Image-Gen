import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { healthRouter } from "./health.routes.js";

function buildApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /comfy-health", () => {
  it("relays proxy health without auth", async () => {
    vi.stubEnv("PROXY_URL", "http://proxy.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          comfyui: { reachable: true, latencyMs: 12 },
        }),
      })
    );

    const res = await request(buildApp()).get("/comfy-health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      comfyui: { reachable: true, latencyMs: 12 },
    });
  });

  it("returns 502 when the proxy is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const res = await request(buildApp()).get("/comfy-health");

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("ComfyUI proxy unreachable");
  });
});
