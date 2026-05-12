import { useEffect, type MutableRefObject, type SetStateAction } from "react";
import {
  advanceOpponentTurnStep,
  advancePlayerAiTurnStep,
  canAttachEnergy,
  canAttack,
  autoCompleteOpponentSetup,
  chooseOpeningCoin,
  completePregameSetup,
  getAllUmamusume,
  getUmamusumeCard,
  resolvePendingPlayerChoice,
} from "../../game/engine";
import type { GameState, SideState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import type { AppScreen, PendingSelection } from "../../types/ui";
import { writeCustomisationSettings, type CustomisationSettings } from "../../utils/customisation";
import { writeEquippedDeckId } from "../../utils/deck";
import { getOpponentStepDelay } from "../../match/utils/helpers";
import {
  chooseAiSetupSelection,
  choosePreferredBenchUid,
  getPendingAttackCoinFlip,
  isBottomActionNotice,
  type CoinFlipEvent,
} from "../gameUiHelpers";
import { SCREEN_FADE_MS } from "../styles";
import type { PendingCoinAttack } from "./useMatchActions";

type SetState<T> = (value: SetStateAction<T>) => void;

type UseAppRuntimeEffectsArgs = {
  game: GameState;
  player: SideState;
  isAiVsAi: boolean;
  isNetworkMatch: boolean;
  shouldDriveSetupCountdown: boolean;
  advanceSetupCountdown: () => void;
  isTurnFlowBlocked: boolean;
  isBattleAnimationBlocking: boolean;
  isCoinFlipBlocking: boolean;
  hiddenOpponent: boolean;
  equippedDeckId: string;
  customisation: CustomisationSettings;
  screen: AppScreen;
  pendingScreen: AppScreen | null;
  actionNotice: string | null;
  previewTarget: InspectTarget | null;
  endTurnWarningActions: string[] | null;
  pendingSelection: PendingSelection | null;
  activeCoinFlip: CoinFlipEvent | null;
  coinFlipQueue: CoinFlipEvent[];
  coinFlipIdRef: MutableRefObject<number>;
  wasSetupCoinFlipBlockingRef: MutableRefObject<boolean>;
  setGame: SetState<GameState>;
  setScreen: SetState<AppScreen>;
  setPendingScreen: SetState<AppScreen | null>;
  setScreenFadeOverlayOpacity: SetState<number>;
  setActionNotice: SetState<string | null>;
  setPreviewTarget: SetState<InspectTarget | null>;
  setOpponentSetupRevealToken: SetState<number>;
  setPendingSelection: SetState<PendingSelection | null>;
  setEndTurnWarningActions: SetState<string[] | null>;
  setSetupActiveIndex: SetState<number | null>;
  setSetupBenchIndexes: SetState<number[]>;
  setDiscardOpen: SetState<boolean>;
  setMenuOpen: SetState<boolean>;
  setPendingCoinAttack: SetState<PendingCoinAttack | null>;
  setActiveCoinFlip: SetState<CoinFlipEvent | null>;
  setCoinFlipQueue: SetState<CoinFlipEvent[]>;
};

const AI_SETUP_DELAY_MS = 700;

export function useAppRuntimeEffects({
  game,
  player,
  isAiVsAi,
  isNetworkMatch,
  shouldDriveSetupCountdown,
  advanceSetupCountdown,
  isTurnFlowBlocked,
  isBattleAnimationBlocking,
  isCoinFlipBlocking,
  hiddenOpponent,
  equippedDeckId,
  customisation,
  screen,
  pendingScreen,
  actionNotice,
  previewTarget,
  endTurnWarningActions,
  pendingSelection,
  activeCoinFlip,
  coinFlipQueue,
  coinFlipIdRef,
  wasSetupCoinFlipBlockingRef,
  setGame,
  setScreen,
  setPendingScreen,
  setScreenFadeOverlayOpacity,
  setActionNotice,
  setPreviewTarget,
  setOpponentSetupRevealToken,
  setPendingSelection,
  setEndTurnWarningActions,
  setSetupActiveIndex,
  setSetupBenchIndexes,
  setDiscardOpen,
  setMenuOpen,
  setPendingCoinAttack,
  setActiveCoinFlip,
  setCoinFlipQueue,
}: UseAppRuntimeEffectsArgs) {
  const playerHandSignature = player.hand.join("|");

  useEffect(() => {
    writeEquippedDeckId(equippedDeckId);
  }, [equippedDeckId]);

  useEffect(() => {
    writeCustomisationSettings(customisation);
  }, [customisation]);

  useEffect(() => {
    if (!actionNotice) return undefined;
    if (isBottomActionNotice(actionNotice)) return undefined;
    const timeoutId = window.setTimeout(() => setActionNotice(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [actionNotice, setActionNotice]);

  useEffect(() => {
    if (!previewTarget?.umamusume || !previewTarget.sideId) return;
    if (game.phase === "setup") return;
    const liveSide = previewTarget.sideId === "player" ? game.sides.player : game.sides.opponent;
    const liveUmamusume = getAllUmamusume(liveSide).find((umamusume) => umamusume.uid === previewTarget.umamusume?.uid);
    if (!liveUmamusume) {
      setPreviewTarget(null);
      return;
    }
    const liveCard = getUmamusumeCard(liveUmamusume);
    if (liveUmamusume !== previewTarget.umamusume || liveCard.id !== previewTarget.card.id) {
      setPreviewTarget({
        ...previewTarget,
        card: liveCard,
        umamusume: liveUmamusume,
        isActive: liveSide.active?.uid === liveUmamusume.uid,
      });
    }
  }, [game, previewTarget, setPreviewTarget]);

  useEffect(() => {
    const setupCoinFlipBlocking = game.phase === "setup" && isCoinFlipBlocking;
    if (wasSetupCoinFlipBlockingRef.current && !setupCoinFlipBlocking && hiddenOpponent) {
      setOpponentSetupRevealToken((current) => current + 1);
    }
    wasSetupCoinFlipBlockingRef.current = setupCoinFlipBlocking;
  }, [game.phase, hiddenOpponent, isCoinFlipBlocking, setOpponentSetupRevealToken, wasSetupCoinFlipBlockingRef]);

  useEffect(() => {
    if (game.pendingPlayerChoice) setPreviewTarget(null);
  }, [game.pendingPlayerChoice, setPreviewTarget]);

  useEffect(() => {
    if (!game.gameOver) return;
    setPendingSelection(null);
    setEndTurnWarningActions(null);
    setPreviewTarget(null);
    setDiscardOpen(false);
    setMenuOpen(false);
  }, [game.gameOver, setPendingSelection, setEndTurnWarningActions, setPreviewTarget, setDiscardOpen, setMenuOpen]);

  useEffect(() => {
    if (!endTurnWarningActions) return;
    if (game.phase !== "play" || game.currentSide !== "player" || game.gameOver || pendingSelection || game.pendingPlayerChoice) {
      setEndTurnWarningActions(null);
      return;
    }
    if (!canAttachEnergy(game, player) && !canAttack(game, player)) setEndTurnWarningActions(null);
  }, [endTurnWarningActions, game, player, pendingSelection, setEndTurnWarningActions]);

  useEffect(() => {
    if (!pendingScreen || pendingScreen === screen) return;
    setScreenFadeOverlayOpacity(1);
    const timeoutId = window.setTimeout(() => {
      setScreen(pendingScreen);
      setPendingScreen(null);
      window.requestAnimationFrame(() => setScreenFadeOverlayOpacity(0));
    }, SCREEN_FADE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [pendingScreen, screen, setPendingScreen, setScreen, setScreenFadeOverlayOpacity]);

  useEffect(() => {
    if (game.phase !== "setup") return;
    // Preserve local setup selection after pressing Ready so setup reveal keys
    // remain stable and active/bench cards do not remount/re-animate.
    if (game.setup?.readyBySide.player) return;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setPreviewTarget(null);
  }, [game.phase, game.setup?.readyBySide.player, playerHandSignature, setSetupActiveIndex, setSetupBenchIndexes, setPendingSelection, setPreviewTarget]);

  useEffect(() => {
    if (!isAiVsAi || game.phase !== "setup" || game.gameOver || isTurnFlowBlocked) return;
    if (!game.setup?.openingHandsDealt || game.setup.readyBySide.player) return;
    const setup = chooseAiSetupSelection(game);
    if (!setup) return;
    const timeoutId = window.setTimeout(() => {
      setSetupActiveIndex(setup.activeIndex);
      setSetupBenchIndexes(setup.benchIndexes);
      setGame((current) => {
        if (current.phase !== "setup" || current.gameOver) return current;
        return completePregameSetup(current, setup.activeIndex, setup.benchIndexes);
      });
    }, AI_SETUP_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game, isAiVsAi, isTurnFlowBlocked, setGame, setSetupActiveIndex, setSetupBenchIndexes]);

  useEffect(() => {
    if (isNetworkMatch || game.phase !== "setup" || game.gameOver || isTurnFlowBlocked) return;
    if (game.humanBySide.opponent) return;
    if (!game.setup?.openingHandsDealt || game.setup.readyBySide.opponent) return;
    const timeoutId = window.setTimeout(() => {
      setGame((current) => autoCompleteOpponentSetup(current));
    }, AI_SETUP_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game, isNetworkMatch, isTurnFlowBlocked, setGame]);

  useEffect(() => {
    if (!isAiVsAi || game.phase !== "setup" || game.gameOver || isTurnFlowBlocked || isCoinFlipBlocking) return;
    if (game.setup?.coinFlipResult || game.setup?.coinChoice) return;
    const timeoutId = window.setTimeout(() => {
      setGame((current) => {
        if (current.phase !== "setup" || current.gameOver) return current;
        if (current.setup?.coinFlipResult || current.setup?.coinChoice) return current;
        const choice = Math.random() >= 0.5 ? "heads" : "tails";
        return chooseOpeningCoin(current, choice);
      });
    }, 520);
    return () => window.clearTimeout(timeoutId);
  }, [game, isAiVsAi, isTurnFlowBlocked, isCoinFlipBlocking, setGame]);

  useEffect(() => {
    const setup = game.setup;
    if (!shouldDriveSetupCountdown || game.phase !== "setup" || game.gameOver || !setup) return;
    if (!setup.readyBySide.player || !setup.readyBySide.opponent) return;
    if (setup.countdownSecondsRemaining === null || setup.countdownSecondsRemaining <= 0) return;
    const timeoutId = window.setTimeout(() => {
      advanceSetupCountdown();
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [
    advanceSetupCountdown,
    shouldDriveSetupCountdown,
    game.phase,
    game.gameOver,
    game.setup,
  ]);

  useEffect(() => {
    const pendingChoice = game.pendingPlayerChoice;
    if (!pendingChoice || game.gameOver || isBattleAnimationBlocking) return;
    if (game.humanBySide[pendingChoice.sideId] && !isAiVsAi) return;
    const preferredBenchUid = choosePreferredBenchUid(game.sides[pendingChoice.sideId]);
    if (preferredBenchUid === undefined) return;
    setGame((current) => resolvePendingPlayerChoice(current, preferredBenchUid));
  }, [game, isAiVsAi, isBattleAnimationBlocking, setGame]);

  useEffect(() => {
    if (isNetworkMatch || isTurnFlowBlocked || game.phase !== "play" || game.currentSide !== "opponent" || game.gameOver || game.pendingPlayerChoice) return undefined;
    const timeoutId = window.setTimeout(() => {
      const coinAttack = getPendingAttackCoinFlip(game, "opponent", coinFlipIdRef.current++);
      if (coinAttack) {
        setPendingCoinAttack({ eventId: coinAttack.id, attackerId: "opponent", result: coinAttack.result, results: coinAttack.results });
        setActiveCoinFlip(coinAttack);
        return;
      }
      setGame((current) => advanceOpponentTurnStep(current));
    }, getOpponentStepDelay(game));
    return () => window.clearTimeout(timeoutId);
  }, [game, isTurnFlowBlocked, isNetworkMatch, coinFlipIdRef, setPendingCoinAttack, setActiveCoinFlip, setGame]);

  useEffect(() => {
    if (!isAiVsAi || isTurnFlowBlocked || game.phase !== "play" || game.currentSide !== "player" || game.gameOver || game.pendingPlayerChoice) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (game.opponentTurnStep === "attack") {
        const coinAttack = getPendingAttackCoinFlip(game, "player", coinFlipIdRef.current++);
        if (coinAttack) {
          setPendingCoinAttack({ eventId: coinAttack.id, attackerId: "player", result: coinAttack.result, results: coinAttack.results });
          setActiveCoinFlip(coinAttack);
          return;
        }
      }
      setGame((current) => advancePlayerAiTurnStep(current));
    }, getOpponentStepDelay(game));
    return () => window.clearTimeout(timeoutId);
  }, [game, isTurnFlowBlocked, isAiVsAi, coinFlipIdRef, setPendingCoinAttack, setActiveCoinFlip, setGame]);

  useEffect(() => {
    if (activeCoinFlip || coinFlipQueue.length === 0) return;
    const [nextFlip, ...rest] = coinFlipQueue;
    setActiveCoinFlip(nextFlip ?? null);
    setCoinFlipQueue(rest);
  }, [coinFlipQueue, activeCoinFlip, setActiveCoinFlip, setCoinFlipQueue]);
}
