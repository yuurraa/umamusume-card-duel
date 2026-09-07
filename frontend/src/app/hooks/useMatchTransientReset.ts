import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { GameEvent } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";
import type { CoinFlipEvent } from "../gameUiHelpers";
import type { PendingSelection } from "../../types/ui";
import type { PendingCoinAttack } from "./useMatchActions";

type SetState<T> = Dispatch<SetStateAction<T>>;

export type UseMatchTransientResetOptions = {
  previousLogRef: MutableRefObject<string[]>;
  previousEventsRef: MutableRefObject<GameEvent[]>;
  resetCardFlowTracking: () => void;
  clearQueuedVisualActions: () => void;
  setCoinFlipQueue: SetState<CoinFlipEvent[]>;
  setActiveCoinFlip: SetState<CoinFlipEvent | null>;
  setAcknowledgedCoinLogMessage: SetState<string | null>;
  setPendingCoinAttack: SetState<PendingCoinAttack | null>;
  setCardFlowQueue: SetState<CardFlowItem[][]>;
  resetGameOverPresentation: () => void;
  resetBattleVisuals: () => void;
  skipNextCoinLogMessageRef: MutableRefObject<Array<"heads" | "tails"> | null>;
  setSetupActiveIndex: SetState<number | null>;
  setSetupBenchIndexes: SetState<number[]>;
  setPendingSelection: SetState<PendingSelection | null>;
  setEndTurnWarningActions: SetState<string[] | null>;
  setPreviewTarget: SetState<InspectTarget | null>;
  setSuppressEndTurnWarningForGame: SetState<boolean>;
  setActionNotice: SetState<string | null>;
  resetZoneModals: () => void;
  setMenuOpen: SetState<boolean>;
  setAiPerspective: SetState<"player" | "opponent">;
  setPovSwitchAnimationToken: SetState<number>;
  openingHandAnimationKeyRef: MutableRefObject<string | null>;
  shouldDealOpeningHandsAfterFlowRef: MutableRefObject<boolean>;
};

export function useMatchTransientReset({
  previousLogRef,
  previousEventsRef,
  resetCardFlowTracking,
  clearQueuedVisualActions,
  setCoinFlipQueue,
  setActiveCoinFlip,
  setAcknowledgedCoinLogMessage,
  setPendingCoinAttack,
  setCardFlowQueue,
  resetGameOverPresentation,
  resetBattleVisuals,
  skipNextCoinLogMessageRef,
  setSetupActiveIndex,
  setSetupBenchIndexes,
  setPendingSelection,
  setEndTurnWarningActions,
  setPreviewTarget,
  setSuppressEndTurnWarningForGame,
  setActionNotice,
  resetZoneModals,
  setMenuOpen,
  setAiPerspective,
  setPovSwitchAnimationToken,
  openingHandAnimationKeyRef,
  shouldDealOpeningHandsAfterFlowRef,
}: UseMatchTransientResetOptions): () => void {
  return useCallback(() => {
    previousLogRef.current = [];
    previousEventsRef.current = [];
    resetCardFlowTracking();
    clearQueuedVisualActions();
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setAcknowledgedCoinLogMessage(null);
    setPendingCoinAttack(null);
    setCardFlowQueue([]);
    resetGameOverPresentation();
    resetBattleVisuals();
    skipNextCoinLogMessageRef.current = null;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setEndTurnWarningActions(null);
    setPreviewTarget(null);
    setSuppressEndTurnWarningForGame(false);
    setActionNotice(null);
    resetZoneModals();
    setMenuOpen(false);
    setAiPerspective("player");
    setPovSwitchAnimationToken(0);
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  }, [
    clearQueuedVisualActions,
    openingHandAnimationKeyRef,
    previousEventsRef,
    previousLogRef,
    resetBattleVisuals,
    resetCardFlowTracking,
    resetGameOverPresentation,
    resetZoneModals,
    setActionNotice,
    setActiveCoinFlip,
    setAiPerspective,
    setAcknowledgedCoinLogMessage,
    setCardFlowQueue,
    setCoinFlipQueue,
    setEndTurnWarningActions,
    setMenuOpen,
    setPendingCoinAttack,
    setPendingSelection,
    setPovSwitchAnimationToken,
    setPreviewTarget,
    setSetupActiveIndex,
    setSetupBenchIndexes,
    setSuppressEndTurnWarningForGame,
    shouldDealOpeningHandsAfterFlowRef,
    skipNextCoinLogMessageRef,
  ]);
}
