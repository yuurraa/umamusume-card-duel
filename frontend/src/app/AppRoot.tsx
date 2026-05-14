import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  canAttachEnergy,
  chooseOpeningCoin,
  createGame,
  playerAttack,
  tickSetupCountdown,
} from "../game/engine";
import type { InspectTarget } from "../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../types/ui";
import { getDeckById, getDeckEnergyTypes, readEquippedDeckId, pickRandomOpponentDeck } from "../utils/deck";
import type { CardFlowItem } from "../match/feedback/CardFlowOverlay";
import {
  getPlaymatTextTone,
  getSelectedPlaymat,
  getSelectedSleeve,
  getRandomCustomisationSettings,
  readCustomisationSettings,
  type CustomisationSettings,
} from "../utils/customisation";
import {
  type CoinFlipEvent,
  formatKoActionNotice,
  getKoCauseFromEntries,
  getNewLogEntries,
  getPendingAttackCoinFlip,
  getTopActionBanner,
  isBottomActionNotice,
  toCoinFlipEvent,
} from "./gameUiHelpers";
import { SCREEN_FADE_MS, appStyle, matchBackgroundLayerStyle, screenFadeOverlayStyle } from "./styles";
import { renderNonMatchScreen } from "./nonMatchScreens";
import { useEscapeHotkey } from "./hooks/useEscapeHotkey";
import { useLogNotifications } from "./hooks/useLogNotifications";
import { type PendingCoinAttack, useMatchActions } from "./hooks/useMatchActions";
import { useCardPreviewActions } from "./hooks/useCardPreviewActions";
import { useCoinFlipResolution } from "./hooks/useCoinFlipResolution";
import { useMatchDerivedState } from "./hooks/useMatchDerivedState";
import { useSetupActions } from "./hooks/useSetupActions";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useAppRuntimeEffects } from "./hooks/useAppRuntimeEffects";
import { useMatchUiActions } from "./hooks/useMatchUiActions";
import { useMatchModalActions } from "./hooks/useMatchModalActions";
import { useFirebaseAccount } from "./hooks/useFirebaseAccount";
import { useBattleVisuals } from "./hooks/useBattleVisuals";
import { useCardFlowVisuals } from "./hooks/useCardFlowVisuals";
import { usePvpMatch } from "./hooks/usePvpMatch";
import { AiTelemetryPanel } from "./AiTelemetryPanel";
import { getAccountPlayerName } from "../utils/playerNames";
import type { CoinFlipResult, EnergyType, GameState, SideId, UmamusumeInstance } from "../../../shared/src/types";
import { MatchBoardLayout } from "./lazyMatchComponents";
import { MatchOverlays } from "./MatchOverlays";
import { GAME_OVER_REVEAL_DELAY_MS } from "./constants";
import { delay } from "./pvp/rtcHelpers";
import { redactHiddenSidePrivateInfo, swapBattlePerspectiveText, toPerspectiveGame } from "./matchPerspective";
export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [pendingScreen, setPendingScreen] = useState<AppScreen | null>(null);
  const [screenFadeOverlayOpacity, setScreenFadeOverlayOpacity] = useState(0);
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
  const [matchMode, setMatchMode] = useState<MatchMode>("playerVsAi");
  const showAiTelemetryPanel = import.meta.env.DEV && matchMode !== "playerVsPlayer";
  const [aiPerspective, setAiPerspective] = useState<SideId>("player");
  const [customisation, setCustomisation] = useState<CustomisationSettings>(() => readCustomisationSettings());
  const [opponentCustomisation, setOpponentCustomisation] = useState<CustomisationSettings>(() => getRandomCustomisationSettings());
  const [game, setGame] = useState(() => {
    const playerDeck = getDeckById(readEquippedDeckId());
    const opponent = pickRandomOpponentDeck();
    return createGame(playerDeck.cardIds, opponent.cardIds, opponent.name, "hard", false, "Guest", getDeckEnergyTypes(playerDeck), getDeckEnergyTypes(opponent));
  });
  const [previewTarget, setPreviewTarget] = useState<InspectTarget | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [endTurnWarningActions, setEndTurnWarningActions] = useState<string[] | null>(null);
  const [suppressEndTurnWarningForGame, setSuppressEndTurnWarningForGame] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [revealedOpponentHandOpen, setRevealedOpponentHandOpen] = useState(false);
  const [revealedOpponentHandCardIds, setRevealedOpponentHandCardIds] = useState<string[]>([]);
  const [opponentZonesOpen, setOpponentZonesOpen] = useState(false);
  const [discardViewSide, setDiscardViewSide] = useState<SideId>("player");
  const [coinFlipQueue, setCoinFlipQueue] = useState<CoinFlipEvent[]>([]);
  const [activeCoinFlip, setActiveCoinFlip] = useState<CoinFlipEvent | null>(null);
  const [acknowledgedCoinLogMessage, setAcknowledgedCoinLogMessage] = useState<string | null>(null);
  const [pendingCoinAttack, setPendingCoinAttack] = useState<PendingCoinAttack | null>(null);
  const [cardFlowQueue, setCardFlowQueue] = useState<CardFlowItem[][]>([]);
  const [openingHandDeferredRevealCardIds, setOpeningHandDeferredRevealCardIds] = useState<string[]>([]);
  const [gameOverModalVisible, setGameOverModalVisible] = useState(false);
  const [openingCoinChoicePending, setOpeningCoinChoicePending] = useState(false);
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    firebaseAccount,
    accountBusy,
    linkGoogleAccount,
    logoutAccount,
  } = useFirebaseAccount(setActionNotice);

  useEffect(() => {
    const telemetryFlag = globalThis as typeof globalThis & { __UMA_AI_TELEMETRY__?: boolean };
    if (telemetryFlag.__UMA_AI_TELEMETRY__ === undefined) {
      telemetryFlag.__UMA_AI_TELEMETRY__ = import.meta.env.DEV;
    }
  }, []);
  const [opponentSetupRevealToken, setOpponentSetupRevealToken] = useState(0);
  const [povSwitchAnimationToken, setPovSwitchAnimationToken] = useState(0);
  const [suppressOpponentPlaymatLayer, setSuppressOpponentPlaymatLayer] = useState(true);
  const [hasSeenMatchSetupPhase, setHasSeenMatchSetupPhase] = useState(false);
  const previousLogRef = useRef<string[]>([]);
  const gameOverRevealTimeoutRef = useRef<number | null>(null);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
  const openingHandAnimationKeyRef = useRef<string | null>(null);
  const openingHandDeferredRevealTimeoutRef = useRef<number | null>(null);
  const shouldDealOpeningHandsAfterFlowRef = useRef(false);
  const queuedVisualActionsRef = useRef<Array<() => void>>([]);
  const skipNextCoinLogMessageRef = useRef<string | null>(null);
  const lastVisiblePlaymatSideRef = useRef<SideId>("player");
  const equippedDeck = getDeckById(equippedDeckId);
  const selectedPlaymat = getSelectedPlaymat(customisation);
  const uiTextTone = getPlaymatTextTone(customisation);
  const selectedSleeve = getSelectedSleeve(customisation);
  const opponentPlaymat = getSelectedPlaymat(opponentCustomisation);
  const opponentSleeve = getSelectedSleeve(opponentCustomisation);
  const isAiVsAi = matchMode === "aiVsAi";
  const isNetworkMatch = matchMode === "playerVsPlayer";
  // During preparation we always show the player's playmat to avoid a one-frame flash
  // if the POV was previously switched in AI-vs-AI.
  const displayPerspective: SideId = isAiVsAi ? (game.phase === "setup" ? "player" : aiPerspective) : "player";
  const baseDisplayGame = isNetworkMatch ? game : toPerspectiveGame(game, displayPerspective);
  const latestCoinFlipLog = game.log[0];
  const latestCoinFlipMessage = latestCoinFlipLog && toCoinFlipEvent(latestCoinFlipLog, 0)
    ? latestCoinFlipLog
    : null;
  const isCoinFlipBlockingForVisuals = Boolean(
    activeCoinFlip
    || coinFlipQueue.length > 0
    || (latestCoinFlipMessage !== null && latestCoinFlipMessage !== acknowledgedCoinLogMessage),
  );
  const {
    displayGame,
    battleEffectQueue,
    activeBattleEffects,
    completeBattleEffect,
    canShowBattleEffects,
    canShowCardFlowOverlay,
    pointGainQueue,
    completePointGain,
    koCrumblingUids,
    koAnimatingUids,
    visualFlowBlocked,
    canShowSelectionPromptBase,
    activeKoImpactUidBySide,
    activeKoAnimatingUidBySide,
    suppressActiveReplacementBySide,
    visualHpByUid,
    visualAttachedEnergyByUid,
    visualScorePointsBySide,
    scorePointGainAnimatingBySide,
    resetBattleVisuals,
  } = useBattleVisuals({
    baseDisplayGame,
    isCoinFlipBlocking: isCoinFlipBlockingForVisuals,
    activeCoinFlip,
    cardFlowQueue,
    pendingPlayerChoice: game.pendingPlayerChoice,
  });
  const player = game.sides.player;
  const displayPlayer = displayGame.sides.player;
  const localPlayerName = getAccountPlayerName(firebaseAccount);
  const formatMatchText = (text: string): string => {
    if (isNetworkMatch) return redactHiddenSidePrivateInfo(text);
    const perspectiveText = displayPerspective === "opponent" ? swapBattlePerspectiveText(text) : text;
    return redactHiddenSidePrivateInfo(perspectiveText);
  };
  const displayLog = game.log.map(formatMatchText);
  const hasLocalPendingChoice = game.pendingPlayerChoice?.sideId === "player";
  const nextPlayerEnergy = displayPlayer.energyZone[0] ?? null;
  useEffect(() => () => {
    if (gameOverRevealTimeoutRef.current !== null) {
      window.clearTimeout(gameOverRevealTimeoutRef.current);
      gameOverRevealTimeoutRef.current = null;
    }
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    // Prevent a one-frame flash of the opponent playmat when entering the match screen
    // while the game state is being replaced (e.g. starting a new game).
    if (screen !== "match") {
      setSuppressOpponentPlaymatLayer(true);
      setHasSeenMatchSetupPhase(false);
      return;
    }
    setSuppressOpponentPlaymatLayer(true);
    setHasSeenMatchSetupPhase(false);
  }, [screen]);

  useEffect(() => {
    if (screen !== "match") return;
    if (game.phase === "setup") {
      setHasSeenMatchSetupPhase(true);
      setSuppressOpponentPlaymatLayer(true);
      return;
    }
    if (game.phase === "play" && (!isAiVsAi || hasSeenMatchSetupPhase)) {
      setSuppressOpponentPlaymatLayer(false);
    }
  }, [game.phase, hasSeenMatchSetupPhase, isAiVsAi, screen]);

  useEffect(() => {
    if (!game.gameOver) {
      setGameOverModalVisible(false);
      if (gameOverRevealTimeoutRef.current !== null) {
        window.clearTimeout(gameOverRevealTimeoutRef.current);
        gameOverRevealTimeoutRef.current = null;
      }
      return;
    }
    queuedVisualActionsRef.current = [];
    setOpeningHandDeferredRevealCardIds([]);
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  }, [game.gameOver]);

  useEffect(() => {
    if (!game.gameOver) return;
    if (gameOverModalVisible) return;
    if (battleEffectQueue.length > 0 || koCrumblingUids.size > 0 || pointGainQueue.length > 0 || cardFlowQueue.length > 0 || activeCoinFlip) return;
    if (gameOverRevealTimeoutRef.current !== null) return;

    gameOverRevealTimeoutRef.current = window.setTimeout(() => {
      setGameOverModalVisible(true);
      gameOverRevealTimeoutRef.current = null;
    }, GAME_OVER_REVEAL_DELAY_MS);

    return () => {
      if (gameOverRevealTimeoutRef.current !== null) {
        window.clearTimeout(gameOverRevealTimeoutRef.current);
        gameOverRevealTimeoutRef.current = null;
      }
    };
  }, [activeCoinFlip, battleEffectQueue.length, cardFlowQueue.length, game.gameOver, gameOverModalVisible, koCrumblingUids.size, pointGainQueue.length]);

  const resetTransientMatchUi = () => {
    previousLogRef.current = [];
    resetCardFlowTracking();
    queuedVisualActionsRef.current = [];
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setAcknowledgedCoinLogMessage(null);
    setPendingCoinAttack(null);
    setCardFlowQueue([]);
    setOpeningHandDeferredRevealCardIds([]);
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
    resetBattleVisuals();
    setGameOverModalVisible(false);
    if (gameOverRevealTimeoutRef.current !== null) {
      window.clearTimeout(gameOverRevealTimeoutRef.current);
      gameOverRevealTimeoutRef.current = null;
    }
    skipNextCoinLogMessageRef.current = null;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setEndTurnWarningActions(null);
    setPreviewTarget(null);
    setSuppressEndTurnWarningForGame(false);
    setActionNotice(null);
    setDiscardOpen(false);
    setMenuOpen(false);
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  };

  const {
    pvpRole,
    pvpStatusDetail,
    pvpLocalSignal,
    pvpRemoteSignal,
    pvpConnected,
    pvpTimerNowMs,
    isPvpHost,
    submitPlayerIntent,
    syncToGuest,
    setPvpRoleAndReset,
    createOffer,
    joinWithOffer,
    copyLocalSignal,
    clearPvp,
    setPvpRemoteSignal,
  } = usePvpMatch({
    game,
    screen,
    matchMode,
    equippedDeckCardIds: equippedDeck.cardIds,
    equippedDeckEnergyTypes: getDeckEnergyTypes(equippedDeck),
    playerName: localPlayerName,
    resetTransientMatchUi,
    setGame,
    setMatchMode,
    setScreen,
    setPendingScreen,
  });
  const {
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
    setupDragHandIndexByUid,
    abilityReadyUmamusumeUids,
    stadiumAbilityReady,
  } = useMatchDerivedState({
    game: displayGame,
    player: displayPlayer,
    isNetworkMatch,
    timerNowMs: pvpTimerNowMs,
    pendingSelection,
    setupActiveIndex,
    setupBenchIndexes,
    endTurnWarningActions,
    activeCoinFlip,
    coinFlipQueue,
    acknowledgedCoinLogMessage,
  });
  const { resetCardFlowTracking, showShuffleReveal, handleCardFlowDone } = useCardFlowVisuals({
    game,
    isAiVsAi,
    displayPerspective,
    isCoinFlipBlocking,
    selectedSleeveImage: selectedSleeve.image,
    opponentSleeveImage: opponentSleeve.image,
    setCardFlowQueue,
    setOpeningHandDeferredRevealCardIds,
    openingHandDeferredRevealTimeoutRef,
    shouldDealOpeningHandsAfterFlowRef,
    setGame,
    isPvpHost,
    syncToGuest,
  });
  const isSetupCountdownActive = game.phase === "setup"
    && Boolean(game.setup?.readyBySide.player)
    && Boolean(game.setup?.readyBySide.opponent)
    && game.setup?.countdownSecondsRemaining !== null;

  const {
    applySetupActive,
    promoteSetupBenchToActive,
    applySetupBench,
  } = useSetupActions({
    playerHand: player.hand,
    setupActiveIndex,
    setupBenchIndexes,
    isTurnFlowBlocked: isTurnFlowBlocked || isSetupCountdownActive,
    setSetupActiveIndex,
    setSetupBenchIndexes,
  });
  const {
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
  } = useAppNavigation({
    screen,
    pendingScreen,
    matchMode,
    equippedDeckCardIds: equippedDeck.cardIds,
    equippedDeckEnergyTypes: getDeckEnergyTypes(equippedDeck),
    playerName: localPlayerName,
    hasPendingPlayerChoice: hasLocalPendingChoice,
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
    setCardFlowQueue,
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
    openingHandAnimationKeyRef,
    shouldDealOpeningHandsAfterFlowRef,
    submitPlayerIntent,
  });
  const returnToPvpLobbyForRematch = () => {
    resetTransientMatchUi();
    clearPvp();
    setMatchMode("playerVsPlayer");
    navigateToScreen("pvpLobby");
  };

  const {
    adjustRetreatDiscard,
    confirmRetreatDiscard,
    handleEndTurn,
    applyPlayerGameUpdate,
  } = useMatchUiActions({
    game,
    player,
    isAiVsAi,
    isTurnFlowBlocked,
    isBusyWithChoice,
    suppressEndTurnWarningForGame,
    setGame,
    setPendingSelection,
    setEndTurnWarningActions,
    submitPlayerIntent,
  });
  const {
    onOpenDiscard,
    onCloseDiscard,
    onDiscardInspect,
    onEndTurnWarningCancel,
    onEndTurnWarningConfirm,
    onDeckScoutClose,
    onActionNoticeClose,
    onSelectionCancel,
    onPlayAgain,
  } = useMatchModalActions({
    isAiVsAi,
    isNetworkMatch,
    pendingSelection,
    hasPendingPlayerChoice: hasLocalPendingChoice,
    startNewGame: async () => {
      // Fade out/in when starting a new local match.
      setScreenFadeOverlayOpacity(1);
      await delay(SCREEN_FADE_MS);
      startNewGame();
      window.requestAnimationFrame(() => setScreenFadeOverlayOpacity(0));
    },
    navigateToScreen,
    cancelPendingSelection,
    setDiscardOpen,
    setEndTurnWarningActions,
    setPreviewTarget,
    setPendingSelection,
    setActionNotice,
    submitPlayerIntent,
  });
  const onOpenPlayerDiscard = () => {
    setDiscardViewSide("player");
    onOpenDiscard();
  };
  const onOpenOpponentDiscard = () => {
    setDiscardViewSide("opponent");
    setOpponentZonesOpen(false);
    setDiscardOpen(true);
  };
  const onOpenOpponentZones = () => {
    setMenuOpen(false);
    setOpponentZonesOpen(true);
  };
  const onChooseAttackShuffleSelf = (shouldShuffle: boolean) => {
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
  };

  const advanceSetupCountdown = () => {
    setGame((current) => {
      const next = tickSetupCountdown(current);
      if (isPvpHost) syncToGuest(next);
      return next;
    });
  };

  const handleChooseOpeningCoin = (choice: CoinFlipResult) => {
    setOpeningCoinChoicePending(true);
    setGame((current) => {
      const next = chooseOpeningCoin(current, choice);
      if (isPvpHost) syncToGuest(next);
      return next;
    });
  };

  useEffect(() => {
    if (game.phase !== "setup") {
      setOpeningCoinChoicePending(false);
      return;
    }
    if (!game.setup?.coinChoice) {
      setOpeningCoinChoicePending(false);
      return;
    }
    if (game.setup.coinFlipResult || activeCoinFlip) setOpeningCoinChoicePending(false);
  }, [activeCoinFlip, game.phase, game.setup?.coinChoice, game.setup?.coinFlipResult]);

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
        group: "drawn",
        enterFrom: "leftDeck",
        exitTo: "bottomCenter",
      })),
    ]);
  }, [cardFlowQueue.length, game.phase, game.setup, isCoinFlipBlocking]);

  useAppRuntimeEffects({
    game,
    player,
    isAiVsAi,
    isNetworkMatch,
    shouldDriveSetupCountdown: !isNetworkMatch || isPvpHost,
    advanceSetupCountdown,
    isTurnFlowBlocked: isTurnFlowBlocked || visualFlowBlocked,
    isBattleAnimationBlocking: visualFlowBlocked || Boolean(activeCoinFlip),
    isCoinFlipBlocking,
    hiddenOpponent,
    equippedDeckId: equippedDeck.id,
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
  });
  const handleEscapeFromPvpLobby = () => {
    if (pvpRole) {
      clearPvp();
      return;
    }
    clearPvp();
    navigateToScreen("modeSelect");
  };

  useEscapeHotkey({
    screen,
    gameOver: game.gameOver,
    hasPendingPlayerChoice: hasLocalPendingChoice,
    isTurnFlowBlocked: isTurnFlowBlocked || visualFlowBlocked,
    endTurnWarningActions,
    previewTarget,
    discardOpen,
    opponentZonesOpen,
    pendingSelection,
    actionNotice,
    menuOpen,
    navigateToScreen,
    onEscapeFromPvpLobby: handleEscapeFromPvpLobby,
    setEndTurnWarningActions,
    setPreviewTarget,
    setDiscardOpen,
    setOpponentZonesOpen,
    setPendingSelection,
    setActionNotice,
    setMenuOpen,
    isBottomActionNotice,
  });

  useLogNotifications({
    gameLog: game.log,
    actionNotice,
    activeCoinFlip,
    previousLogRef,
    coinFlipIdRef,
    skipNextCoinLogMessageRef,
    setActionNotice,
    setCoinFlipQueue,
    setActiveCoinFlip,
    setAcknowledgedCoinLogMessage,
    toCoinFlipEvent,
    getNewLogEntries,
    getKoCauseFromEntries,
    formatKoActionNotice,
  });
  const {
    playHandCardOnCenter,
    playHandCardOnStadiumSpot,
    playHandCardOnUmamusume,
    playHandCardOnBenchSlot,
    attachEnergyByDrop,
    moveAbilityEnergyByDrop,
    chooseHandCard,
    chooseScoutDeckCard,
    selectUmamusume,
    selectStadiumForTrainerTarget,
    selectAttachedToolForTrainerTarget,
    handleSetupReady,
  } = useMatchActions({
    game,
    player,
    isAiVsAi,
    pendingSelection,
    activePendingSelection,
    selectableHandIndexes,
    isTurnFlowBlocked,
    setupActiveIndex,
    setupBenchIndexes,
    coinFlipIdRef,
    setGame,
    setPendingSelection,
    setPreviewTarget,
    setPendingCoinAttack,
    setActiveCoinFlip,
    applyPlayerGameUpdate,
    getPendingAttackCoinFlip,
    submitPlayerIntent,
    isNetworkMatch,
    showShuffleReveal,
    onRevealOpponentHandSnapshot: (cardIds) => {
      setRevealedOpponentHandCardIds(cardIds);
      setRevealedOpponentHandOpen(true);
    },
  });
  const queueVisualAction = (action: () => void) => {
    if (visualFlowBlocked) {
      queuedVisualActionsRef.current.push(action);
      return;
    }
    action();
  };
  useEffect(() => {
    if (visualFlowBlocked || queuedVisualActionsRef.current.length === 0) return;
    const queuedActions = queuedVisualActionsRef.current;
    queuedVisualActionsRef.current = [];
    queuedActions.forEach((action) => action());
  }, [visualFlowBlocked]);
  const queuedPlayHandCardOnCenter = (handIndex: number) => queueVisualAction(() => playHandCardOnCenter(handIndex));
  const queuedPlayHandCardOnStadiumSpot = (handIndex: number) => queueVisualAction(() => playHandCardOnStadiumSpot(handIndex));
  const queuedPlayHandCardOnUmamusume = (handIndex: number, umamusumeUid: number) => queueVisualAction(() => playHandCardOnUmamusume(handIndex, umamusumeUid));
  const queuedPlayHandCardOnBenchSlot = (handIndex: number) => queueVisualAction(() => playHandCardOnBenchSlot(handIndex));
  const queuedAttachEnergyByDrop = (umamusumeUid: number) => queueVisualAction(() => attachEnergyByDrop(umamusumeUid));
  const queuedMoveAbilityEnergyByDrop = (sourceUmamusumeUid: number, energyType: EnergyType) => queueVisualAction(() => moveAbilityEnergyByDrop(sourceUmamusumeUid, energyType));
  const queuedChooseHandCard = (handIndex: number) => queueVisualAction(() => chooseHandCard(handIndex));
  const queuedSelectUmamusume = (umamusume: UmamusumeInstance) => queueVisualAction(() => selectUmamusume(umamusume));
  const queuedSelectStadiumForTrainerTarget = () => queueVisualAction(selectStadiumForTrainerTarget);
  const queuedSelectAttachedToolForTrainerTarget = (umamusumeUid: number) => queueVisualAction(() => selectAttachedToolForTrainerTarget(umamusumeUid));
  const cardPreviewActions = useCardPreviewActions({
    game,
    player,
    previewTarget,
    isTurnFlowBlocked: isTurnFlowBlocked || visualFlowBlocked,
    coinFlipIdRef,
    setGame,
    setPendingSelection,
    setPreviewTarget,
    setPendingCoinAttack,
    setActiveCoinFlip,
    applyPlayerGameUpdate,
    getPendingAttackCoinFlip,
    submitPlayerIntent,
    isNetworkMatch,
    showShuffleReveal,
  });
  const { handleCoinFlipContinue } = useCoinFlipResolution({
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
  });
  const canAttachInHeader = !isAiVsAi && canAttachEnergy(game, player) && !isBusyWithChoice && !visualFlowBlocked;
  const canEndTurnInHeader = !isAiVsAi && !game.gameOver && game.currentSide === "player" && !isBusyWithChoice && !visualFlowBlocked;
  const hasLocalSetupReady = game.phase === "setup" ? (game.setup?.readyBySide.player ?? false) : false;
  const openingHandsDealt = game.phase === "setup" ? (game.setup?.openingHandsDealt ?? false) : true;
  const canChooseOpeningCoin = game.phase === "setup"
    && !game.setup?.coinFlipResult
    && !isAiVsAi
    && (!isNetworkMatch || isPvpHost);
  const canSetupReady = !isAiVsAi && openingHandsDealt && !hasLocalSetupReady && !isSetupCountdownActive;
  const canSurrenderInPanels = !game.gameOver && !isTurnFlowBlocked;
  const playerExtraEnergyCount = Math.max(0, displayPlayer.energyZone.length - 1);
  const topBanner = getTopActionBanner(game);
  const displayTopBanner = topBanner
    ? {
        ...topBanner,
        title: formatMatchText(topBanner.title),
        message: formatMatchText(topBanner.message),
      }
    : null;
  const canShowSelectionPrompt = Boolean(activePendingSelection) && canShowSelectionPromptBase;
  const pvpSecondsRemaining = game.turnDeadlineMs === null
    ? 30
    : Math.max(0, Math.ceil((game.turnDeadlineMs - pvpTimerNowMs) / 1000));
  const turnLabel = isNetworkMatch && game.phase === "play"
    ? `Turn ${game.turnNumber} • ${pvpSecondsRemaining}s`
    : isAiVsAi && game.phase === "play"
      ? `Turn ${game.turnNumber} • ${game.currentSide === displayPerspective ? "Your turn" : "Opponent's turn"}`
      : undefined;
  const turnAlert = isNetworkMatch && game.phase === "play" && game.currentSide === "player";
  const switchPov = isAiVsAi
    ? () => {
        setPovSwitchAnimationToken((current) => current + 1);
        setAiPerspective((current) => (current === "player" ? "opponent" : "player"));
      }
    : undefined;
  const displayPlayerSleeveImage = isAiVsAi && displayPerspective === "opponent" ? opponentSleeve.image : selectedSleeve.image;
  const displayOpponentSleeveImage = isAiVsAi && displayPerspective === "opponent" ? selectedSleeve.image : opponentSleeve.image;
  const deferredHandRevealCardIds = (cardFlowQueue[0] ?? [])
    .filter((item) => item.group === "drawn" && item.exitTo === "bottomCenter")
    .map((item) => item.cardId)
    .concat(openingHandDeferredRevealCardIds);
  const isPlayPhase = game.phase === "play";
  if (isPlayPhase && game.currentSide !== "done") {
    lastVisiblePlaymatSideRef.current = game.currentSide;
  }
  const playmatSide: SideId = isPlayPhase && game.currentSide === "done"
    ? lastVisiblePlaymatSideRef.current
    : game.currentSide === "opponent"
      ? "opponent"
      : "player";
  const showSelectedPlaymat = isPlayPhase
    ? playmatSide === "player"
    : displayPerspective === "player";
  const showOpponentPlaymat = isPlayPhase
    ? playmatSide === "opponent" && !suppressOpponentPlaymatLayer
    : displayPerspective === "opponent";

  const nonMatchScreen = renderNonMatchScreen({
    screen,
    selectedPlaymatImage: selectedPlaymat.image,
    uiTextTone,
    screenFadeOverlayOpacity,
    equippedDeck,
    account: firebaseAccount,
    accountBusy,
    customisation,
    navigateToScreen,
    setEquippedDeckId,
    setCustomisation,
    startWithMode,
    playEquippedDeck,
    linkGoogleAccount,
    logoutAccount,
    quitApp,
    pvpRole,
    pvpStatusDetail,
    pvpLocalSignal,
    pvpRemoteSignal,
    pvpConnected,
    onPvpSetRole: setPvpRoleAndReset,
    onPvpCreateOffer: createOffer,
    onPvpJoinWithOffer: joinWithOffer,
    onPvpRemoteSignalChange: setPvpRemoteSignal,
    onPvpCopyLocalSignal: copyLocalSignal,
    onPvpClear: clearPvp,
  });
  if (nonMatchScreen) return nonMatchScreen;

  const matchFallback = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
        color: "var(--ui-text-color)",
        textShadow: "var(--ui-text-shadow)",
        fontSize: "0.85rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        background: "rgba(7, 12, 16, 0.35)",
        pointerEvents: "none",
      }}
    >
      Loading match...
    </div>
  );

  return (
    <main style={appStyle(false, undefined, uiTextTone)}>
      <div style={matchBackgroundLayerStyle(selectedPlaymat.image, showSelectedPlaymat ? 1 : 0)} />
      <div style={matchBackgroundLayerStyle(opponentPlaymat.image, showOpponentPlaymat ? 1 : 0, suppressOpponentPlaymatLayer)} />
      <Suspense fallback={matchFallback}>
        <MatchBoardLayout
          game={displayGame}
          displayedPlayerSide={displayedPlayerSide}
          displayedOpponentSide={displayedOpponentSide}
          hiddenOpponent={hiddenOpponent}
          opponentBoardHidden={opponentBoardHidden}
          opponentSetupRevealToken={opponentSetupRevealToken}
          povSwitchAnimationToken={povSwitchAnimationToken}
          hiddenOpponentBenchCount={hiddenOpponentBenchCount}
          abilityReadyUmamusumeUids={abilityReadyUmamusumeUids}
          playerSelectableUmamusumeUids={playerSelectableUmamusumeUids}
          opponentSelectableUmamusumeUids={opponentSelectableUmamusumeUids}
          abilityEnergyTypes={abilityEnergyTypes}
          setupDragHandIndexByUid={setupDragHandIndexByUid}
          onInspect={openPreview}
          onUmamusumeSelect={queuedSelectUmamusume}
          onAttachedToolSelect={pendingSelection?.kind === "masterCleatHammerTarget" ? queuedSelectAttachedToolForTrainerTarget : undefined}
          onSetupDropActive={applySetupActive}
          onSetupDropBench={applySetupBench}
          onSetupPromoteToActive={promoteSetupBenchToActive}
          onHandCardDropOnUmamusume={queuedPlayHandCardOnUmamusume}
          onHandCardDropOnBenchSlot={queuedPlayHandCardOnBenchSlot}
          onEnergyDropOnUmamusume={queuedAttachEnergyByDrop}
          onAbilityEnergyDropOnActive={queuedMoveAbilityEnergyByDrop}
          opponentSleeveImage={displayOpponentSleeveImage}
          stadiumAbilityReady={stadiumAbilityReady}
          onDropHandCardOnStadium={queuedPlayHandCardOnStadiumSpot}
          onSelectStadiumTarget={queuedSelectStadiumForTrainerTarget}
          stadiumSelectable={pendingSelection?.kind === "masterCleatHammerTarget"}
          onDropHandCardOnCenter={queuedPlayHandCardOnCenter}
          setupActiveIndex={setupActiveIndex}
          setupBenchIndexes={setupBenchIndexes}
          menuOpen={menuOpen}
          canSurrender={canSurrenderInPanels}
          onToggleMenu={toggleMenu}
          onSurrender={handleSurrender}
          onSetupReady={handleSetupReady}
          canSetupReady={canSetupReady}
          canSetupInteract={openingHandsDealt && !isSetupCountdownActive}
          onSwitchPov={switchPov}
          selectedSleeveImage={displayPlayerSleeveImage}
          canPlayHandCards={
            !isAiVsAi
            && displayGame.phase === "play"
            && !displayGame.gameOver
            && !displayGame.pendingPlayerChoice
            && displayGame.currentSide === "player"
            && !isTurnFlowBlocked
          }
          handDrawRevealEnabled={cardFlowQueue.length === 0}
          handDeferredRevealCardIds={deferredHandRevealCardIds}
          canAttach={canAttachInHeader}
          nextPlayerEnergy={nextPlayerEnergy}
          playerExtraEnergyCount={playerExtraEnergyCount}
          canEndTurn={canEndTurnInHeader}
          turnLabel={turnLabel}
          turnAlert={turnAlert}
          onEndTurn={handleEndTurn}
          selectableHandIndexes={selectableHandIndexes}
          onChooseHandCard={queuedChooseHandCard}
          onOpenDiscard={onOpenPlayerDiscard}
          onOpenOpponentZones={onOpenOpponentZones}
          displayLog={displayLog}
          visualHpByUid={visualHpByUid}
          visualAttachedEnergyByUid={visualAttachedEnergyByUid}
          koAnimatingUids={koAnimatingUids}
          suppressActiveReplacementBySide={suppressActiveReplacementBySide}
          activeKoImpactUidBySide={activeKoImpactUidBySide}
          activeKoAnimatingUidBySide={activeKoAnimatingUidBySide}
          visualScorePointsBySide={visualScorePointsBySide}
          scorePointGainAnimatingBySide={scorePointGainAnimatingBySide}
        />
        <MatchOverlays
          displayTopBanner={displayTopBanner}
          canShowBattleEffects={canShowBattleEffects}
          activeBattleEffects={activeBattleEffects}
          completeBattleEffect={completeBattleEffect}
          pointGainQueue={pointGainQueue}
          completePointGain={completePointGain}
          game={game}
          openingCoinChoicePending={openingCoinChoicePending}
          activeCoinFlip={activeCoinFlip}
          isAiVsAi={isAiVsAi}
          canChooseOpeningCoin={canChooseOpeningCoin}
          handleChooseOpeningCoin={handleChooseOpeningCoin}
          formatMatchText={formatMatchText}
          handleCoinFlipContinue={handleCoinFlipContinue}
          canShowCardFlowOverlay={canShowCardFlowOverlay}
          cardFlowQueue={cardFlowQueue}
          onCardFlowDone={handleCardFlowDone}
          canShowSelectionPrompt={canShowSelectionPrompt}
          activePendingSelection={activePendingSelection}
          onSelectionCancel={onSelectionCancel}
          onChooseAttackShuffleSelf={onChooseAttackShuffleSelf}
          nextPlayerEnergy={nextPlayerEnergy}
          adjustRetreatDiscard={adjustRetreatDiscard}
          confirmRetreatDiscard={confirmRetreatDiscard}
          displayGame={displayGame}
          previewTarget={previewTarget}
          cardPreviewActions={cardPreviewActions}
          openPreview={openPreview}
          closePreview={closePreview}
          endTurnWarningActions={endTurnWarningActions}
          suppressEndTurnWarningForGame={suppressEndTurnWarningForGame}
          setSuppressEndTurnWarningForGame={setSuppressEndTurnWarningForGame}
          onEndTurnWarningCancel={onEndTurnWarningCancel}
          onEndTurnWarningConfirm={onEndTurnWarningConfirm}
          discardOpen={discardOpen}
          discardViewSide={discardViewSide}
          onDiscardInspect={onDiscardInspect}
          onCloseDiscard={onCloseDiscard}
          revealedOpponentHandOpen={revealedOpponentHandOpen}
          revealedOpponentHandCardIds={revealedOpponentHandCardIds}
          setPreviewTarget={setPreviewTarget}
          setRevealedOpponentHandOpen={setRevealedOpponentHandOpen}
          opponentZonesOpen={opponentZonesOpen}
          onOpenOpponentDiscard={onOpenOpponentDiscard}
          setOpponentZonesOpen={setOpponentZonesOpen}
          pendingSelection={pendingSelection}
          player={player}
          chooseScoutDeckCard={chooseScoutDeckCard}
          onDeckScoutClose={onDeckScoutClose}
          actionNotice={actionNotice}
          onActionNoticeClose={onActionNoticeClose}
          gameOverModalVisible={gameOverModalVisible}
          isNetworkMatch={isNetworkMatch}
          returnToPvpLobbyForRematch={returnToPvpLobbyForRematch}
          onPlayAgain={onPlayAgain}
          returnToMainMenu={returnToMainMenu}
        />
      </Suspense>
      <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      {showAiTelemetryPanel && <AiTelemetryPanel />}
    </main>
  );
}
