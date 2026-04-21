import type { Dispatch, SetStateAction } from "react";
import { MAX_BENCH } from "../../../../shared/src/gameData";
import { getCard } from "../../game/engine";

type UseSetupActionsArgs = {
  playerHand: string[];
  setupActiveIndex: number | null;
  setupBenchIndexes: number[];
  isTurnFlowBlocked: boolean;
  setSetupActiveIndex: Dispatch<SetStateAction<number | null>>;
  setSetupBenchIndexes: Dispatch<SetStateAction<number[]>>;
};

export function useSetupActions({
  playerHand,
  setupActiveIndex,
  setupBenchIndexes,
  isTurnFlowBlocked,
  setSetupActiveIndex,
  setSetupBenchIndexes,
}: UseSetupActionsArgs) {
  const isValidBasicIndex = (index: number): boolean => {
    const cardId = playerHand[index];
    const card = cardId ? getCard(cardId) : null;
    return Boolean(card && card.kind === "umamusume" && card.stage === 0);
  };

  const applySetupActive = (index: number) => {
    if (isTurnFlowBlocked) return;
    if (!isValidBasicIndex(index)) return;
    setSetupActiveIndex(index);
    setSetupBenchIndexes((current) => current.filter((entry) => entry !== index));
  };

  const promoteSetupBenchToActive = (index: number) => {
    if (isTurnFlowBlocked) return;
    if (!isValidBasicIndex(index)) return;
    if (!setupBenchIndexes.includes(index)) {
      applySetupActive(index);
      return;
    }
    setSetupBenchIndexes((current) => {
      const withoutTarget = current.filter((entry) => entry !== index);
      return setupActiveIndex === null ? withoutTarget : [...withoutTarget, setupActiveIndex].slice(0, MAX_BENCH);
    });
    setSetupActiveIndex(index);
  };

  const applySetupBench = (index: number) => {
    if (isTurnFlowBlocked) return;
    if (!isValidBasicIndex(index)) return;
    if (index === setupActiveIndex) return;
    setSetupBenchIndexes((current) => {
      if (current.includes(index) || current.length >= MAX_BENCH) return current;
      return [...current, index];
    });
  };

  return {
    applySetupActive,
    promoteSetupBenchToActive,
    applySetupBench,
  };
}
