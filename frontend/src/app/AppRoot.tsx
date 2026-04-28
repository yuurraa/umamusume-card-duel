import { useEffect, useRef, useState } from "react";
import {
  canAttachEnergy,
  createGame,
  opponentAbandonedMatch,
  tickSetupCountdown,
  timeoutEndTurn,
} from "../game/engine";
import type { InspectTarget } from "../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../types/ui";
import { getDeckById, readEquippedDeckId, pickRandomOpponentDeck } from "../utils/deck";
import { CardPreview } from "../match/modals/CardPreview";
import { DiscardPileModal } from "../match/modals/DiscardPileModal";
import { DeckChoiceModal } from "../match/modals/DeckChoiceModal";
import { GameOverModal } from "../match/modals/GameOverModal";
import { EndTurnWarningModal } from "../match/modals/EndTurnWarningModal";
import { SelectionPrompt } from "../match/controls/SelectionPrompt";
import { OpponentActionBanner } from "../match/feedback/OpponentActionBanner";
import { ActionNotice } from "../match/feedback/ActionNotice";
import { CoinFlipOverlay } from "../match/feedback/CoinFlipOverlay";
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
import { appStyle, matchBackgroundLayerStyle, screenFadeOverlayStyle } from "./styles";
import { renderNonMatchScreen } from "./nonMatchScreens";
import { MatchBoardLayout } from "./MatchBoardLayout";
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
import { createGuestSyncState, mirrorGameState, mirrorGameStateForGuest, redactOpponentLogPrivateInfo } from "../pvp/stateMirror";
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
import { formatBattleText, getAccountPlayerName } from "../utils/playerNames";
import type { GameState, SideId, SideState } from "../../../shared/src/types";

const EMPTY_FIREBASE_ACCOUNT: FirebaseAccountSnapshot = {
  configured: false,
  localId: null,
  displayName: null,
  email: null,
  photoUrl: null,
  isGoogleLinked: false,
};

const TURN_RELAY_UNAVAILABLE_TEXT = "TURN relay candidate was not available.";

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
    return createGame(playerDeck.cardIds, opponent.cardIds, opponent.name);
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
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opponentSetupRevealToken, setOpponentSetupRevealToken] = useState(0);
  const [povSwitchAnimationToken, setPovSwitchAnimationToken] = useState(0);
  const [pvpTimerNowMs, setPvpTimerNowMs] = useState(() => Date.now());
  const pvpDeadlineTurnKeyRef = useRef<string | null>(null);
  const previousLogRef = useRef<string[]>([]);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
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
  const remoteDeckRef = useRef<string[] | null>(null);
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
  const displayPerspective: SideId = isAiVsAi ? aiPerspective : "player";
  const displayGame = isNetworkMatch ? game : toPerspectiveGame(game, displayPerspective);
  const player = game.sides.player;
  const displayPlayer = displayGame.sides.player;
  const localPlayerName = getAccountPlayerName(firebaseAccount);
  const opponentDisplayName = game.sides.opponent.title || "Opponent";
  const formatMatchText = (text: string): string => {
    if (isNetworkMatch) return formatBattleText(text, localPlayerName, opponentDisplayName);
    return displayPerspective === "opponent" ? swapBattlePerspectiveText(text) : text;
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
    equippedDeckCardIdsRef.current = equippedDeck.cardIds;
  }, [equippedDeck.cardIds]);

  const resetTransientMatchUi = () => {
    previousLogRef.current = [];
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setAcknowledgedCoinLogMessage(null);
    setPendingCoinAttack(null);
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
      remoteNameRef.current = message.playerName || "Opponent";
      if (currentScreen === "match") {
        syncToGuest(gameRef.current);
        return;
      }
      if (currentScreen !== "pvpLobby") return;
      resetTransientMatchUi();
      const starting = createGame(equippedDeckCardIdsRef.current, message.deckCardIds, remoteNameRef.current, "hard", true, localPlayerName);
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
        const canonical = redactOpponentLogPrivateInfo(mirrorGameState(nextMirrored));
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
      runtime.send({ type: "hello", playerName: localPlayerName, deckCardIds: equippedDeck.cardIds });
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

  const {
    applySetupActive,
    promoteSetupBenchToActive,
    applySetupBench,
  } = useSetupActions({
    playerHand: player.hand,
    setupActiveIndex,
    setupBenchIndexes,
    isTurnFlowBlocked,
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
    startNewGame,
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

  useAppRuntimeEffects({
    game,
    player,
    isAiVsAi,
    isNetworkMatch,
    shouldDriveSetupCountdown: !isNetworkMatch || isPvpHost,
    advanceSetupCountdown,
    isTurnFlowBlocked,
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
  const canSetupReady = !isAiVsAi && !hasLocalSetupReady;
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
    ? game.currentSide === "opponent"
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

  return (
    <main style={appStyle(false, undefined, uiTextTone)}>
      <div style={matchBackgroundLayerStyle(selectedPlaymat.image, showSelectedPlaymat ? 1 : 0)} />
      <div style={matchBackgroundLayerStyle(opponentPlaymat.image, showOpponentPlaymat ? 1 : 0)} />
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
        onSwitchPov={switchPov}
        selectedSleeveImage={displayPlayerSleeveImage}
        canPlayHandCards={!isAiVsAi}
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
      {activeCoinFlip && (
        <CoinFlipOverlay
          key={activeCoinFlip.id}
          result={activeCoinFlip.result}
          message={formatMatchText(activeCoinFlip.message)}
          onContinue={handleCoinFlipContinue}
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
          playerName={isNetworkMatch ? localPlayerName : "You"}
          opponentName={isNetworkMatch ? opponentDisplayName : "Opponent"}
          latest={displayLog[0]}
          onPlayAgain={isNetworkMatch ? returnToPvpLobbyForRematch : onPlayAgain}
          onMainMenu={returnToMainMenu}
        />
      )}
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
