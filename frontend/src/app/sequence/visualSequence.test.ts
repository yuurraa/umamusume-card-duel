import { describe, expect, it } from "vitest";
import {
  getVisualSequencePhase,
  isCurrentVisualSequenceCompletion,
  isVisualSequenceBlocking,
  type ActiveVisualSequence,
  type VisualSequenceInput,
} from "./visualSequence";

const idle: VisualSequenceInput = {
  coinFlipBlocking: false,
  battleEffectCount: 0,
  battleQueueHasKo: false,
  cardFlowCount: 0,
  cardFlowHasPriority: false,
  pointGainCount: 0,
  koCrumbleCount: 0,
  hasKoVacancy: false,
  hasKoPromotionLock: false,
  hasActivePromotionReveal: false,
  hasPendingChoice: false,
};

describe("visual sequence ownership", () => {
  it.each([
    ["coinFlipBlocking", { coinFlipBlocking: true }, "coinFlip"],
    ["battle before card flow", { battleEffectCount: 1, cardFlowCount: 1 }, "battle"],
    ["card flow priority", { battleEffectCount: 1, cardFlowCount: 1, cardFlowHasPriority: true }, "cardFlow"],
    ["KO dissolve", { koCrumbleCount: 1 }, "koDissolve"],
    ["point gain", { pointGainCount: 1 }, "pointGain"],
    ["promotion reveal", { hasKoVacancy: true }, "promotionReveal"],
    ["pending choice", { hasPendingChoice: true }, "awaitingChoice"],
  ] as const)("selects %s as the owner", (_label, override, expected) => {
    expect(getVisualSequencePhase({ ...idle, ...override })).toBe(expected);
  });

  it("does not block a pending choice when no visual phase is active", () => {
    expect(isVisualSequenceBlocking(getVisualSequencePhase({ ...idle, hasPendingChoice: true }))).toBe(false);
  });

  it("keeps a pending choice behind every blocking phase", () => {
    expect(getVisualSequencePhase({ ...idle, hasPendingChoice: true, pointGainCount: 1 })).toBe("pointGain");
    expect(getVisualSequencePhase({ ...idle, hasPendingChoice: true, koCrumbleCount: 1 })).toBe("koDissolve");
    expect(getVisualSequencePhase({ ...idle, hasPendingChoice: true, coinFlipBlocking: true })).toBe("coinFlip");
  });

  it("gives KO battle batches precedence over card-flow priority", () => {
    expect(getVisualSequencePhase({
      ...idle,
      battleEffectCount: 2,
      battleQueueHasKo: true,
      cardFlowCount: 1,
      cardFlowHasPriority: true,
    })).toBe("battle");
  });

  it.each([
    ["the active battle batch", { phase: "battle", batchKey: "4,5" }, true],
    ["an older battle batch", { phase: "battle", batchKey: "1,2" }, false],
    ["a point completion while battle owns flow", { phase: "pointGain", eventId: 8 }, false],
  ] as const)("accepts only %s", (_label, completion, expected) => {
    const active: ActiveVisualSequence = {
      phase: "battle",
      battleBatchKey: "4,5",
      pointGainEventId: 8,
    };
    expect(isCurrentVisualSequenceCompletion(active, completion)).toBe(expected);
  });

  it("accepts only the current point reward after battle has completed", () => {
    const active: ActiveVisualSequence = {
      phase: "pointGain",
      battleBatchKey: "",
      pointGainEventId: 9,
    };
    expect(isCurrentVisualSequenceCompletion(active, { phase: "pointGain", eventId: 9 })).toBe(true);
    expect(isCurrentVisualSequenceCompletion(active, { phase: "pointGain", eventId: 8 })).toBe(false);
  });
});
