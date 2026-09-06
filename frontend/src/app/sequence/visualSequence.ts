export type VisualSequencePhase =
  | "idle"
  | "cardFlow"
  | "coinFlip"
  | "battle"
  | "koDissolve"
  | "pointGain"
  | "promotionReveal"
  | "awaitingChoice";

export type VisualSequenceInput = {
  coinFlipBlocking: boolean;
  battleEffectCount: number;
  battleQueueHasKo: boolean;
  cardFlowCount: number;
  cardFlowHasPriority: boolean;
  pointGainCount: number;
  koCrumbleCount: number;
  hasKoVacancy: boolean;
  hasKoPromotionLock: boolean;
  hasActivePromotionReveal: boolean;
  hasPendingChoice: boolean;
};

/** The single precedence order used to decide which visual phase owns input. */
export function getVisualSequencePhase(input: VisualSequenceInput): VisualSequencePhase {
  if (input.coinFlipBlocking) return "coinFlip";
  if (input.battleEffectCount > 0 && (!input.cardFlowHasPriority || input.battleQueueHasKo)) return "battle";
  if (input.koCrumbleCount > 0) return "koDissolve";
  if (input.pointGainCount > 0) return "pointGain";
  if (input.hasKoVacancy || input.hasKoPromotionLock || input.hasActivePromotionReveal) return "promotionReveal";
  if (input.cardFlowCount > 0 && !input.hasPendingChoice) return "cardFlow";
  if (input.hasPendingChoice) return "awaitingChoice";
  return "idle";
}

export function isVisualSequenceBlocking(phase: VisualSequencePhase): boolean {
  return phase !== "idle" && phase !== "awaitingChoice";
}
