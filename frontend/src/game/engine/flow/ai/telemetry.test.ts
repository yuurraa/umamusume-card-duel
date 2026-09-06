import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame } from "../../../engine";
import { clearAiTelemetry, emitAiTelemetry, getAiTelemetrySnapshot } from "./telemetry";

describe("AI telemetry lifecycle", () => {
  const telemetryFlag = globalThis as typeof globalThis & { __UMA_AI_TELEMETRY__?: boolean };

  beforeEach(() => {
    telemetryFlag.__UMA_AI_TELEMETRY__ = true;
    clearAiTelemetry();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearAiTelemetry();
    delete telemetryFlag.__UMA_AI_TELEMETRY__;
    vi.restoreAllMocks();
  });

  it("does not clear an existing telemetry session when creating another game", () => {
    emitAiTelemetry("combat_candidates", { side: "opponent", turn: 1 });
    expect(getAiTelemetrySnapshot()).toHaveLength(1);

    createGame();

    expect(getAiTelemetrySnapshot()).toHaveLength(1);
  });
});
