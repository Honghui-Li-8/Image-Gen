import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGenerationOptions } from "./useGenerationOptions";
import { ApiError } from "../utils/api";

vi.mock("../utils/api", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { ApiError: MockApiError, apiFetch: vi.fn() };
});

const { apiFetch } = await import("../utils/api");
const mockApiFetch = vi.mocked(apiFetch);

const mockOptions = { models: { "m1": { id: "m1" } }, defaultModelId: "m1" };

const makeWrapper = (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

const freshClient = () =>
  new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGenerationOptions", () => {
  it("returns loading status when token is null", () => {
    const { result } = renderHook(
      () => useGenerationOptions("http://api", null, vi.fn()),
      { wrapper: makeWrapper(freshClient()) },
    );
    expect(result.current.optionsStatus).toBe("loading");
    expect(result.current.options).toBeNull();
  });

  it("returns ready status and options on success", async () => {
    mockApiFetch.mockResolvedValueOnce({
      json: async () => mockOptions,
    } as Response);

    const { result } = renderHook(
      () => useGenerationOptions("http://api", "token123", vi.fn()),
      { wrapper: makeWrapper(freshClient()) },
    );

    await waitFor(() => expect(result.current.optionsStatus).toBe("ready"));
    expect(result.current.options).toEqual(mockOptions);
  });

  it("returns failed status when fetch throws a non-401 error", async () => {
    mockApiFetch.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(
      () => useGenerationOptions("http://api", "token123", vi.fn()),
      { wrapper: makeWrapper(freshClient()) },
    );

    await waitFor(
      () => expect(result.current.optionsStatus).toBe("failed"),
      { timeout: 5000 },
    );
    expect(result.current.options).toBeNull();
  });

  it("calls onUnauthorized when fetch throws ApiError 401", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(401, "Unauthorized"));

    const onUnauthorized = vi.fn();
    renderHook(
      () => useGenerationOptions("http://api", "token123", onUnauthorized),
      { wrapper: makeWrapper(freshClient()) },
    );

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled(), { timeout: 5000 });
  });

  it("exposes refetchOptions as a callable function", async () => {
    mockApiFetch.mockResolvedValue({ json: async () => mockOptions } as Response);

    const { result } = renderHook(
      () => useGenerationOptions("http://api", "token123", vi.fn()),
      { wrapper: makeWrapper(freshClient()) },
    );

    await waitFor(() => expect(result.current.optionsStatus).toBe("ready"));
    expect(typeof result.current.refetchOptions).toBe("function");
  });

  it("does not re-fetch on second mount when cache is warm (staleTime: Infinity)", async () => {
    mockApiFetch.mockResolvedValue({ json: async () => mockOptions } as Response);

    const shared = freshClient();
    const wrapper = makeWrapper(shared);

    const { result: r1 } = renderHook(
      () => useGenerationOptions("http://api", "token123", vi.fn()),
      { wrapper },
    );
    await waitFor(() => expect(r1.current.optionsStatus).toBe("ready"));

    const { result: r2 } = renderHook(
      () => useGenerationOptions("http://api", "token123", vi.fn()),
      { wrapper },
    );
    await waitFor(() => expect(r2.current.optionsStatus).toBe("ready"));

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
