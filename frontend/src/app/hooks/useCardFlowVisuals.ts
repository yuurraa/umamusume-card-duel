import { useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { dealOpeningHands } from "../../game/engine";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";
import type { GameState, SideId } from "../../../../shared/src/types";
import {
  buildCardFlowItems,
  createPlayerZonesSnapshot,
  splitCardFlowIntoBatches,
  type PlayerZonesSnapshot,
} from "../animation";

type UseCardFlowVisualsOptions = {
  game: Parameters<typeof createPlayerZonesSnapshot>[0];
  isAiVsAi: boolean;
  displayPerspective: SideId;
  isCoinFlipBlocking: boolean;
  selectedSleeveImage: string | null;
  opponentSleeveImage: string | null;
  setCardFlowQueue: Dispatch<SetStateAction<CardFlowItem[][]>>;
  setOpeningHandDeferredRevealCardIds: Dispatch<SetStateAction<string[]>>;
  openingHandDeferredRevealTimeoutRef: MutableRefObject<number | null>;
  shouldDealOpeningHandsAfterFlowRef: MutableRefObject<boolean>;
  setGame: Dispatch<SetStateAction<GameState>>;
  isPvpHost: boolean;
  syncToGuest: (state: GameState) => void;
};

export function useCardFlowVisuals({
  game,
  isAiVsAi,
  displayPerspective,
  isCoinFlipBlocking,
  selectedSleeveImage,
  opponentSleeveImage,
  setCardFlowQueue,
  setOpeningHandDeferredRevealCardIds,
  openingHandDeferredRevealTimeoutRef,
  shouldDealOpeningHandsAfterFlowRef,
  setGame,
  isPvpHost,
  syncToGuest,
}: UseCardFlowVisualsOptions) {
  const previousPlayerZonesRef = useRef<PlayerZonesSnapshot | null>(null);

  useLayoutEffect(() => {
    const previous = previousPlayerZonesRef.current;
    const current = createPlayerZonesSnapshot(game);

    if (!previous) {
      previousPlayerZonesRef.current = current;
      return;
    }

    if (game.phase !== "play" || game.gameOver) {
      previousPlayerZonesRef.current = current;
      return;
    }
    if (isCoinFlipBlocking) return;

    const povSideId: SideId = isAiVsAi ? displayPerspective : "player";
    const flowSleeveBySide: Record<SideId, string | null> = isAiVsAi && displayPerspective === "opponent"
      ? { player: opponentSleeveImage, opponent: selectedSleeveImage }
      : { player: selectedSleeveImage, opponent: opponentSleeveImage };
    const nextFlow = buildCardFlowItems({
      previous,
      current,
      povSideId,
      sleeveBySide: flowSleeveBySide,
    });

    if (nextFlow.length > 0) {
      const flowBatches = splitCardFlowIntoBatches(nextFlow);
      setCardFlowQueue((queue) => [...queue, ...flowBatches]);
    }

    previousPlayerZonesRef.current = current;
  }, [game, isAiVsAi, displayPerspective, isCoinFlipBlocking, opponentSleeveImage, selectedSleeveImage, setCardFlowQueue]);

  const resetCardFlowTracking = () => {
    previousPlayerZonesRef.current = null;
  };

  const showShuffleReveal = (cardId: string) => {
    setCardFlowQueue((queue) => [
      ...queue,
      [{
        cardId,
        label: "You Retrieved",
        group: "retrieved",
        enterFrom: "rightDiscard",
        exitTo: "leftDeck",
      }],
    ]);
  };

  const handleCardFlowDone = (completedFlow: CardFlowItem[]) => {
    setCardFlowQueue((queue) => queue.slice(1));
    if (!shouldDealOpeningHandsAfterFlowRef.current) return;
    shouldDealOpeningHandsAfterFlowRef.current = false;
    const openingRevealCardIds = completedFlow
      .filter((item) => item.group === "drawn" && item.exitTo === "bottomCenter")
      .map((item) => item.cardId);
    setOpeningHandDeferredRevealCardIds(openingRevealCardIds);
    if (openingHandDeferredRevealTimeoutRef.current !== null) window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
    openingHandDeferredRevealTimeoutRef.current = window.setTimeout(() => {
      setOpeningHandDeferredRevealCardIds([]);
      openingHandDeferredRevealTimeoutRef.current = null;
    }, 120);
    setGame((current) => {
      const next = dealOpeningHands(current);
      if (isPvpHost) syncToGuest(next);
      return next;
    });
  };

  return { resetCardFlowTracking, showShuffleReveal, handleCardFlowDone };
}
