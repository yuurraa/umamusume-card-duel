import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { GAME_OVER_REVEAL_DELAY_MS } from "../constants";

type UseGameOverPresentationArgs = {
  gameOver: boolean;
  battleEffectCount: number;
  koCrumbleCount: number;
  pointGainCount: number;
  cardFlowCount: number;
  activeCoinFlip: unknown;
  clearQueuedVisualActions: () => void;
  setOpeningHandDeferredRevealCardIds: Dispatch<SetStateAction<string[]>>;
  openingHandDeferredRevealTimeoutRef: MutableRefObject<number | null>;
  openingHandAnimationKeyRef: MutableRefObject<string | null>;
  shouldDealOpeningHandsAfterFlowRef: MutableRefObject<boolean>;
};

export function useGameOverPresentation({
  gameOver,
  battleEffectCount,
  koCrumbleCount,
  pointGainCount,
  cardFlowCount,
  activeCoinFlip,
  clearQueuedVisualActions,
  setOpeningHandDeferredRevealCardIds,
  openingHandDeferredRevealTimeoutRef,
  openingHandAnimationKeyRef,
  shouldDealOpeningHandsAfterFlowRef,
}: UseGameOverPresentationArgs) {
  const [gameOverModalVisible, setGameOverModalVisible] = useState(false);
  const gameOverRevealTimeoutRef = useRef<number | null>(null);

  const clearRevealTimeout = useCallback(() => {
    if (gameOverRevealTimeoutRef.current === null) return;
    window.clearTimeout(gameOverRevealTimeoutRef.current);
    gameOverRevealTimeoutRef.current = null;
  }, []);

  const resetGameOverPresentation = useCallback(() => {
    setGameOverModalVisible(false);
    clearRevealTimeout();
    setOpeningHandDeferredRevealCardIds([]);
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  }, [clearRevealTimeout, openingHandAnimationKeyRef, openingHandDeferredRevealTimeoutRef, setOpeningHandDeferredRevealCardIds, shouldDealOpeningHandsAfterFlowRef]);

  useEffect(() => () => {
    clearRevealTimeout();
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
  }, [clearRevealTimeout, openingHandDeferredRevealTimeoutRef]);

  useEffect(() => {
    if (!gameOver) {
      setGameOverModalVisible(false);
      clearRevealTimeout();
      return;
    }
    clearQueuedVisualActions();
    setOpeningHandDeferredRevealCardIds([]);
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  }, [clearQueuedVisualActions, clearRevealTimeout, gameOver, openingHandAnimationKeyRef, openingHandDeferredRevealTimeoutRef, setOpeningHandDeferredRevealCardIds, shouldDealOpeningHandsAfterFlowRef]);

  useEffect(() => {
    if (!gameOver || gameOverModalVisible) return;
    if (battleEffectCount > 0 || koCrumbleCount > 0 || pointGainCount > 0 || cardFlowCount > 0 || activeCoinFlip) return;
    if (gameOverRevealTimeoutRef.current !== null) return;

    gameOverRevealTimeoutRef.current = window.setTimeout(() => {
      setGameOverModalVisible(true);
      gameOverRevealTimeoutRef.current = null;
    }, GAME_OVER_REVEAL_DELAY_MS);

    return clearRevealTimeout;
  }, [activeCoinFlip, battleEffectCount, cardFlowCount, clearRevealTimeout, gameOver, gameOverModalVisible, koCrumbleCount, pointGainCount]);

  return { gameOverModalVisible, resetGameOverPresentation };
}
