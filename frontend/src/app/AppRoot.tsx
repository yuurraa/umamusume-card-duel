import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  canAttachEnergy,
  chooseOpeningCoin,
  createGame,
  dealOpeningHands,
  getCard,
  opponentAbandonedMatch,
  tickSetupCountdown,
  timeoutEndTurn,
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
  getActionNoticeTone,
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
import { applyPlayerIntent, type PlayerIntent } from "../pvp/playerIntent";
import { createGuestSyncState, mirrorGameState, mirrorGameStateForGuest } from "../pvp/stateMirror";
import { DEFAULT_ICE_SERVERS, PeerRuntime } from "../pvp/peer";
import type { PvpWireMessage } from "../pvp/protocol";
import type { PvpRole } from "../screens/PvpLobbyScreen";
import {
  createPvpSession,
  getPvpAnswer,
  getPvpCandidates,
  getPvpOffer,
  getPvpRtcConfig,
  submitPvpAnswer,
  submitPvpCandidates,
} from "../pvp/signalApi";
import { getFirebaseAccountSnapshot, linkFirebaseAccountWithGoogle, signOutFirebaseAccount, type FirebaseAccountSnapshot } from "../utils/firebaseAuth";
import { getAccountPlayerName } from "../utils/playerNames";
import type { CoinFlipResult, EnergyType, GameState, SideId, SideState } from "../../../shared/src/types";

const EMPTY_FIREBASE_ACCOUNT: FirebaseAccountSnapshot = {
  configured: false,
  localId: null,
  displayName: null,
  email: null,
  photoUrl: null,
  isGoogleLinked: false,
};

const TURN_RELAY_UNAVAILABLE_TEXT = "TURN relay candidate was not available.";

const MatchBoardLayout = lazy(() => import("./MatchBoardLayout").then((module) => ({
  default: module.MatchBoardLayout,
})));
const CardPreview = lazy(() => import("../match/modals/CardPreview").then((module) => ({
  default: module.CardPreview,
})));
const DiscardPileModal = lazy(() => import("../match/modals/DiscardPileModal").then((module) => ({
  default: module.DiscardPileModal,
})));
const DeckChoiceModal = lazy(() => import("../match/modals/DeckChoiceModal").then((module) => ({
  default: module.DeckChoiceModal,
})));
const GameOverModal = lazy(() => import("../match/modals/GameOverModal").then((module) => ({
  default: module.GameOverModal,
})));
const EndTurnWarningModal = lazy(() => import("../match/modals/EndTurnWarningModal").then((module) => ({
  default: module.EndTurnWarningModal,
})));
const SelectionPrompt = lazy(() => import("../match/controls/SelectionPrompt").then((module) => ({
  default: module.SelectionPrompt,
})));
const OpponentActionBanner = lazy(() => import("../match/feedback/OpponentActionBanner").then((module) => ({
  default: module.OpponentActionBanner,
})));
const ActionNotice = lazy(() => import("../match/feedback/ActionNotice").then((module) => ({
  default: module.ActionNotice,
})));
const CoinFlipOverlay = lazy(() => import("../match/feedback/CoinFlipOverlay").then((module) => ({
  default: module.CoinFlipOverlay,
})));
const CardFlowOverlay = lazy(() => import("../match/feedback/CardFlowOverlay").then((module) => ({
  default: module.CardFlowOverlay,
})));

function isTurnRelayUnavailableError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes(TURN_RELAY_UNAVAILABLE_TEXT);
}

function hasStunUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.startsWith("stun:"));
}

function toStunFallbackRtcConfig(config: RTCConfiguration | null): RTCConfiguration | null {
  if (!config || config.iceTransportPolicy !== "relay") return null;
  if (!config.iceServers?.some(hasStunUrl)) return null;
  return { ...config, iceTransportPolicy: "all" };
}

function firstCardMoved(fromBefore: string[], fromAfter: string[], toBefore: string[], toAfter: string[]): string | null {
  return allCardsMoved(fromBefore, fromAfter, toBefore, toAfter)[0] ?? null;
}

function subtractCardLists(source: string[], minus: string[]): string[] {
  const minusCounts = new Map<string, number>();
  for (const cardId of minus) minusCounts.set(cardId, (minusCounts.get(cardId) ?? 0) + 1);
  const result: string[] = [];
  for (const cardId of source) {
    const remaining = minusCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      minusCounts.set(cardId, remaining - 1);
      continue;
    }
    result.push(cardId);
  }
  return result;
}

function allCardsMoved(fromBefore: string[], fromAfter: string[], toBefore: string[], toAfter: string[]): string[] {
  const removed = subtractCardLists(fromBefore, fromAfter);
  if (removed.length === 0) return [];
  const added = subtractCardLists(toAfter, toBefore);
  if (added.length === 0) return [];
  const addedCounts = new Map<string, number>();
  for (const cardId of added) addedCounts.set(cardId, (addedCounts.get(cardId) ?? 0) + 1);
  const moved: string[] = [];
  for (const cardId of removed) {
    const remaining = addedCounts.get(cardId) ?? 0;
    if (remaining <= 0) continue;
    moved.push(cardId);
    addedCounts.set(cardId, remaining - 1);
  }
  return moved;
}

