import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EnergyType, GameState } from "../../../../shared/src/types";
import { clearAiTelemetry, createGame } from "../../game/engine";
import type { InspectTarget } from "../../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../../types/ui";
import { getDeckEnergyTypes, pickRandomOpponentDeck } from "../../utils/deck";
import { getRandomCustomisationSettings, type CustomisationSettings } from "../../utils/customisation";
import type { PlayerIntent } from "../../pvp/playerIntent";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";

export type UseAppNavigationArgs = {
  screen: AppScreen;
  pendingScreen: AppScreen | null;
  matchMode: MatchMode;
  equippedDeckCardIds: string[];
  equippedDeckEnergyTypes: EnergyType[];
  playerName: string;
  hasPendingPlayerChoice: boolean;
  isTurnFlowBlocked: boolean;
  setMatchMode: Dispatch<SetStateAction<MatchMode>>;
  setPendingScreen: Dispatch<SetStateAction<AppScreen | null>>;
  setGame: Dispatch<SetStateAction<GameState>>;
  setCardFlowQueue: Dispatch<SetStateAction<CardFlowItem[][]>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
  resetZoneModals: () => void;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  setOpponentCustomisation: Dispatch<SetStateAction<CustomisationSettings>>;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
  openingHandAnimationKeyRef: MutableRefObject<string | null>;
  shouldDealOpeningHandsAfterFlowRef: MutableRefObject<boolean>;
  resetTransientMatchUi: () => void;
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
  setMatchMode,
  setPendingScreen,
  setGame,
  setCardFlowQueue,
  setPendingSelection,
  setPreviewTarget,
  setActionNotice,
  resetZoneModals,
  setMenuOpen,
  setOpponentCustomisation,
  setEndTurnWarningActions,
  openingHandAnimationKeyRef,
  shouldDealOpeningHandsAfterFlowRef,
  resetTransientMatchUi,
  submitPlayerIntent,
}: UseAppNavigationArgs) {
  const startNewGame = (mode: MatchMode = matchMode) => {
    clearAiTelemetry();
    resetTransientMatchUi();
    setMatchMode(mode);
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
    resetZoneModals();
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
    setCardFlowQueue([]);
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
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
