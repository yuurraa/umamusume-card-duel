import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GameState } from "../../../../shared/src/types";
import { createGame, playerSurrender } from "../../game/engine";
import type { InspectTarget } from "../../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../../types/ui";
import { pickRandomOpponentDeck } from "../../utils/deck";
import { getRandomCustomisationSettings, type CustomisationSettings } from "../../utils/customisation";
import type { PendingCoinAttack } from "./useMatchActions";

export type UseAppNavigationArgs = {
  screen: AppScreen;
  pendingScreen: AppScreen | null;
  matchMode: MatchMode;
  equippedDeckCardIds: string[];
  hasPendingPlayerChoice: boolean;
  isTurnFlowBlocked: boolean;
  previousLogRef: MutableRefObject<string[]>;
  skipNextCoinLogMessageRef: MutableRefObject<string | null>;
  setMatchMode: Dispatch<SetStateAction<MatchMode>>;
  setPendingScreen: Dispatch<SetStateAction<AppScreen | null>>;
  setGame: Dispatch<SetStateAction<GameState>>;
  setCoinFlipQueue: Dispatch<SetStateAction<Array<{ id: number; result: "heads" | "tails"; message: string }>>>;
  setActiveCoinFlip: Dispatch<SetStateAction<{ id: number; result: "heads" | "tails"; message: string } | null>>;
  setAcknowledgedCoinLogMessage: Dispatch<SetStateAction<string | null>>;
  setPendingCoinAttack: Dispatch<SetStateAction<PendingCoinAttack | null>>;
  setSetupActiveIndex: Dispatch<SetStateAction<number | null>>;
  setSetupBenchIndexes: Dispatch<SetStateAction<number[]>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setSuppressEndTurnWarningForGame: Dispatch<SetStateAction<boolean>>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
  setDiscardOpen: Dispatch<SetStateAction<boolean>>;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setOpponentCustomisation: Dispatch<SetStateAction<CustomisationSettings>>;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
};

export function useAppNavigation({
  screen,
  pendingScreen,
  matchMode,
  equippedDeckCardIds,
  hasPendingPlayerChoice,
  isTurnFlowBlocked,
  previousLogRef,
  skipNextCoinLogMessageRef,
  setMatchMode,
  setPendingScreen,
  setGame,
  setCoinFlipQueue,
  setActiveCoinFlip,
  setAcknowledgedCoinLogMessage,
  setPendingCoinAttack,
  setSetupActiveIndex,
  setSetupBenchIndexes,
  setPendingSelection,
  setPreviewTarget,
  setSuppressEndTurnWarningForGame,
  setActionNotice,
  setDiscardOpen,
  setMenuOpen,
  setOpponentCustomisation,
  setEndTurnWarningActions,
}: UseAppNavigationArgs) {
  const startNewGame = (mode: MatchMode = matchMode) => {
    setMatchMode(mode);
    previousLogRef.current = [];
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setAcknowledgedCoinLogMessage(null);
    setPendingCoinAttack(null);
    skipNextCoinLogMessageRef.current = null;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setPreviewTarget(null);
    setSuppressEndTurnWarningForGame(false);
    setActionNotice(null);
    setDiscardOpen(false);
    setMenuOpen(false);
    setOpponentCustomisation(getRandomCustomisationSettings());
    const opponent = pickRandomOpponentDeck();
    setGame(createGame(equippedDeckCardIds, opponent.cardIds, opponent.name));
  };

  const navigateToScreen = (nextScreen: AppScreen) => {
    if (nextScreen === screen || pendingScreen) return;
    setPendingScreen(nextScreen);
  };

  const playEquippedDeck = () => {
    navigateToScreen("modeSelect");
  };

  const startWithMode = (mode: MatchMode) => {
    if (mode === "playerVsPlayer") return;
    startNewGame(mode);
    navigateToScreen("match");
  };

  const returnToMainMenu = () => {
    setPendingSelection(null);
    setEndTurnWarningActions(null);
    setPreviewTarget(null);
    setActionNotice(null);
    setDiscardOpen(false);
    setMenuOpen(false);
    navigateToScreen("mainMenu");
  };

  const quitApp = () => {
    window.close();
    window.setTimeout(() => {
      window.location.replace("about:blank");
    }, 80);
  };

  const toggleMenu = () => {
    if (isTurnFlowBlocked) return;
    setMenuOpen((open) => !open);
  };

  const handleSurrender = () => {
    setMenuOpen(false);
    setGame(playerSurrender);
  };

  const cancelPendingSelection = () => {
    if (hasPendingPlayerChoice) return;
    setPendingSelection(null);
  };

  const openPreview = (target: InspectTarget) => setPreviewTarget(target);
  const closePreview = () => setPreviewTarget(null);

  return {
    startNewGame,
    navigateToScreen,
    playEquippedDeck,
    startWithMode,
    returnToMainMenu,
    quitApp,
    toggleMenu,
    handleSurrender,
    cancelPendingSelection,
    openPreview,
    closePreview,
  };
}
