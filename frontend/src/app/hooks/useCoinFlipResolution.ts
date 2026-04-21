import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GameState } from "../../../../shared/src/types";
import { advanceOpponentTurnStep, playerAttack } from "../../game/engine";
import type { CoinFlipEvent } from "../gameUiHelpers";
import type { PendingCoinAttack } from "./useMatchActions";

type UseCoinFlipResolutionArgs = {
  game: GameState;
  activeCoinFlip: CoinFlipEvent | null;
  pendingCoinAttack: PendingCoinAttack | null;
  skipNextCoinLogMessageRef: MutableRefObject<string | null>;
  setGame: Dispatch<SetStateAction<GameState>>;
  setPendingCoinAttack: Dispatch<SetStateAction<PendingCoinAttack | null>>;
  setActiveCoinFlip: Dispatch<SetStateAction<CoinFlipEvent | null>>;
  setCoinFlipQueue: Dispatch<SetStateAction<CoinFlipEvent[]>>;
  setAcknowledgedCoinLogMessage: Dispatch<SetStateAction<string | null>>;
  toCoinFlipEvent: (entry: string, id: number) => CoinFlipEvent | null;
};

export function useCoinFlipResolution({
  game,
  activeCoinFlip,
  pendingCoinAttack,
  skipNextCoinLogMessageRef,
  setGame,
  setPendingCoinAttack,
  setActiveCoinFlip,
  setCoinFlipQueue,
  setAcknowledgedCoinLogMessage,
  toCoinFlipEvent,
}: UseCoinFlipResolutionArgs) {
  const handleCoinFlipContinue = useCallback(() => {
    if (!activeCoinFlip) return;
    const coinAttack = pendingCoinAttack?.eventId === activeCoinFlip.id ? pendingCoinAttack : null;
    if (coinAttack) {
      const resolvedAttackCoinLog = `Flip a coin and got 1x ${coinAttack.result}.`;
      skipNextCoinLogMessageRef.current = resolvedAttackCoinLog;
      setAcknowledgedCoinLogMessage(resolvedAttackCoinLog);
      setCoinFlipQueue((queue) => queue.filter((event) => event.message !== resolvedAttackCoinLog));
      setGame((current) =>
        coinAttack.attackerId === "player"
          ? playerAttack(current, coinAttack.attackTargetUid, coinAttack.healTargetUid, coinAttack.result)
          : advanceOpponentTurnStep(current, coinAttack.result),
      );
      setPendingCoinAttack(null);
    }
    const topCoinFlipLog = game.log[0];
    const topMessage = topCoinFlipLog && toCoinFlipEvent(topCoinFlipLog, 0)
      ? topCoinFlipLog
      : null;
    if (topMessage !== null) setAcknowledgedCoinLogMessage(topMessage);
    setActiveCoinFlip(null);
  }, [
    activeCoinFlip,
    pendingCoinAttack,
    skipNextCoinLogMessageRef,
    setAcknowledgedCoinLogMessage,
    setCoinFlipQueue,
    setGame,
    setPendingCoinAttack,
    game.log,
    toCoinFlipEvent,
    setActiveCoinFlip,
  ]);

  return { handleCoinFlipContinue };
}
