import { getAllUmamusume, canUseStadium, canUseUmamusumeAbility, getRainbowUncapEvolutionHandOptions } from "../../game/engine";
import {
  createSetupEmptyOpponentSide,
  createSetupHiddenOpponentSide,
  createSetupPreviewSide,
  getSelectableUmamusumeUids,
} from "../../match/utils/helpers";
import type { PendingSelection } from "../../types/ui";
import type { CoinFlipEvent } from "../gameUiHelpers";
import { toCoinFlipEvent } from "../gameUiHelpers";
import type { GameState } from "../../../../shared/src/types";

type UseMatchDerivedStateArgs = {
  game: GameState;
  player: GameState["sides"]["player"];
  isNetworkMatch: boolean;
  timerNowMs: number;
  pendingSelection: PendingSelection | null;
  setupActiveIndex: number | null;
  setupBenchIndexes: number[];
  endTurnWarningActions: string[] | null;
  activeCoinFlip: CoinFlipEvent | null;
  coinFlipQueue: CoinFlipEvent[];
  acknowledgedCoinLogMessage: string | null;
};

export function useMatchDerivedState({
  game,
  player,
  isNetworkMatch,
  timerNowMs,
  pendingSelection,
  setupActiveIndex,
  setupBenchIndexes,
  endTurnWarningActions,
  activeCoinFlip,
  coinFlipQueue,
  acknowledgedCoinLogMessage,
}: UseMatchDerivedStateArgs) {
  const localPendingPlayerChoice = game.pendingPlayerChoice?.sideId === "player" ? game.pendingPlayerChoice : null;
  const activePendingSelection = localPendingPlayerChoice
    ? ({ kind: localPendingPlayerChoice.kind === "switchAfterGust" ? "forceSwitchActive" : "replaceActive" } as PendingSelection)
    : pendingSelection?.kind === "deckForScout" || pendingSelection?.kind === "deckForEvolutionSearch"
      ? null
      : pendingSelection;
  const selectableUmamusumeUids = getSelectableUmamusumeUids(game, activePendingSelection);
  const selectingOpponentUmamusume = pendingSelection?.kind === "attackDamageTarget" || pendingSelection?.kind === "abilityDamageTarget";
  const playerSelectableUmamusumeUids = selectingOpponentUmamusume ? undefined : selectableUmamusumeUids;
  const opponentSelectableUmamusumeUids = selectingOpponentUmamusume ? selectableUmamusumeUids : undefined;
  const selectableHandIndexes = pendingSelection?.kind === "rainbowUncapEvolution"
    ? new Set(
        getAllUmamusume(player)
          .filter((umamusume) => umamusume.uid === pendingSelection.umamusumeUid)
          .flatMap((umamusume) => getRainbowUncapEvolutionHandOptions(player, umamusume).map((option) => option.handIndex)),
      )
    : pendingSelection?.kind === "discardForAbility"
      ? new Set(player.hand.map((_, index) => index))
      : pendingSelection?.kind === "discardForAttackBonus"
        ? new Set(player.hand.map((_, index) => index))
      : pendingSelection?.kind === "discardForScout"
        ? new Set(player.hand.map((_, index) => index).filter((index) => index !== pendingSelection.handIndex))
      : undefined;
  const abilityEnergyTypes = pendingSelection?.kind === "moveEnergyAbility" ? new Set(pendingSelection.energyTypes) : undefined;
  const hiddenOpponent = game.phase === "setup" && !game.setup?.opponentRevealed;
  const latestCoinFlipLog = game.log[0];
  const latestCoinFlipMessage = latestCoinFlipLog && toCoinFlipEvent(latestCoinFlipLog, 0)
    ? latestCoinFlipLog
    : null;
  const unresolvedCoinLog = latestCoinFlipMessage !== null && latestCoinFlipMessage !== acknowledgedCoinLogMessage;
  const isBusyWithChoice = Boolean(pendingSelection || localPendingPlayerChoice || endTurnWarningActions);
  const isCoinFlipBlocking = Boolean(activeCoinFlip || coinFlipQueue.length > 0 || unresolvedCoinLog);
  const isPvpTimerExpiredForLocalPlayerTurn = isNetworkMatch
    && game.phase === "play"
    && game.currentSide === "player"
    && typeof game.turnDeadlineMs === "number"
    && timerNowMs >= game.turnDeadlineMs;
  const isTurnFlowBlocked = isCoinFlipBlocking || isPvpTimerExpiredForLocalPlayerTurn;
  const hideOpponentSetupBoard = game.phase === "setup" && isCoinFlipBlocking;
  const opponentBoardHidden = hiddenOpponent && !hideOpponentSetupBoard;
  const useSetupDraftPreview = game.phase === "setup" && !(game.setup?.readyBySide.player ?? false);
  const displayedPlayerSide = useSetupDraftPreview ? createSetupPreviewSide(player, setupActiveIndex, setupBenchIndexes) : player;
  const displayedOpponentSide = hideOpponentSetupBoard
    ? createSetupEmptyOpponentSide(game.sides.opponent)
    : hiddenOpponent
      ? createSetupHiddenOpponentSide(game.sides.opponent)
      : game.sides.opponent;
  const hiddenOpponentBenchCount = opponentBoardHidden ? game.sides.opponent.bench.length : undefined;
  const isPlayPhase = game.phase === "play";
  const showPlayerPlaymat = !isPlayPhase || game.currentSide === "player";
  const showOpponentPlaymat = isPlayPhase && game.currentSide === "opponent";
  const setupDragHandIndexByUid = useSetupDraftPreview
    ? {
        ...(setupActiveIndex !== null ? { [-1]: setupActiveIndex } : {}),
        ...Object.fromEntries(setupBenchIndexes.map((handIndex, order) => [-(order + 2), handIndex])),
      }
    : {};
  const abilityReadyUmamusumeUids = game.phase === "play" && game.currentSide === "player" && !game.gameOver && !isBusyWithChoice
    ? new Set(
        getAllUmamusume(player)
          .filter((umamusume) => canUseUmamusumeAbility(game, player, umamusume.uid))
          .map((umamusume) => umamusume.uid),
      )
    : undefined;
  const stadiumAbilityReady = game.phase === "play" && game.currentSide === "player" && !game.gameOver && !isBusyWithChoice
    ? canUseStadium(game, player)
    : false;

  return {
    activePendingSelection,
    playerSelectableUmamusumeUids,
    opponentSelectableUmamusumeUids,
    selectableHandIndexes,
    abilityEnergyTypes,
    hiddenOpponent,
    isBusyWithChoice,
    isCoinFlipBlocking,
    isTurnFlowBlocked,
    opponentBoardHidden,
    displayedPlayerSide,
    displayedOpponentSide,
    hiddenOpponentBenchCount,
    showPlayerPlaymat,
    showOpponentPlaymat,
    setupDragHandIndexByUid,
    abilityReadyUmamusumeUids,
    stadiumAbilityReady,
  };
}
