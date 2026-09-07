import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoinFlipOverlay } from "./CoinFlipOverlay";

describe("CoinFlipOverlay", () => {
  it("does not render choice controls for a waiting peer", () => {
    render(
      <CoinFlipOverlay
        mode="prompt"
        canChoose={false}
        message="Waiting for host to choose heads or tails..."
      />,
    );

    expect(screen.getByText("Waiting for host to choose heads or tails...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Heads" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tails" })).toBeNull();
  });

  it("renders choice controls only for the host", () => {
    render(
      <CoinFlipOverlay
        mode="prompt"
        canChoose
        message="Choose heads or tails"
      />,
    );

    expect(screen.getByRole("button", { name: "Heads" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tails" })).toBeTruthy();
  });
});
