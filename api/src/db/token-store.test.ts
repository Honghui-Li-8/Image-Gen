import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTokenUserId, tokenStore } from "./token-store.js";

beforeEach(() => {
  tokenStore.clear();
});

afterEach(() => {
  tokenStore.clear();
});

describe("tokenStore", () => {
  it("is empty on initialisation", () => {
    expect(tokenStore.size).toBe(0);
  });

  it("stores and retrieves a token", () => {
    tokenStore.set("tok1", { token: "tok1", userId: "u1", createdAt: new Date() });
    expect(tokenStore.get("tok1")).toBeDefined();
    expect(tokenStore.get("tok1")?.userId).toBe("u1");
  });

  it("deletes a token", () => {
    tokenStore.set("tok1", { token: "tok1", userId: "u1", createdAt: new Date() });
    tokenStore.delete("tok1");
    expect(tokenStore.get("tok1")).toBeUndefined();
  });

  it("resolveTokenUserId returns userId for a valid token", () => {
    tokenStore.set("tok1", { token: "tok1", userId: "u1", createdAt: new Date() });
    expect(resolveTokenUserId("tok1")).toBe("u1");
  });

  it("resolveTokenUserId returns null for an unknown token", () => {
    expect(resolveTokenUserId("unknown")).toBeNull();
  });
});
