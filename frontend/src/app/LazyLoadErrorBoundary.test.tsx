import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyLoadErrorBoundary } from "./LazyLoadErrorBoundary";

describe("LazyLoadErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("error", preventWindowError);
  });

  afterEach(() => {
    window.removeEventListener("error", preventWindowError);
    vi.restoreAllMocks();
  });

  it("replaces a failed lazy subtree with a recoverable message", () => {
    function BrokenModule(): JSX.Element {
      throw new Error("chunk failed");
    }

    render(
      <LazyLoadErrorBoundary label="Deck browser">
        <BrokenModule />
      </LazyLoadErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Deck browser could not load.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

function preventWindowError(event: ErrorEvent): void {
  event.preventDefault();
}
