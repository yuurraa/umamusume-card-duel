import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CoinFlipResult, GameState } from "../../../../shared/src/types";
import { chooseOpeningCoin, playerAttack, tickSetupCountdown } from "../../game/engine";
import type { InspectTarget } from "../../inspect";
import type { PendingSelection } from "../../types/ui";
import type { PlayerIntent } from "../../pvp/playerIntent";

type UseMatchCommandControllerArgs = {
  game: GameState;
  pendingSelection: PendingSelection | null;
  isNetworkMatch: boolean;
  isPvpHost: boolean;
  setGame: Dispatch<SetStateAction<GameState>>;
  setOpeningCoinChoicePending: Dispatch<SetStateAction<boolean>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  submitPlayerIntent: (intent: PlayerIntent) => void;
  syncToGuest: (state: GameState) => void;
};

export function useMatchCommandController({
  game,
  pendingSelection,
  isNetworkMatch,
  isPvpHost,
  setGame,
  setOpeningCoinChoicePending,
  setPendingSelection,
  setPreviewTarget,
  submitPlayerIntent,
  syncToGuest,
}: UseMatchCommandControllerArgs) {
  const advanceSetupCountdown = useCallback(() => {
    const next = tickSetupCountdown(game);
    setGame(next);
    if (isPvpHost) syncToGuest(next);
  }, [game, isPvpHost, setGame, syncToGuest]);

  const handleChooseOpeningCoin = useCallback((choice: CoinFlipResult) => {
    if (isNetworkMatch && !isPvpHost) return;
    setOpeningCoinChoicePending(true);
    const next = chooseOpeningCoin(game, choice);
    setGame(next);
    if (isPvpHost) syncToGuest(next);
  }, [game, isNetworkMatch, isPvpHost, setGame, setOpeningCoinChoicePending, syncToGuest]);

  const chooseAttackShuffleSelf = useCallback((shouldShuffle: boolean) => {
    if (!pendingSelection || pendingSelection.kind !== "attackShuffleSelfChoice") return;
    if (isNetworkMatch) {
      submitPlayerIntent({
        type: "attack",
        attackIndex: pendingSelection.attackIndex,
        useShuffleSelfIntoDeck: shouldShuffle,
      });
    } else {
      setGame((current) => playerAttack(
        current,
        undefined,
        undefined,
        undefined,
        undefined,
        pendingSelection.attackIndex,
        undefined,
        undefined,
        undefined,
        shouldShuffle,
      ));
    }
    setPendingSelection(null);
    setPreviewTarget(null);
  }, [isNetworkMatch, pendingSelection, setGame, setPendingSelection, setPreviewTarget, submitPlayerIntent]);

  return { advanceSetupCountdown, handleChooseOpeningCoin, chooseAttackShuffleSelf };
}
