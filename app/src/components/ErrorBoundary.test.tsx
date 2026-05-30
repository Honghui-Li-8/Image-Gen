import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

const ThrowOnRender = () => {
  throw new Error("test render error");
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <span>content</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText("content")).toBeDefined();
  });

  it("renders fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong.")).toBeDefined();
  });

  it("fallback shows a reload button", () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: /reload/i })).toBeDefined();
  });

  it("reload button calls window.location.reload", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reload).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
