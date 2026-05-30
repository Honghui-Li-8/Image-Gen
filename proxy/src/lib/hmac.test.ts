import { describe, expect, it } from "vitest";
import {
  canonicalImagePayload,
  canonicalRequestPayload,
  signPayload,
  verifyBackendSignature,
  verifyImageToken,
} from "./hmac.js";

const SECRET = "test-secret";
const NOW = 1_700_000_000_000;

describe("verifyBackendSignature", () => {
  it("verifies a valid request signature", () => {
    const timestamp = String(NOW);
    const signature = signPayload(
      SECRET,
      canonicalRequestPayload("POST", "/comfy/prompt", timestamp)
    );

    expect(
      verifyBackendSignature(
        SECRET,
        "POST",
        "/comfy/prompt",
        timestamp,
        signature,
        NOW
      )
    ).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    const timestamp = String(NOW);
    const signature = signPayload(
      "wrong-secret",
      canonicalRequestPayload("POST", "/comfy/prompt", timestamp)
    );

    expect(
      verifyBackendSignature(
        SECRET,
        "POST",
        "/comfy/prompt",
        timestamp,
        signature,
        NOW
      )
    ).toBe(false);
  });

  it("rejects tampered paths", () => {
    const timestamp = String(NOW);
    const signature = signPayload(
      SECRET,
      canonicalRequestPayload("POST", "/comfy/prompt", timestamp)
    );

    expect(
      verifyBackendSignature(
        SECRET,
        "POST",
        "/comfy/history/abc",
        timestamp,
        signature,
        NOW
      )
    ).toBe(false);
  });

  it("rejects timestamps outside the replay window", () => {
    const timestamp = String(NOW - 31_000);
    const signature = signPayload(
      SECRET,
      canonicalRequestPayload("POST", "/comfy/prompt", timestamp)
    );

    expect(
      verifyBackendSignature(
        SECRET,
        "POST",
        "/comfy/prompt",
        timestamp,
        signature,
        NOW
      )
    ).toBe(false);
  });
});

describe("verifyImageToken", () => {
  it("verifies a valid filename-bound image token", () => {
    const exp = String(Math.floor(NOW / 1000) + 60);
    const token = signPayload(SECRET, canonicalImagePayload("abc.png", exp));

    expect(verifyImageToken(SECRET, "abc.png", exp, token, NOW)).toBe(true);
  });

  it("rejects using the token for another filename", () => {
    const exp = String(Math.floor(NOW / 1000) + 60);
    const token = signPayload(SECRET, canonicalImagePayload("abc.png", exp));

    expect(verifyImageToken(SECRET, "xyz.png", exp, token, NOW)).toBe(false);
  });

  it("rejects expired tokens", () => {
    const exp = String(Math.floor(NOW / 1000) - 1);
    const token = signPayload(SECRET, canonicalImagePayload("abc.png", exp));

    expect(verifyImageToken(SECRET, "abc.png", exp, token, NOW)).toBe(false);
  });
});
