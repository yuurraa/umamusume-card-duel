import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createGame, opponentAbandonedMatch, timeoutEndTurn } from "../../game/engine";
import type { PlayerIntent } from "../../pvp/playerIntent";
import { applyPlayerIntent } from "../../pvp/playerIntent";
import { PeerRuntime } from "../../pvp/peer";
import type { PvpWireMessage } from "../../pvp/protocol";
import {
  createPvpSession,
  getPvpAnswer,
  getPvpCandidates,
  getPvpOffer,
  getPvpRtcConfig,
  submitPvpAnswer,
  submitPvpCandidates,
} from "../../pvp/signalApi";
import { createGuestSyncState, mirrorGameState, mirrorGameStateForGuest } from "../../pvp/stateMirror";
import type { PvpRole } from "../../screens/PvpLobbyScreen";
import type { AppScreen, MatchMode } from "../../types/ui";
import type { EnergyType, GameState } from "../../../../shared/src/types";
import { delay, isTurnRelayUnavailableError, toStunFallbackRtcConfig, withDefaultIceServers } from "../pvp/rtcHelpers";

type UsePvpMatchOptions = {
  game: GameState;
  screen: AppScreen;
  matchMode: MatchMode;
  equippedDeckCardIds: string[];
  equippedDeckEnergyTypes: EnergyType[];
  playerName: string;
  resetTransientMatchUi: () => void;
  setGame: Dispatch<SetStateAction<GameState>>;
  setMatchMode: Dispatch<SetStateAction<MatchMode>>;
  setScreen: Dispatch<SetStateAction<AppScreen>>;
  setPendingScreen: Dispatch<SetStateAction<AppScreen | null>>;
};

export function usePvpMatch({
  game,
  screen,
  matchMode,
  equippedDeckCardIds,
  equippedDeckEnergyTypes,
  playerName,
  resetTransientMatchUi,
  setGame,
  setMatchMode,
  setScreen,
  setPendingScreen,
}: UsePvpMatchOptions) {
  const [pvpRole, setPvpRole] = useState<PvpRole | null>(null);
  const [pvpStatusDetail, setPvpStatusDetail] = useState("Pick Host or Join to begin.");
  const [pvpLocalSignal, setPvpLocalSignal] = useState("");
  const [pvpRemoteSignal, setPvpRemoteSignal] = useState("");
  const [pvpConnected, setPvpConnected] = useState(false);
  const [pvpTimerNowMs, setPvpTimerNowMs] = useState(() => Date.now());

  const pvpDeadlineTurnKeyRef = useRef<string | null>(null);
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
  const remoteNameRef = useRef("Opponent");

  const isNetworkMatch = matchMode === "playerVsPlayer";
  const isPvpHost = isNetworkMatch && pvpRole === "host";
  const isPvpGuest = isNetworkMatch && pvpRole === "guest";

  useEffect(() => {
    pvpRoleRef.current = pvpRole;
  }, [pvpRole]);

  useEffect(() => {
    matchModeRef.current = matchMode;
  }, [matchMode]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    equippedDeckCardIdsRef.current = equippedDeckCardIds;
    equippedDeckEnergyTypesRef.current = equippedDeckEnergyTypes;
  }, [equippedDeckCardIds, equippedDeckEnergyTypes]);

  const syncToGuest = (state: GameState) => {
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
        playerName,
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
  }, [isNetworkMatch, isPvpHost, game.phase, game.gameOver, game.currentSide, game.turnNumber, game.turnDeadlineMs, setGame]);

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
    setGame,
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
    const rtcConfig = withDefaultIceServers(serverConfig);
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

  const resetPvpSession = () => {
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

  const setPvpRoleAndReset = (role: PvpRole) => {
    setPvpRole(role);
    setPvpStatusDetail(role === "host" ? "Searching for opponent..." : "Waiting for code...");
    resetPvpSession();
  };

  const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

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
    resetPvpSession();
  };

  useEffect(() => {
    if (!pvpConnected || pvpRole !== "guest" || screen !== "pvpLobby") return;
    const sendHello = () => {
      if (pvpHelloAckRef.current) return;
      const runtime = pvpPeerRef.current;
      if (!runtime || !runtime.isConnected()) return;
      runtime.send({
        type: "hello",
        playerName,
        deckCardIds: equippedDeckCardIds,
        energyTypes: equippedDeckEnergyTypes,
      });
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
  }, [pvpConnected, pvpRole, equippedDeckCardIds, equippedDeckEnergyTypes, screen, playerName]);

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

  return {
    pvpRole,
    pvpStatusDetail,
    pvpLocalSignal,
    pvpRemoteSignal,
    pvpConnected,
    pvpTimerNowMs,
    isPvpHost,
    isPvpGuest,
    submitPlayerIntent,
    syncToGuest,
    setPvpRoleAndReset,
    createOffer,
    joinWithOffer,
    copyLocalSignal,
    clearPvp,
    setPvpRemoteSignal,
  };
}
