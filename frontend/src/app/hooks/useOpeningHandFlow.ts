import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { GameEvent, GameState } from "../../../../shared/src/types";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";
import { toCoinFlipEventFromGameEvent, type CoinFlipEvent } from "../gameUiHelpers";

type UseOpeningHandFlowArgs = {
  game: GameState;
  activeCoinFlip: CoinFlipEvent | null;
  isCoinFlipBlocking: boolean;
  cardFlowQueue: CardFlowItem[][];
  setCardFlowQueue: Dispatch<SetStateAction<CardFlowItem[][]>>;
  setActiveCoinFlip: Dispatch<SetStateAction<CoinFlipEvent | null>>;
  setCoinFlipQueue: Dispatch<SetStateAction<CoinFlipEvent[]>>;
};

export type OpeningHandFlowState = {
  openingCoinChoicePending: boolean;
  setOpeningCoinChoicePending: Dispatch<SetStateAction<boolean>>;
  openingHandAnimationKeyRef: MutableRefObject<string | null>;
  shouldDealOpeningHandsAfterFlowRef: MutableRefObject<boolean>;
};

export function useOpeningHandFlow({
  game,
  activeCoinFlip,
  isCoinFlipBlocking,
  cardFlowQueue,
  setCardFlowQueue,
  setActiveCoinFlip,
  setCoinFlipQueue,
}: UseOpeningHandFlowArgs): OpeningHandFlowState {
  const [openingCoinChoicePending, setOpeningCoinChoicePending] = useState(false);
  const openingHandAnimationKeyRef = useRef<string | null>(null);
  const shouldDealOpeningHandsAfterFlowRef = useRef(false);
  const openingCoinEventIdRef = useRef<number | null>(null);

  useEffect(() => {
    const openingCoin = getOpeningCoinEvent(game);
    if (!openingCoin) {
      openingCoinEventIdRef.current = null;
      return;
    }
    if (openingCoinEventIdRef.current === openingCoin.id) return;
    openingCoinEventIdRef.current = openingCoin.id;
    const presentation = toCoinFlipEventFromGameEvent(openingCoin, openingCoin.id);
    if (!activeCoinFlip) {
      setActiveCoinFlip(presentation);
      return;
    }
    setCoinFlipQueue((queue) => queue.some((event) => event.id === presentation.id) ? queue : [...queue, presentation]);
  }, [activeCoinFlip, game, setActiveCoinFlip, setCoinFlipQueue]);

  useEffect(() => {
    if (game.gameOver || game.phase !== "setup") {
      setOpeningCoinChoicePending(false);
      return;
    }
    if (!game.setup?.coinChoice) {
      setOpeningCoinChoicePending(false);
      return;
    }
    if (game.setup.coinFlipResult || activeCoinFlip) setOpeningCoinChoicePending(false);
  }, [activeCoinFlip, game.gameOver, game.phase, game.setup?.coinChoice, game.setup?.coinFlipResult]);

  useEffect(() => {
    const setup = game.setup;
    if (game.phase !== "setup" || !setup?.coinFlipResult || setup.openingHandsDealt) return;
    if (isCoinFlipBlocking || cardFlowQueue.length > 0) return;
    const openingHand = setup.openingHands.player.filter(Boolean);
    if (openingHand.length === 0) return;

    const animationKey = `${setup.coinFlipResult}:${openingHand.join("|")}`;
    if (openingHandAnimationKeyRef.current === animationKey) return;
    openingHandAnimationKeyRef.current = animationKey;
    shouldDealOpeningHandsAfterFlowRef.current = true;
    setCardFlowQueue((queue) => [
      ...queue,
      openingHand.map((cardId) => ({
        cardId,
        group: "drawn" as const,
        enterFrom: "leftDeck" as const,
        exitTo: "bottomCenter" as const,
      })),
    ]);
  }, [cardFlowQueue.length, game.phase, game.setup, isCoinFlipBlocking, setCardFlowQueue]);

  return {
    openingCoinChoicePending,
    setOpeningCoinChoicePending,
    openingHandAnimationKeyRef,
    shouldDealOpeningHandsAfterFlowRef,
  };
}

function getOpeningCoinEvent(game: GameState): Extract<GameEvent, { kind: "coin" }> | null {
  const result = game.setup?.coinFlipResult;
  if (game.phase !== "setup" || !result) return null;
  return [...(game.events ?? [])]
    .reverse()
    .find((event): event is Extract<GameEvent, { kind: "coin" }> => (
      event.kind === "coin" && event.results.length === 1 && event.results[0] === result
    )) ?? null;
}