function getNewLogHeadEntries(previousLog: string[], currentLog: string[]): string[] {
  if (previousLog.length === 0) return currentLog;
  for (let start = 0; start < currentLog.length; start += 1) {
    const overlap = Math.min(previousLog.length, currentLog.length - start);
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (currentLog[start + index] !== previousLog[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return currentLog.slice(0, start);
  }
  return currentLog;
}

function hasPlayLogEntry(previousLog: string[], currentLog: string[], cardName: string): boolean {
  const newEntries = getNewLogHeadEntries(previousLog, currentLog);
  return newEntries.some((entry) => entry.includes(`played ${cardName}.`));
}

function getShuffleHandDrawCount(previousLog: string[], currentLog: string[], sideId: SideId): number | null {
  const actor = sideId === "player" ? "You" : "Opponent";
  const newEntries = getNewLogHeadEntries(previousLog, currentLog);
  const entry = newEntries.find((line) => line.startsWith(`${actor} used `) && line.includes(" shuffled ") && line.includes(" and drew "));
  if (!entry) return null;
  const match = entry.match(/ and drew (\d+) cards?\./);
  if (!match?.[1]) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function tryGetCardName(cardId: string): string | null {
  try {
    return getCard(cardId).name;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [pendingScreen, setPendingScreen] = useState<AppScreen | null>(null);
  const [screenFadeOverlayOpacity, setScreenFadeOverlayOpacity] = useState(0);
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
  const [matchMode, setMatchMode] = useState<MatchMode>("playerVsAi");
  const [aiPerspective, setAiPerspective] = useState<SideId>("player");
  const [pvpRole, setPvpRole] = useState<PvpRole | null>(null);
  const [pvpStatusDetail, setPvpStatusDetail] = useState("Pick Host or Join to begin.");
  const [pvpLocalSignal, setPvpLocalSignal] = useState("");
  const [pvpRemoteSignal, setPvpRemoteSignal] = useState("");
  const [pvpConnected, setPvpConnected] = useState(false);
  const [firebaseAccount, setFirebaseAccount] = useState<FirebaseAccountSnapshot>(EMPTY_FIREBASE_ACCOUNT);
  const [accountBusy, setAccountBusy] = useState(false);
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
  const [coinFlipQueue, setCoinFlipQueue] = useState<CoinFlipEvent[]>([]);
  const [activeCoinFlip, setActiveCoinFlip] = useState<CoinFlipEvent | null>(null);
  const [acknowledgedCoinLogMessage, setAcknowledgedCoinLogMessage] = useState<string | null>(null);
  const [pendingCoinAttack, setPendingCoinAttack] = useState<PendingCoinAttack | null>(null);
  const [cardFlowQueue, setCardFlowQueue] = useState<CardFlowItem[][]>([]);
  const [openingCoinChoicePending, setOpeningCoinChoicePending] = useState(false);
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opponentSetupRevealToken, setOpponentSetupRevealToken] = useState(0);
  const [povSwitchAnimationToken, setPovSwitchAnimationToken] = useState(0);
  const [pvpTimerNowMs, setPvpTimerNowMs] = useState(() => Date.now());
  const [suppressOpponentPlaymatLayer, setSuppressOpponentPlaymatLayer] = useState(true);
  const pvpDeadlineTurnKeyRef = useRef<string | null>(null);
  const previousLogRef = useRef<string[]>([]);
  const previousPlayerZonesRef = useRef<{
    player: { hand: string[]; deck: string[]; discard: string[] };
    opponent: { hand: string[]; deck: string[]; discard: string[] };
    currentSide: GameState["currentSide"];
    turnNumber: number;
    phase: GameState["phase"];
    log: string[];
  } | null>(null);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
  const openingHandAnimationKeyRef = useRef<string | null>(null);
  const shouldDealOpeningHandsAfterFlowRef = useRef(false);
  const skipNextCoinLogMessageRef = useRef<string | null>(null);
  const pvpPeerRef = useRef<PeerRuntime | null>(null);
  const pvpRtcConfigRef = useRef<RTCConfiguration | null>(null);
  const pvpAnswerPollTokenRef = useRef(0);
  const pvpHelloAckRef = useRef(false);
  const pvpLocalCloseIntentRef = useRef(false);
  const pvpCandidatePollTokenRef = useRef(0);
  const pvpCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const pvpCandidateFlushTimeoutRef = useRef<number | null>(null);
  const pvpActiveCodeRef = useRef<string | null>(null);
  const pvpRoleRef = useRef<PvpRole | null>(null);
  const matchModeRef = useRef<MatchMode>("playerVsAi");
  const screenRef = useRef<AppScreen>("mainMenu");
  const gameRef = useRef(game);
  const equippedDeckCardIdsRef = useRef<string[]>([]);
  const equippedDeckEnergyTypesRef = useRef<EnergyType[]>([]);
  const remoteDeckRef = useRef<string[] | null>(null);
  const remoteEnergyTypesRef = useRef<EnergyType[] | null>(null);
  const remoteNameRef = useRef<string>("Opponent");
  const equippedDeck = getDeckById(equippedDeckId);
  const selectedPlaymat = getSelectedPlaymat(customisation);
  const uiTextTone = getPlaymatTextTone(customisation);
  const selectedSleeve = getSelectedSleeve(customisation);
  const opponentPlaymat = getSelectedPlaymat(opponentCustomisation);
  const opponentSleeve = getSelectedSleeve(opponentCustomisation);
  const isAiVsAi = matchMode === "aiVsAi";
  const isNetworkMatch = matchMode === "playerVsPlayer";
  const isPvpHost = isNetworkMatch && pvpRole === "host";
  const isPvpGuest = isNetworkMatch && pvpRole === "guest";
  // During preparation we always show the player's playmat to avoid a one-frame flash
  // if the POV was previously switched in AI-vs-AI.
  const displayPerspective: SideId = isAiVsAi ? (game.phase === "setup" ? "player" : aiPerspective) : "player";
  const displayGame = isNetworkMatch ? game : toPerspectiveGame(game, displayPerspective);
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

  useEffect(() => {
    pvpRoleRef.current = pvpRole;
  }, [pvpRole]);

  useEffect(() => {
    matchModeRef.current = matchMode;
  }, [matchMode]);

  useEffect(() => {
    let active = true;
    void getFirebaseAccountSnapshot()
      .then((snapshot) => {
        if (active) setFirebaseAccount(snapshot);
      })
      .catch(() => {
        if (active) setFirebaseAccount(EMPTY_FIREBASE_ACCOUNT);
      });
    return () => {
      active = false;
    };
  }, []);

  const linkGoogleAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      setFirebaseAccount(await linkFirebaseAccountWithGoogle());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Failed to link Google account.");
    } finally {
      setAccountBusy(false);
    }
  };

  const logoutAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      setFirebaseAccount(await signOutFirebaseAccount());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Failed to log out.");
    } finally {
      setAccountBusy(false);
    }
  };

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    // Prevent a one-frame flash of the opponent playmat when entering the match screen
    // while the game state is being replaced (e.g. starting a new game).
    if (screen !== "match") {
      setSuppressOpponentPlaymatLayer(true);
      return;
    }
    setSuppressOpponentPlaymatLayer(true);
  }, [screen]);

  useEffect(() => {
    if (screen !== "match") return;
    if (game.phase === "setup") setSuppressOpponentPlaymatLayer(true);
    if (game.phase === "play") setSuppressOpponentPlaymatLayer(false);
  }, [game.phase, screen]);

  useEffect(() => {
    if (!game.gameOver) return;
    setCardFlowQueue([]);
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  }, [game.gameOver]);

  useEffect(() => {
    equippedDeckCardIdsRef.current = equippedDeck.cardIds;
    equippedDeckEnergyTypesRef.current = getDeckEnergyTypes(equippedDeck);
  }, [equippedDeck]);

  const resetTransientMatchUi = () => {
    previousLogRef.current = [];
    previousPlayerZonesRef.current = null;
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setAcknowledgedCoinLogMessage(null);
    setPendingCoinAttack(null);
    setCardFlowQueue([]);
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

  const syncToGuest = (state: typeof game) => {
    if (matchModeRef.current !== "playerVsPlayer" || pvpRoleRef.current !== "host") return;
    pvpPeerRef.current?.send({ type: "sync", state: createGuestSyncState(state) });
  };

  const applyIntentForHost = (intent: PlayerIntent) => {
    setGame((current) => {
      const timed = current.turnDeadlineMs !== null
        && Date.now() >= current.turnDeadlineMs
        && !current.pendingPlayerChoice
        && current.phase === "play"
        && !current.gameOver
        && current.currentSide !== "done"
        ? timeoutEndTurn(current)
        : current;
      const next = applyPlayerIntent(timed, intent);
      syncToGuest(next);
      return next;
    });
  };

  const handlePvpMessage = (message: PvpWireMessage) => {
    const currentRole = pvpRoleRef.current;
    const currentMode = matchModeRef.current;
    const currentScreen = screenRef.current;
    const isHostNow = currentMode === "playerVsPlayer" && currentRole === "host";
    const isGuestNow = currentMode === "playerVsPlayer" && currentRole === "guest";

    if (message.type === "hello") {
      if (!isHostNow) return;
      pvpPeerRef.current?.send({ type: "helloAck" });
      remoteDeckRef.current = message.deckCardIds;
      remoteEnergyTypesRef.current = message.energyTypes ?? null;
      remoteNameRef.current = message.playerName || "Opponent";
      if (currentScreen === "match") {
        syncToGuest(gameRef.current);
        return;
      }
      if (currentScreen !== "pvpLobby") return;
      resetTransientMatchUi();
      const starting = createGame(
        equippedDeckCardIdsRef.current,
        message.deckCardIds,
        remoteNameRef.current,
        "hard",
        true,
        localPlayerName,
        equippedDeckEnergyTypesRef.current,
        message.energyTypes,
      );
      gameRef.current = starting;
      setGame(starting);
      setMatchMode("playerVsPlayer");
      setScreen("match");
      setPendingScreen(null);
      syncToGuest(starting);
      return;
    }

    if (message.type === "helloAck") {
      if (!isGuestNow) return;
      pvpHelloAckRef.current = true;
      return;
    }

    if (message.type === "sync") {
      if (!isGuestNow) return;
      if (currentScreen !== "match") resetTransientMatchUi();
      setGame(mirrorGameStateForGuest(message.state));
      setMatchMode("playerVsPlayer");
      setScreen("match");
      setPendingScreen(null);
      return;
    }

    if (message.type === "intent") {
      if (!isHostNow) return;
      setGame((current) => {
        const timed = current.turnDeadlineMs !== null
          && Date.now() >= current.turnDeadlineMs
          && !current.pendingPlayerChoice
          && current.phase === "play"
          && !current.gameOver
          && current.currentSide !== "done"
          ? timeoutEndTurn(current)
          : current;
        const mirrored = mirrorGameState(timed);
        const nextMirrored = applyPlayerIntent(mirrored, message.intent);
        const canonical = mirrorGameState(nextMirrored);
        syncToGuest(canonical);
        return canonical;
      });
    }
  };

  useEffect(() => {
    if (!isNetworkMatch || game.phase !== "play" || game.gameOver) return;
    const intervalId = window.setInterval(() => setPvpTimerNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [isNetworkMatch, game.phase, game.gameOver]);

  useEffect(() => {
    if (!isNetworkMatch || !isPvpHost || game.phase !== "play" || game.gameOver) return;
    if (game.currentSide === "done") return;
    const turnKey = `${game.turnNumber}:${game.currentSide}`;
    if (pvpDeadlineTurnKeyRef.current === turnKey && game.turnDeadlineMs !== null) return;
    const deadline = Date.now() + 30_000;
    pvpDeadlineTurnKeyRef.current = turnKey;
    setGame((current) => {
      if (current.phase !== "play" || current.gameOver || current.currentSide === "done") return current;
      const currentTurnKey = `${current.turnNumber}:${current.currentSide}`;
      if (currentTurnKey !== turnKey) return current;
      const next = { ...current, turnDeadlineMs: deadline };
      syncToGuest(next);
      return next;
    });
  }, [isNetworkMatch, isPvpHost, game.phase, game.gameOver, game.currentSide, game.turnNumber, game.turnDeadlineMs]);

  useEffect(() => {
    if (!isNetworkMatch || !isPvpHost || game.phase !== "play" || game.gameOver) return;
    if (game.pendingPlayerChoice || game.currentSide === "done") return;
    const deadline = game.turnDeadlineMs;
    if (deadline === null) return;
    const delayMs = Math.max(0, deadline - Date.now());
    const timeoutId = window.setTimeout(() => {
      setGame((current) => {
        if (
          current.phase !== "play"
          || current.gameOver
          || current.pendingPlayerChoice
          || current.currentSide === "done"
          || current.turnDeadlineMs === null
          || Date.now() < current.turnDeadlineMs
        ) return current;
        const next = timeoutEndTurn(current);
        syncToGuest(next);
        return next;
      });
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [
    isNetworkMatch,
    isPvpHost,
    game.phase,
    game.gameOver,
    game.pendingPlayerChoice,
    game.currentSide,
    game.turnNumber,
    game.turnDeadlineMs,
  ]);

  const submitPlayerIntent = (intent: PlayerIntent) => {
    if (!isNetworkMatch) {
      setGame((current) => applyPlayerIntent(current, intent));
      return;
    }
    if (isPvpHost) {
      applyIntentForHost(intent);
      return;
    }
    if (isPvpGuest) {
      pvpPeerRef.current?.send({ type: "intent", intent });
    }
  };

  const loadPvpRtcConfig = async (): Promise<RTCConfiguration> => {
    if (pvpRtcConfigRef.current) return pvpRtcConfigRef.current;
    const serverConfig = await getPvpRtcConfig();
    const rtcConfig = {
      ...serverConfig,
      iceServers: serverConfig.iceServers && serverConfig.iceServers.length > 0
        ? serverConfig.iceServers
        : DEFAULT_ICE_SERVERS,
    };
    pvpRtcConfigRef.current = rtcConfig;
    return rtcConfig;
  };

  const resetCandidateSync = () => {
    pvpCandidatePollTokenRef.current += 1;
    pvpCandidateQueueRef.current = [];
    pvpActiveCodeRef.current = null;
    if (pvpCandidateFlushTimeoutRef.current !== null) {
      window.clearTimeout(pvpCandidateFlushTimeoutRef.current);
      pvpCandidateFlushTimeoutRef.current = null;
    }
  };

  const flushLocalCandidates = async () => {
    const code = pvpActiveCodeRef.current;
    const role = pvpRoleRef.current;
    if (!code || !role) return;
    const batch = pvpCandidateQueueRef.current.splice(0);
    if (batch.length === 0) return;
    try {
      await submitPvpCandidates(code, role, batch);
    } catch {
      pvpCandidateQueueRef.current = batch.concat(pvpCandidateQueueRef.current);
      if (pvpCandidateFlushTimeoutRef.current === null) {
        pvpCandidateFlushTimeoutRef.current = window.setTimeout(() => {
          pvpCandidateFlushTimeoutRef.current = null;
          void flushLocalCandidates();
        }, 800);
      }
    }
  };

  const scheduleCandidateFlush = () => {
    if (pvpCandidateFlushTimeoutRef.current !== null) return;
    pvpCandidateFlushTimeoutRef.current = window.setTimeout(() => {
      pvpCandidateFlushTimeoutRef.current = null;
      void flushLocalCandidates();
    }, 200);
  };

  const enqueueLocalCandidate = (candidate: RTCIceCandidateInit) => {
    pvpCandidateQueueRef.current.push(candidate);
    if (pvpActiveCodeRef.current) scheduleCandidateFlush();
  };

  const startCandidatePolling = (code: string, role: PvpRole, runtime: PeerRuntime) => {
    const token = ++pvpCandidatePollTokenRef.current;
    void (async () => {
      let since = 0;
      while (pvpCandidatePollTokenRef.current === token && pvpPeerRef.current === runtime) {
        try {
          const result = await getPvpCandidates(code, role, since);
          since = result.nextSince;
          for (const candidate of result.candidates) {
            await runtime.addRemoteCandidate(candidate);
          }
        } catch {
          // Ignore transient candidate polling failures.
        }
        if (runtime.isConnected()) {
          await delay(800);
          if (runtime.isConnected()) return;
        }
        await delay(400);
      }
    })();
  };

  const ensurePeerRuntime = async () => {
    if (pvpPeerRef.current) return pvpPeerRef.current;
    const rtcConfig = await loadPvpRtcConfig();
    const runtime = new PeerRuntime({
      rtcConfig,
      onStatus: (status, detail) => {
        if (status === "connected") {
          setPvpStatusDetail("Opponent found!");
        } else if (status === "creatingOffer" || status === "awaitingAnswer" || status === "joining" || status === "connecting") {
          setPvpStatusDetail("Searching for opponent...");
        } else if (status === "failed") {
          setPvpStatusDetail(detail);
        } else if (status === "closed") {
          setPvpStatusDetail("Connection closed.");
        } else {
          setPvpStatusDetail(detail);
        }
        setPvpConnected(status === "connected");
        if (status === "connected") {
          pvpLocalCloseIntentRef.current = false;
        }
        if (status === "closed") {
          setPvpLocalSignal("");
          resetCandidateSync();
        }
        if (status === "closed" && !pvpLocalCloseIntentRef.current) {
          const activeScreen = screenRef.current;
          const activeMode = matchModeRef.current;
          if (activeScreen === "match" && activeMode === "playerVsPlayer") {
            setGame((current) => opponentAbandonedMatch(current));
            setPvpStatusDetail("Opponent disconnected and forfeited.");
          }
        }
      },
      onMessage: handlePvpMessage,
      onLocalCandidate: enqueueLocalCandidate,
    });
    pvpPeerRef.current = runtime;
    return runtime;
  };

  const runWithRtcFallback = async <T,>(operation: (runtime: PeerRuntime) => Promise<T>): Promise<{ runtime: PeerRuntime; result: T }> => {
    let runtime = await ensurePeerRuntime();
    try {
      const result = await operation(runtime);
      return { runtime, result };
    } catch (error) {
      if (!isTurnRelayUnavailableError(error)) throw error;
      const fallbackConfig = toStunFallbackRtcConfig(pvpRtcConfigRef.current);
      if (!fallbackConfig) throw error;
      setPvpStatusDetail("TURN unavailable on this network. Retrying with STUN...");
      pvpLocalCloseIntentRef.current = true;
      pvpPeerRef.current?.close();
      pvpPeerRef.current = null;
      pvpLocalCloseIntentRef.current = false;
      pvpRtcConfigRef.current = fallbackConfig;
      runtime = await ensurePeerRuntime();
      const result = await operation(runtime);
      return { runtime, result };
    }
  };

  const setPvpRoleAndReset = (role: PvpRole) => {
    setPvpRole(role);
    setPvpStatusDetail(role === "host" ? "Searching for opponent..." : "Waiting for code...");
    setPvpLocalSignal("");
    setPvpRemoteSignal("");
    setPvpConnected(false);
    pvpHelloAckRef.current = false;
    remoteDeckRef.current = null;
    remoteEnergyTypesRef.current = null;
    remoteNameRef.current = "Opponent";
    pvpAnswerPollTokenRef.current += 1;
    resetCandidateSync();
    pvpLocalCloseIntentRef.current = true;
    pvpPeerRef.current?.close();
    pvpPeerRef.current = null;
  };

  const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const createOffer = async () => {
    try {
      setPvpStatusDetail("Loading network relay settings...");
      const { runtime, result: offer } = await runWithRtcFallback((activeRuntime) => {
        const rtcConfig = pvpRtcConfigRef.current;
        if (rtcConfig?.iceTransportPolicy === "relay") return activeRuntime.hostCreateOffer();
        return activeRuntime.hostCreateOffer({ trickle: true });
      });
      const created = await createPvpSession(offer);
      const code = created.code.toUpperCase();
      const pollToken = ++pvpAnswerPollTokenRef.current;
      setPvpLocalSignal(code);
      pvpActiveCodeRef.current = code;
      scheduleCandidateFlush();
      startCandidatePolling(code, "host", runtime);
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // Ignore clipboard failures; host can still read the code from UI.
      }
      setPvpStatusDetail("Waiting for guest answer...");
      void waitForHostAnswer(code, runtime, pollToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create offer.";
      resetCandidateSync();
      setPvpStatusDetail(message);
    }
  };

  const joinWithOffer = async (codeOverride?: string) => {
    const rawCode = codeOverride ?? pvpRemoteSignal;
    if (!rawCode.trim()) {
      setPvpStatusDetail("Waiting for code...");
      return;
    }
    try {
      const code = normalizeCode(rawCode);
      if (!code) {
        setPvpStatusDetail("Code is invalid.");
        return;
      }
      pvpActiveCodeRef.current = code;
      setPvpStatusDetail("Fetching game offer...");
      const { offer } = await getPvpOffer(code);
      setPvpStatusDetail("Loading network relay settings...");
      setPvpStatusDetail("Creating connection answer...");
      const { runtime, result: answer } = await runWithRtcFallback((activeRuntime) => {
        const rtcConfig = pvpRtcConfigRef.current;
        if (rtcConfig?.iceTransportPolicy === "relay") return activeRuntime.joinWithOffer(offer);
        return activeRuntime.joinWithOffer(offer, { trickle: true });
      });
      setPvpStatusDetail("Sending answer to host...");
      await submitPvpAnswer(code, answer);
      scheduleCandidateFlush();
      startCandidatePolling(code, "guest", runtime);
      setPvpStatusDetail("Answer sent. Connecting to host...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join with offer.";
      resetCandidateSync();
      setPvpStatusDetail(message);
    }
  };

  const copyLocalSignal = async () => {
    if (!pvpLocalSignal) return;
    try {
      await navigator.clipboard.writeText(pvpLocalSignal);
      setPvpStatusDetail("Searching for opponent...");
    } catch {
      setPvpStatusDetail("Copy failed. You can copy manually.");
    }
  };

  const clearPvp = () => {
    setPvpRole(null);
    setPvpStatusDetail("Pick Host or Join to begin.");
    setPvpLocalSignal("");
    setPvpRemoteSignal("");
    setPvpConnected(false);
    pvpHelloAckRef.current = false;
    remoteDeckRef.current = null;
    remoteEnergyTypesRef.current = null;
    remoteNameRef.current = "Opponent";
    pvpAnswerPollTokenRef.current += 1;
    resetCandidateSync();
    pvpLocalCloseIntentRef.current = true;
    pvpPeerRef.current?.close();
    pvpPeerRef.current = null;
  };

  const returnToPvpLobbyForRematch = () => {
    resetTransientMatchUi();
    clearPvp();
    setMatchMode("playerVsPlayer");
    navigateToScreen("pvpLobby");
  };

  const waitForHostAnswer = async (code: string, runtime: PeerRuntime, token: number) => {
    try {
      const started = Date.now();
      while (Date.now() - started < 120_000) {
        if (pvpPeerRef.current !== runtime || pvpAnswerPollTokenRef.current !== token) return;
        const answer = await getPvpAnswer(code);
        if (answer) {
          await runtime.hostAcceptAnswer(answer);
          setPvpStatusDetail("Player joined. Finalizing connection...");
          return;
        }
        await delay(1200);
      }
      setPvpStatusDetail("No one joined yet. Keep this code open or create a new one.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed while waiting for player join.";
      setPvpStatusDetail(message);
    }
  };

  useEffect(() => {
    if (!pvpConnected || pvpRole !== "guest" || screen !== "pvpLobby") return;
    const sendHello = () => {
      if (pvpHelloAckRef.current) return;
      const runtime = pvpPeerRef.current;
      if (!runtime || !runtime.isConnected()) return;
      runtime.send({ type: "hello", playerName: localPlayerName, deckCardIds: equippedDeck.cardIds, energyTypes: getDeckEnergyTypes(equippedDeck) });
    };
    sendHello();
    const intervalId = window.setInterval(() => {
      if (screenRef.current !== "pvpLobby") {
        window.clearInterval(intervalId);
        return;
      }
      if (matchModeRef.current !== "playerVsPlayer" || pvpRoleRef.current !== "guest") {
        window.clearInterval(intervalId);
        return;
      }
      if (pvpHelloAckRef.current) {
        window.clearInterval(intervalId);
        return;
      }
      sendHello();
    }, 1200);
    return () => window.clearInterval(intervalId);
  }, [pvpConnected, pvpRole, equippedDeck.cardIds, screen, localPlayerName]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (matchModeRef.current !== "playerVsPlayer" || screenRef.current !== "match") return;
      if (game.gameOver) return;
      pvpLocalCloseIntentRef.current = true;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [game.gameOver]);

  useEffect(() => {
    return () => {
      pvpLocalCloseIntentRef.current = true;
      pvpPeerRef.current?.close();
      pvpPeerRef.current = null;
      resetCandidateSync();
    };
  }, []);

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
    isTurnFlowBlocked: isTurnFlowBlocked || cardFlowQueue.length > 0,
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
    isTurnFlowBlocked,
    endTurnWarningActions,
    previewTarget,
    discardOpen,
    pendingSelection,
    actionNotice,
    menuOpen,
    navigateToScreen,
    onEscapeFromPvpLobby: handleEscapeFromPvpLobby,
    setEndTurnWarningActions,
    setPreviewTarget,
    setDiscardOpen,
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

  useEffect(() => {
    const previous = previousPlayerZonesRef.current;
    const current = {
      player: {
        hand: [...game.sides.player.hand],
        deck: [...game.sides.player.deck],
        discard: [...game.sides.player.discard],
      },
      opponent: {
        hand: [...game.sides.opponent.hand],
        deck: [...game.sides.opponent.deck],
        discard: [...game.sides.opponent.discard],
      },
      currentSide: game.currentSide,
      turnNumber: game.turnNumber,
      phase: game.phase,
      log: [...game.log],
    };

    if (!previous) {
      previousPlayerZonesRef.current = current;
      return;
    }

    if (game.phase !== "play" || game.gameOver) {
      previousPlayerZonesRef.current = current;
      return;
    }
    const nextFlow: CardFlowItem[] = [];
    const povSideId: SideId = isAiVsAi ? displayPerspective : "player";
    const sideIds: SideId[] = ["player", "opponent"];
    for (const sideId of sideIds) {
      const previousSide = previous[sideId];
      const currentSide = current[sideId];
      const isPovSide = sideId === povSideId;
      const sideOnRight = sideId === "player";
      const discardedFromHandCards = allCardsMoved(
        previousSide.hand,
        currentSide.hand,
        previousSide.discard,
        currentSide.discard,
      );
      let obtainedFromDeckCards = subtractCardLists(currentSide.hand, previousSide.hand);
      const shuffleDrawCount = getShuffleHandDrawCount(previous.log, current.log, sideId);
      if (shuffleDrawCount && obtainedFromDeckCards.length < shuffleDrawCount) {
        // For effects like Tracen Academy, a card may leave hand, shuffle into deck, then be redrawn.
        // Diff alone misses those redraws, so take the freshly rebuilt hand tail by drawn count.
        obtainedFromDeckCards = currentSide.hand.slice(-shuffleDrawCount);
      }
      if (obtainedFromDeckCards.length > 0 && isPovSide) {
        const label = "Card drawn";
        obtainedFromDeckCards.slice(0, 5).forEach((cardId) => {
          nextFlow.push({
            cardId,
            label,
            group: "drawn",
            enterFrom: sideOnRight ? "leftDeck" : "bottomLeft",
            exitTo: "bottomCenter",
          });
        });
      }

      discardedFromHandCards.slice(0, 5).forEach((discardedFromHand) => {
        const cardName = tryGetCardName(discardedFromHand);
        const played = Boolean(cardName && hasPlayLogEntry(previous.log, current.log, cardName));
        if (!played && !isPovSide) return;

        nextFlow.push({
          cardId: discardedFromHand,
          label: played ? "Card played" : "Card discarded",
          group: played ? "played" : "discarded",
          enterFrom: sideOnRight ? "rightHand" : "leftHand",
          exitTo: isPovSide ? "rightDiscard" : sideOnRight ? "rightHand" : "leftHand",
        });
      });
    }

    if (nextFlow.length > 0) setCardFlowQueue((queue) => [...queue, nextFlow]);

    previousPlayerZonesRef.current = current;
  }, [game, isAiVsAi, displayPerspective]);

  const showShuffleReveal = (cardId: string) => {
    setCardFlowQueue((queue) => [
      ...queue,
      [{
        cardId,
        label: "Card retrieved",
        group: "retrieved",
        enterFrom: "rightDiscard",
        exitTo: "leftDeck",
      }],
    ]);
  };

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
    handleSetupReady,
  } = useMatchActions({
    game,
    player,
    isAiVsAi,
    pendingSelection,
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
  });
  const cardPreviewActions = useCardPreviewActions({
    game,
    player,
    previewTarget,
    isTurnFlowBlocked,
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
  const canAttachInHeader = !isAiVsAi && canAttachEnergy(game, player) && !isBusyWithChoice;
  const canEndTurnInHeader = !isAiVsAi && !game.gameOver && game.currentSide === "player" && !isBusyWithChoice;
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
  const isPlayPhase = game.phase === "play";
  const showSelectedPlaymat = isPlayPhase
    ? game.currentSide === "player"
    : displayPerspective === "player";
  const showOpponentPlaymat = isPlayPhase
    ? game.currentSide === "opponent" && !suppressOpponentPlaymatLayer
    : displayPerspective === "opponent";
  const renderOpponentPlaymatLayer = !suppressOpponentPlaymatLayer;

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
      {renderOpponentPlaymatLayer && <div style={matchBackgroundLayerStyle(opponentPlaymat.image, showOpponentPlaymat ? 1 : 0)} />}
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
          onUmamusumeSelect={selectUmamusume}
          onSetupDropActive={applySetupActive}
          onSetupDropBench={applySetupBench}
          onSetupPromoteToActive={promoteSetupBenchToActive}
          onHandCardDropOnUmamusume={playHandCardOnUmamusume}
          onHandCardDropOnBenchSlot={playHandCardOnBenchSlot}
          onEnergyDropOnUmamusume={attachEnergyByDrop}
          onAbilityEnergyDropOnActive={moveAbilityEnergyByDrop}
          opponentSleeveImage={displayOpponentSleeveImage}
          stadiumAbilityReady={stadiumAbilityReady}
          onDropHandCardOnStadium={playHandCardOnStadiumSpot}
          onDropHandCardOnCenter={playHandCardOnCenter}
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
          canAttach={canAttachInHeader}
          nextPlayerEnergy={nextPlayerEnergy}
          playerExtraEnergyCount={playerExtraEnergyCount}
          canEndTurn={canEndTurnInHeader}
          turnLabel={turnLabel}
          turnAlert={turnAlert}
          onEndTurn={handleEndTurn}
          selectableHandIndexes={selectableHandIndexes}
          onChooseHandCard={chooseHandCard}
          onOpenDiscard={onOpenDiscard}
          displayLog={displayLog}
        />
        {displayTopBanner && <OpponentActionBanner title={displayTopBanner.title} message={displayTopBanner.message} paused={displayTopBanner.paused} />}
        {game.phase === "setup" && (!game.setup?.coinFlipResult || (openingCoinChoicePending && !activeCoinFlip)) && (
          <CoinFlipOverlay
            key="opening-coin-choice"
            mode="prompt"
            message={openingCoinChoicePending
              ? "Flipping coin..."
              : isAiVsAi
                ? "AI choosing heads or tails..."
                : canChooseOpeningCoin
                  ? "Choose heads or tails"
                  : "Waiting for host to choose heads or tails..."}
            canChoose={canChooseOpeningCoin && !openingCoinChoicePending}
            onChoose={handleChooseOpeningCoin}
          />
        )}
        {activeCoinFlip && (
          <CoinFlipOverlay
            key={activeCoinFlip.id}
            result={activeCoinFlip.result}
            results={activeCoinFlip.results}
            message={formatMatchText(activeCoinFlip.message)}
            onContinue={handleCoinFlipContinue}
          />
        )}
        {cardFlowQueue[0] && (
          <CardFlowOverlay
            items={cardFlowQueue[0]}
            durationMs={game.phase === "setup" ? 1500 : 2100}
            onDone={() => {
              setCardFlowQueue((queue) => queue.slice(1));
              if (!shouldDealOpeningHandsAfterFlowRef.current) return;
              shouldDealOpeningHandsAfterFlowRef.current = false;
              setGame((current) => {
                const next = dealOpeningHands(current);
                if (isPvpHost) syncToGuest(next);
                return next;
              });
            }}
          />
        )}
        {activePendingSelection && (
          <SelectionPrompt
            pending={activePendingSelection}
            onCancel={onSelectionCancel}
            nextEnergyType={nextPlayerEnergy}
            onRetreatDiscardAdjust={adjustRetreatDiscard}
            onConfirmRetreatDiscard={confirmRetreatDiscard}
          />
        )}
        <CardPreview
          state={displayGame}
          target={previewTarget}
          canUseAttack={cardPreviewActions.canUseAttack}
          canUseRetreat={cardPreviewActions.canUseRetreat}
          canUseAbility={cardPreviewActions.canUseAbility}
          onAttack={cardPreviewActions.onAttack}
          onRetreat={cardPreviewActions.onRetreat}
          onAbility={cardPreviewActions.onAbility}
          onInspect={openPreview}
          onClose={closePreview}
        />
        <EndTurnWarningModal
          actions={endTurnWarningActions}
          suppressForGame={suppressEndTurnWarningForGame}
          onSuppressForGameChange={setSuppressEndTurnWarningForGame}
          onCancel={onEndTurnWarningCancel}
          onConfirm={onEndTurnWarningConfirm}
        />
        {discardOpen && (
          <DiscardPileModal
            cardIds={displayPlayer.discard}
            onInspect={onDiscardInspect}
            onClose={onCloseDiscard}
          />
        )}
        {(pendingSelection?.kind === "deckForScout" || pendingSelection?.kind === "deckForEvolutionSearch" || pendingSelection?.kind === "deckForAttackEvolution") && (
          <DeckChoiceModal
            cardIds={player.deck}
            filter={pendingSelection.kind === "deckForEvolutionSearch" || pendingSelection.kind === "deckForAttackEvolution" ? "evolutionUmamusume" : "umamusume"}
            evolvesFrom={pendingSelection.kind === "deckForAttackEvolution" ? pendingSelection.evolvesFrom : undefined}
            stage={pendingSelection.kind === "deckForAttackEvolution" ? pendingSelection.stage : undefined}
            onChoose={chooseScoutDeckCard}
            onClose={onDeckScoutClose}
          />
        )}
        {actionNotice && (
          <ActionNotice
            notice={formatMatchText(actionNotice)}
            tone={getActionNoticeTone(actionNotice)}
            placement={isBottomActionNotice(actionNotice) ? "bottom" : "top"}
            interactive={isBottomActionNotice(actionNotice)}
            onClose={onActionNoticeClose}
          />
        )}
        {game.gameOver && (
          <GameOverModal
            game={displayGame}
            playerName="You"
            opponentName="Opponent"
            latest={displayLog[0]}
            onPlayAgain={isNetworkMatch ? returnToPvpLobbyForRematch : onPlayAgain}
            onMainMenu={returnToMainMenu}
          />
        )}
      </Suspense>
      <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
    </main>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function toPerspectiveGame(game: GameState, perspective: SideId): GameState {
  if (perspective === "player") {
    return {
      ...game,
      sides: {
        player: toDisplaySide(game.sides.player, "player", "You"),
        opponent: toDisplaySide(game.sides.opponent, "opponent", "Opponent"),
      },
    };
  }

  return {
    ...game,
    currentSide: swapSideId(game.currentSide),
    firstPlayer: swapSideId(game.firstPlayer) as SideId,
    winner: game.winner ? swapSideId(game.winner) as SideId : null,
    pendingPlayerChoice: game.pendingPlayerChoice
      ? { ...game.pendingPlayerChoice, sideId: swapSideId(game.pendingPlayerChoice.sideId) as SideId }
      : null,
    stadium: game.stadium ? { ...game.stadium, owner: swapSideId(game.stadium.owner) as SideId } : null,
    setup: game.setup
      ? {
          ...game.setup,
          openingHands: {
            player: game.setup.openingHands.opponent,
            opponent: game.setup.openingHands.player,
          },
          readyBySide: {
            player: game.setup.readyBySide.opponent,
            opponent: game.setup.readyBySide.player,
          },
        }
      : null,
    turnsTakenBySide: {
      player: game.turnsTakenBySide.opponent,
      opponent: game.turnsTakenBySide.player,
    },
    sides: {
      player: toDisplaySide(game.sides.opponent, "player", "You"),
      opponent: toDisplaySide(game.sides.player, "opponent", "Opponent"),
    },
  };
}

function toDisplaySide(side: SideState, id: SideId, title: string): SideState {
  return { ...side, id, title };
}

function swapSideId(sideId: SideId | "done"): SideId | "done" {
  if (sideId === "player") return "opponent";
  if (sideId === "opponent") return "player";
  return sideId;
}

function swapBattlePerspectiveText(text: string): string {
  const replacements: Array<[string, string]> = [
    ["Opponent's", "§YOU_POS_CAP§"],
    ["opponent's", "§YOU_POS_LOW§"],
    ["Your", "§OPP_POS_CAP§"],
    ["your", "§OPP_POS_LOW§"],
    ["Opponent", "§YOU_CAP§"],
    ["opponent", "§YOU_LOW§"],
    ["You are", "§OPP_CAP§ is"],
    ["you are", "§OPP_LOW§ is"],
    ["You were", "§OPP_CAP§ was"],
    ["you were", "§OPP_LOW§ was"],
    ["You have", "§OPP_CAP§ has"],
    ["you have", "§OPP_LOW§ has"],
    ["You ", "§OPP_CAP§ "],
    ["you ", "§OPP_LOW§ "],
  ];

  let formatted = text;
  replacements.forEach(([search, replacement]) => {
    formatted = formatted.split(search).join(replacement);
  });

  return formatted
    .split("§YOU_POS_CAP§").join("Your")
    .split("§YOU_POS_LOW§").join("your")
    .split("§OPP_POS_CAP§").join("Opponent's")
    .split("§OPP_POS_LOW§").join("opponent's")
    .split("§YOU_CAP§").join("You")
    .split("§YOU_LOW§").join("you")
    .split("§OPP_CAP§").join("Opponent")
    .split("§OPP_LOW§").join("opponent");
}

function redactHiddenSidePrivateInfo(entry: string): string {
  if (!entry.startsWith("Opponent")) return entry;
  if (/^Opponent added .+ from .*deck to .*hand\.?$/.test(entry)) return "Opponent added 1 card from their deck to their hand.";
  if (/^Opponent put .+ from .*discard into .*hand\.?$/.test(entry)) return "Opponent put 1 card from discard into their hand.";
  if (/^Opponent revealed .+ and added it to .*hand\.?$/.test(entry)) return "Opponent revealed a card and added it to their hand.";
  const drawnCountMatch = entry.match(/^Opponent drew (\d+) cards?\./);
  if (drawnCountMatch?.[1]) {
    const count = Number(drawnCountMatch[1]);
    return `Opponent drew ${count} ${count === 1 ? "card" : "cards"}.`;
  }
  if (entry.startsWith("Opponent drew ")) return "Opponent drew cards.";
  if (entry.includes(" discarded ") && entry.includes(" and drew ")) {
    const drawCount = entry.match(/ and drew (\d+) cards?\./);
    if (drawCount?.[1]) {
      const count = Number(drawCount[1]);
      return `Opponent discarded a card and drew ${count} ${count === 1 ? "card" : "cards"}.`;
    }
    return "Opponent discarded a card and drew cards.";
  }
  if (entry.startsWith("Opponent discarded ")) return "Opponent discarded a card.";
  return entry;
}
