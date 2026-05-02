import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EnergyType, GameState, SideId } from "../../../../shared/src/types";
import { createGame } from "../../game/engine";
import type { InspectTarget } from "../../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../../types/ui";
import { getDeckEnergyTypes, pickRandomOpponentDeck } from "../../utils/deck";
import { getRandomCustomisationSettings, type CustomisationSettings } from "../../utils/customisation";
import type { PendingCoinAttack } from "./useMatchActions";
import type { PlayerIntent } from "../../pvp/playerIntent";

export type UseAppNavigationArgs = {
  screen: AppScreen;
  pendingScreen: AppScreen | null;
  matchMode: MatchMode;
  equippedDeckCardIds: string[];
  equippedDeckEnergyTypes: EnergyType[];
  playerName: string;
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
  setAiPerspective: Dispatch<SetStateAction<SideId>>;
  setPovSwitchAnimationToken: Dispatch<SetStateAction<number>>;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
  submitPlayerIntent: (intent: PlayerIntent) => void;
};

export function useAppNavigation({
  screen,
  pendingScreen,
  matchMode,
  equippedDeckCardIds,
  equippedDeckEnergyTypes,
  playerName,
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
  setAiPerspective,
  setPovSwitchAnimationToken,
  setEndTurnWarningActions,
  submitPlayerIntent,
}: UseAppNavigationArgs) {
  const startNewGame = (mode: MatchMode = matchMode) => {
    setMatchMode(mode);
    setAiPerspective("player");
    setPovSwitchAnimationToken(0);
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
    const playerAiDeck = mode === "aiVsAi" ? pickRandomOpponentDeck() : null;
    const opponent = pickRandomOpponentDeck();
    setGame(createGame(
      playerAiDeck?.cardIds ?? equippedDeckCardIds,
      opponent.cardIds,
      opponent.name,
      "hard",
      false,
      playerAiDeck?.name ?? playerName,
      playerAiDeck ? getDeckEnergyTypes(playerAiDeck) : equippedDeckEnergyTypes,
      getDeckEnergyTypes(opponent),
    ));
  };

  const navigateToScreen = (nextScreen: AppScreen) => {
    if (nextScreen === screen || pendingScreen) return;
    setPendingScreen(nextScreen);
  };

  const playEquippedDeck = () => {
    navigateToScreen("modeSelect");
  };

  const startWithMode = (mode: MatchMode) => {
    if (mode === "playerVsPlayer") {
      setMatchMode(mode);
      navigateToScreen("pvpLobby");
      return;
    }
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
    submitPlayerIntent({ type: "surrender" });
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
