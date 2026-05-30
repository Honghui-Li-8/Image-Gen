import { describe, expect, it } from "vitest";
import {
  canonicalImagePayload,
  canonicalProxyRequestPayload,
  signImageUrl,
  signPayload,
  signProxyRequest,
} from "./proxy-auth.js";

const SECRET = "test-secret";
const NOW = 1_700_000_000_000;

describe("signProxyRequest", () => {
  it("signs the method, path, and timestamp", () => {
    const headers = signProxyRequest(SECRET, "post", "/comfy/prompt", NOW);
    const expected = signPayload(
      SECRET,
      canonicalProxyRequestPayload(
        "POST",
        "/comfy/prompt",
        headers["X-Proxy-Timestamp"]
      )
    );

    expect(headers["X-Proxy-Timestamp"]).toBe(String(NOW));
    expect(headers["X-Proxy-Signature"]).toBe(expected);
  });

  it("includes the query string in the signed path", () => {
    const headers = signProxyRequest(
      SECRET,
      "GET",
      "/comfy/history/abc?preview=true",
      NOW
    );
    const withoutQuery = signPayload(
      SECRET,
      canonicalProxyRequestPayload("GET", "/comfy/history/abc", String(NOW))
    );

    expect(headers["X-Proxy-Signature"]).not.toBe(withoutQuery);
  });
});

describe("signImageUrl", () => {
  it("returns a signed image URL with token and expiry", () => {
    const url = new URL(signImageUrl("http://proxy.test", SECRET, "abc.png", 60, NOW));
    const exp = url.searchParams.get("exp");
    const token = url.searchParams.get("token");

    expect(url.pathname).toBe("/images/abc.png");
    expect(exp).toBe(String(Math.floor(NOW / 1000) + 60));
    expect(token).toBe(signPayload(SECRET, canonicalImagePayload("abc.png", exp!)));
  });

  it("encodes filenames in the path", () => {
    const url = new URL(
      signImageUrl("http://proxy.test/", SECRET, "Comfy UI 1.png", 60, NOW)
    );

    expect(url.pathname).toBe("/images/Comfy%20UI%201.png");
  });
});
