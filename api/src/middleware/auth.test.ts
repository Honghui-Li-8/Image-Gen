import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "../db/token-store.js";
import { authMiddleware } from "./auth.js";

function makeReq(authorization?: string): Partial<Request> {
  return { headers: { authorization } } as Partial<Request>;
}

function makeRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as unknown as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

beforeEach(() => tokenStore.clear());
afterEach(() => tokenStore.clear());

describe("authMiddleware", () => {
  it("returns 401 when Authorization header is missing", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    authMiddleware(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header is malformed (no Bearer prefix)", () => {
    const req = makeReq("Basic abc123");
    const res = makeRes();
    const next = vi.fn();
    authMiddleware(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is not in the store", () => {
    const req = makeReq("Bearer unknowntoken");
    const res = makeRes();
    const next = vi.fn();
    authMiddleware(req as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and sets req.userId for a valid token", () => {
    tokenStore.set("validtoken", { token: "validtoken", userId: "u1", createdAt: new Date() });
    const req = makeReq("Bearer validtoken") as Request;
    const res = makeRes();
    const next = vi.fn();
    authMiddleware(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe("u1");
  });
});
