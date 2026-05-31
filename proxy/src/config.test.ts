import { afterEach, describe, expect, it } from "vitest";
import { buildComfyWsUrl } from "./config.js";

const ORIGINAL_ENV = process.env;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("buildComfyWsUrl", () => {
  it("builds the default ComfyUI websocket URL", () => {
    delete process.env.COMFYUI_URL;

    expect(buildComfyWsUrl()).toBe("ws://localhost:8188/ws");
  });

  it("preserves a clientId query string", () => {
    process.env.COMFYUI_URL = "https://comfy.example.test/base";

    expect(buildComfyWsUrl("?clientId=abc")).toBe("wss://comfy.example.test/ws?clientId=abc");
  });
});
