import { useEffect, useRef, useState } from "react";
import { MAX_BENCH, premadeDecks } from "../../../shared/src/gameData";
import { Hand } from "../components/boards/Hand";
import { SideBoard } from "../components/boards/SideBoard";
import {
  advancePlayerAiTurnStep,
  advanceOpponentTurnStep,
  attachPlayerEnergy,
  canAttack,
  canAttachEnergy,
  canRetreat,
  canUseStadium,
  canUseUmamusumeAbility,
  completePregameSetup,
  createGame,
  getAllUmamusume,
  getCard,
  getDamagedUmamusume,
  getDisplayedRetreatCost,
  getEvolutionTargets,
  getPrimaryAttack,
  getRainbowUncapEvolutionHandOptions,
  getRainbowUncapTargets,
  getUmamusumeCard,
  getPlayableAction,
  getToolTargets,
  playerAttack,
  playerEndTurn,
  playerRetreat,
  playerSurrender,
  playerUseStadium,
  playHandCard,
  resolvePendingPlayerChoice,
  usePlayerAbility,
} from "../game/engine";
import type { EnergyType, GameState, SideId, UmamusumeInstance } from "../../../shared/src/types";
import type { InspectTarget } from "../inspect";
import type { ActionNoticeSource, AppScreen, MatchMode, PendingSelection } from "../types/ui";
import { getDeckById, readEquippedDeckId, writeEquippedDeckId, pickRandomOpponentDeck } from "../utils/deck";
import {
  createSetupPreviewSide,
  createSetupEmptyOpponentSide,
  createSetupHiddenOpponentSide,
  getSelectableUmamusumeUids,
  getOpponentStepDelay,
} from "../match/utils/helpers";
import { CardPreview } from "../match/modals/CardPreview";
import { DiscardPileModal } from "../match/modals/DiscardPileModal";
import { DeckChoiceModal } from "../match/modals/DeckChoiceModal";
import { PlayDropZone } from "../match/board/PlayDropZone";
import { StadiumSpot } from "../match/board/StadiumSpot";
import { PlayHandHeader } from "../match/controls/HandControls";
import { PregameSetupPanel } from "../match/setup/PregameSetupPanel";
import { GameOverModal } from "../match/modals/GameOverModal";
import { EndTurnWarningModal } from "../match/modals/EndTurnWarningModal";
import { SelectionPrompt } from "../match/controls/SelectionPrompt";
import { OpponentActionBanner } from "../match/feedback/OpponentActionBanner";
import { ActionNotice } from "../match/feedback/ActionNotice";
import { CoinFlipOverlay } from "../match/feedback/CoinFlipOverlay";
import { MainMenuScreen } from "../screens/MainMenuScreen";
import { MatchModeScreen } from "../screens/MatchModeScreen";
import { DeckBrowserScreen } from "../screens/DeckBrowserScreen";
import { CustomisationScreen } from "../screens/CustomisationScreen";
import {
  getPlaymatTextTone,
  getSelectedPlaymat,
  getSelectedSleeve,
  getRandomCustomisationSettings,
  readCustomisationSettings,
  writeCustomisationSettings,
  type CustomisationSettings,
} from "../utils/customisation";
import {
  type CoinFlipEvent,
  RETREAT_ENERGY_ORDER,
  chooseAiSetupSelection,
  choosePreferredBenchUid,
  formatKoActionNotice,
  getActionNoticeTone,
  getKoCauseFromEntries,
  getNewLogEntries,
  getPendingAttackCoinFlip,
  getTopActionBanner,
  isBottomActionNotice,
  toCoinFlipEvent,
} from "./gameUiHelpers";
import {
  SCREEN_FADE_MS,
  appStyle,
  contentStyle,
  duelGridStyle,
  handPanelStyle,
  matchBackgroundLayerStyle,
  screenFadeOverlayStyle,
} from "./styles";

type PendingCoinAttack = {
  eventId: number;
  attackerId: SideId;
  result: "heads" | "tails";
  attackTargetUid?: number;
  healTargetUid?: number;
};

export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [pendingScreen, setPendingScreen] = useState<AppScreen | null>(null);
  const [screenFadeOverlayOpacity, setScreenFadeOverlayOpacity] = useState(0);
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
  const [matchMode, setMatchMode] = useState<MatchMode>("playerVsAi");
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
  const previousLogRef = useRef<string[]>([]);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
  const skipNextCoinLogMessageRef = useRef<string | null>(null);
  const equippedDeck = getDeckById(equippedDeckId);
  const selectedPlaymat = getSelectedPlaymat(customisation);
  const uiTextTone = getPlaymatTextTone(customisation);
  const selectedSleeve = getSelectedSleeve(customisation);
  const opponentPlaymat = getSelectedPlaymat(opponentCustomisation);
  const opponentSleeve = getSelectedSleeve(opponentCustomisation);
  const isAiVsAi = matchMode === "aiVsAi";
  const player = game.sides.player;
  const nextPlayerEnergy = player.energyZone[0] ?? null;
  const activePendingSelection = game.pendingPlayerChoice
    ? ({ kind: game.pendingPlayerChoice.kind === "switchAfterGust" ? "forceSwitchActive" : "replaceActive" } as PendingSelection)
    : pendingSelection?.kind === "deckForScout"
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
  const isBusyWithChoice = Boolean(pendingSelection || game.pendingPlayerChoice || endTurnWarningActions);
  const isCoinFlipBlocking = Boolean(activeCoinFlip || coinFlipQueue.length > 0 || unresolvedCoinLog);
  const isTurnFlowBlocked = isCoinFlipBlocking;
  const hideOpponentSetupBoard = game.phase === "setup" && isCoinFlipBlocking;
  const opponentBoardHidden = hiddenOpponent && !hideOpponentSetupBoard;
  const displayedPlayerSide = game.phase === "setup" ? createSetupPreviewSide(player, setupActiveIndex, setupBenchIndexes) : player;
  const displayedOpponentSide = hideOpponentSetupBoard
    ? createSetupEmptyOpponentSide(game.sides.opponent)
    : hiddenOpponent
      ? createSetupHiddenOpponentSide(game.sides.opponent)
      : game.sides.opponent;
  const hiddenOpponentBenchCount = opponentBoardHidden ? game.sides.opponent.bench.length : undefined;
  const isPlayPhase = game.phase === "play";
  const showPlayerPlaymat = !isPlayPhase || game.currentSide === "player";
  const showOpponentPlaymat = isPlayPhase && game.currentSide === "opponent";
  const setupDragHandIndexByUid = game.phase === "setup"
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

  const adjustRetreatDiscard = (energyType: EnergyType, delta: 1 | -1) => {
    setPendingSelection((current) => {
      if (!current || current.kind !== "retreatDiscard") return current;
      const available = current.availableEnergyCounts[energyType] ?? 0;
      const selected = current.selectedEnergyCounts[energyType] ?? 0;
      const selectedTotal = Object.values(current.selectedEnergyCounts).reduce((sum, count) => sum + (count ?? 0), 0);
      if (delta === 1 && selectedTotal >= current.retreatCost) return current;
      const nextSelected = Math.max(0, Math.min(available, selected + delta));
      if (nextSelected === selected) return current;
      return {
        ...current,
        selectedEnergyCounts: {
          ...current.selectedEnergyCounts,
          [energyType]: nextSelected,
        },
      };
    });
  };

  const confirmRetreatDiscard = () => {
    setPendingSelection((current) => {
      if (!current || current.kind !== "retreatDiscard") return current;
      const selectedCount = Object.values(current.selectedEnergyCounts).reduce((sum, count) => sum + (count ?? 0), 0);
      if (selectedCount !== current.retreatCost) return current;
      const discardEnergyTypes = RETREAT_ENERGY_ORDER.flatMap((energyType) => Array.from({ length: current.selectedEnergyCounts[energyType] ?? 0 }, () => energyType));
      return { kind: "retreatTarget", discardEnergyTypes };
    });
  };

  const applySetupActive = (index: number) => {
    if (isTurnFlowBlocked) return;
    const cardId = player.hand[index];
    const card = cardId ? getCard(cardId) : null;
    if (!card || card.kind !== "umamusume" || card.stage !== 0) return;
    setSetupActiveIndex(index);
    setSetupBenchIndexes((current) => current.filter((entry) => entry !== index));
  };

  const promoteSetupBenchToActive = (index: number) => {
    if (isTurnFlowBlocked) return;
    const cardId = player.hand[index];
    const card = cardId ? getCard(cardId) : null;
    if (!card || card.kind !== "umamusume" || card.stage !== 0) return;
    if (!setupBenchIndexes.includes(index)) {
      applySetupActive(index);
      return;
    }
    setSetupBenchIndexes((current) => {
      const withoutTarget = current.filter((entry) => entry !== index);
      return setupActiveIndex === null ? withoutTarget : [...withoutTarget, setupActiveIndex].slice(0, MAX_BENCH);
    });
    setSetupActiveIndex(index);
  };

  const applySetupBench = (index: number) => {
    if (isTurnFlowBlocked) return;
    const cardId = player.hand[index];
    const card = cardId ? getCard(cardId) : null;
    if (!card || card.kind !== "umamusume" || card.stage !== 0) return;
    if (index === setupActiveIndex) return;
    setSetupBenchIndexes((current) => {
      if (current.includes(index) || current.length >= MAX_BENCH) return current;
      return [...current, index];
    });
  };

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
    setGame(createGame(equippedDeck.cardIds, opponent.cardIds, opponent.name));
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

  const clearSelection = () => setPendingSelection(null);
  const toggleMenu = () => {
    if (isTurnFlowBlocked) return;
    setMenuOpen((open) => !open);
  };
  const handleSurrender = () => {
    setMenuOpen(false);
    setGame(playerSurrender);
  };
  const cancelPendingSelection = () => {
    if (game.pendingPlayerChoice) return;
    clearSelection();
  };
  const openPreview = (target: InspectTarget) => setPreviewTarget(target);
  const closePreview = () => setPreviewTarget(null);

  const handleEndTurn = () => {
    if (isTurnFlowBlocked || game.phase !== "play" || game.currentSide !== "player" || game.gameOver || isBusyWithChoice) return;
    const availableActions: string[] = [];
    if (canAttachEnergy(game, player)) availableActions.push("attach Energy");
    if (canAttack(game, player)) availableActions.push("attack");
    if (availableActions.length > 0 && !suppressEndTurnWarningForGame) {
      setEndTurnWarningActions(availableActions);
      return;
    }
    setGame(playerEndTurn);
  };

  useEffect(() => {
    writeEquippedDeckId(equippedDeck.id);
  }, [equippedDeck.id]);

  useEffect(() => {
    writeCustomisationSettings(customisation);
  }, [customisation]);

  useEffect(() => {
    if (!actionNotice) return undefined;
    if (isBottomActionNotice(actionNotice)) return undefined;
    const timeoutId = window.setTimeout(() => setActionNotice(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [actionNotice]);

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
  }, [game, previewTarget]);

  useEffect(() => {
    const setupCoinFlipBlocking = game.phase === "setup" && isCoinFlipBlocking;
    if (wasSetupCoinFlipBlockingRef.current && !setupCoinFlipBlocking && hiddenOpponent) {
      setOpponentSetupRevealToken((current) => current + 1);
    }
    wasSetupCoinFlipBlockingRef.current = setupCoinFlipBlocking;
  }, [game.phase, hiddenOpponent, isCoinFlipBlocking]);

  useEffect(() => {
    if (game.pendingPlayerChoice) setPreviewTarget(null);
  }, [game.pendingPlayerChoice]);

  useEffect(() => {
    if (!game.gameOver) return;
    setPendingSelection(null);
    setEndTurnWarningActions(null);
    setPreviewTarget(null);
    setDiscardOpen(false);
    setMenuOpen(false);
  }, [game.gameOver]);

  useEffect(() => {
    if (!endTurnWarningActions) return;
    if (game.phase !== "play" || game.currentSide !== "player" || game.gameOver || pendingSelection || game.pendingPlayerChoice) {
      setEndTurnWarningActions(null);
      return;
    }
    if (!canAttachEnergy(game, player) && !canAttack(game, player)) setEndTurnWarningActions(null);
  }, [endTurnWarningActions, game, player, pendingSelection]);

  useEffect(() => {
    if (!pendingScreen || pendingScreen === screen) return;
    setScreenFadeOverlayOpacity(1);
    const timeoutId = window.setTimeout(() => {
      setScreen(pendingScreen);
      setPendingScreen(null);
      window.requestAnimationFrame(() => setScreenFadeOverlayOpacity(0));
    }, SCREEN_FADE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [pendingScreen, screen]);

  useEffect(() => {
    if (game.phase !== "setup") return;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setPreviewTarget(null);
  }, [game.phase, player.hand]);

  useEffect(() => {
    if (!isAiVsAi || game.phase !== "setup" || game.gameOver || isTurnFlowBlocked) return;
    const setup = chooseAiSetupSelection(game);
    if (!setup) return;
    setGame((current) => completePregameSetup(current, setup.activeIndex, setup.benchIndexes));
  }, [game, isAiVsAi, isTurnFlowBlocked]);

  useEffect(() => {
    if (!isAiVsAi || !game.pendingPlayerChoice || game.gameOver) return;
    const preferredBenchUid = choosePreferredBenchUid(game.sides.player);
    if (preferredBenchUid === undefined) return;
    setGame((current) => resolvePendingPlayerChoice(current, preferredBenchUid));
  }, [game, isAiVsAi]);

  useEffect(() => {
    if (isTurnFlowBlocked || game.phase !== "play" || game.currentSide !== "opponent" || game.gameOver || game.pendingPlayerChoice) return undefined;
    const timeoutId = window.setTimeout(() => {
      const coinAttack = getPendingAttackCoinFlip(game, "opponent", coinFlipIdRef.current++);
      if (coinAttack) {
        setPendingCoinAttack({ eventId: coinAttack.id, attackerId: "opponent", result: coinAttack.result });
        setActiveCoinFlip(coinAttack);
        return;
      }
      setGame((current) => advanceOpponentTurnStep(current));
    }, getOpponentStepDelay(game));
    return () => window.clearTimeout(timeoutId);
  }, [game, isTurnFlowBlocked]);

  useEffect(() => {
    if (!isAiVsAi || isTurnFlowBlocked || game.phase !== "play" || game.currentSide !== "player" || game.gameOver || game.pendingPlayerChoice) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (game.opponentTurnStep === "attack") {
        const coinAttack = getPendingAttackCoinFlip(game, "player", coinFlipIdRef.current++);
        if (coinAttack) {
          setPendingCoinAttack({ eventId: coinAttack.id, attackerId: "player", result: coinAttack.result });
          setActiveCoinFlip(coinAttack);
          return;
        }
      }
      setGame((current) => advancePlayerAiTurnStep(current));
    }, getOpponentStepDelay(game));
    return () => window.clearTimeout(timeoutId);
  }, [game, isTurnFlowBlocked, isAiVsAi]);

  useEffect(() => {
    if (activeCoinFlip || coinFlipQueue.length === 0) return;
    const [nextFlip, ...rest] = coinFlipQueue;
    setActiveCoinFlip(nextFlip ?? null);
    setCoinFlipQueue(rest);
  }, [coinFlipQueue, activeCoinFlip]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (screen === "decks" || screen === "customisation" || screen === "modeSelect") {
        event.preventDefault();
        navigateToScreen("mainMenu");
        return;
      }
      if (screen !== "match" || game.gameOver) return;

      event.preventDefault();
      if (isTurnFlowBlocked) return;
      if (endTurnWarningActions) {
        setEndTurnWarningActions(null);
        return;
      }
      if (previewTarget) {
        setPreviewTarget(null);
        return;
      }
      if (discardOpen) {
        setDiscardOpen(false);
        return;
      }
      if (pendingSelection?.kind === "discardForScout") {
        setPendingSelection(null);
        return;
      }
      if (pendingSelection?.kind === "deckForScout") {
        setPendingSelection({ kind: "discardForScout", handIndex: pendingSelection.handIndex });
        return;
      }
      if (actionNotice && isBottomActionNotice(actionNotice)) {
        setActionNotice(null);
        return;
      }
      if (pendingSelection && !game.pendingPlayerChoice) {
        setPendingSelection(null);
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      setMenuOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, game.gameOver, game.pendingPlayerChoice, isTurnFlowBlocked, endTurnWarningActions, previewTarget, discardOpen, pendingSelection, actionNotice, menuOpen, pendingScreen, navigateToScreen]);

  useEffect(() => {
    const previousLog = previousLogRef.current;
    const newEntries = getNewLogEntries(game.log, previousLog);
    previousLogRef.current = game.log;
    if (newEntries.length === 0) return;

    const coinFlips = newEntries
      .map((entry) => toCoinFlipEvent(entry, coinFlipIdRef.current++))
      .filter((event): event is CoinFlipEvent => Boolean(event));
    const filteredCoinFlips = coinFlips.filter((event) => {
      const skipMessage = skipNextCoinLogMessageRef.current;
      if (skipMessage && event.message === skipMessage) {
        setAcknowledgedCoinLogMessage(event.message);
        skipNextCoinLogMessageRef.current = null;
        return false;
      }
      return true;
    });
    if (filteredCoinFlips.length > 0) {
      if (!activeCoinFlip) {
        const [nextFlip, ...restFlips] = filteredCoinFlips;
        if (nextFlip) setActiveCoinFlip(nextFlip);
        if (restFlips.length > 0) setCoinFlipQueue((queue) => [...queue, ...restFlips]);
      } else {
        setCoinFlipQueue((queue) => [...queue, ...filteredCoinFlips]);
      }
    }

    const koEntry = newEntries.find((entry) => entry.includes("was knocked out"));
    if (koEntry) {
      const koCause = getKoCauseFromEntries(newEntries, koEntry);
      setActionNotice(formatKoActionNotice(koEntry, koCause));
      return;
    }

    if (actionNotice?.startsWith("KO |")) return;
  }, [game.log, actionNotice, activeCoinFlip]);

  const applyPlayerGameUpdate = (update: (state: GameState) => GameState, noticeSource?: ActionNoticeSource) => {
    const next = update(game);
    setGame(next);
    if (!noticeSource) return;
  };

  const playCard = (handIndex: number) => {
    if (isTurnFlowBlocked) return;
    const cardId = player.hand[handIndex];
    if (!cardId || pendingSelection || game.phase !== "play" || game.pendingPlayerChoice) return;
    const card = getCard(cardId);
    const action = getPlayableAction(game, player, cardId);
    if (!action.canPlay) return;

    if (card.kind === "umamusume" && card.stage > 0) {
      const targets = getEvolutionTargets(game, player, card);
      if (targets.length > 1) {
        setPendingSelection({ kind: "evolveTarget", handIndex });
        setPreviewTarget(null);
        return;
      }
    }
    if (card.kind === "trainer" && card.effect.discardOtherCard) {
      setPendingSelection({ kind: "discardForScout", handIndex });
      setPreviewTarget(null);
      return;
    }
    if (card.kind === "trainer" && card.effect.heal) {
      setPendingSelection({ kind: "healTarget", handIndex });
      setPreviewTarget(null);
      return;
    }
    if (card.kind === "trainer" && card.effect.attachEnergyFromZoneToBench) {
      if (player.bench.length > 0) {
        setPendingSelection({ kind: "zoneBenchAttachTarget", handIndex });
        setPreviewTarget(null);
        return;
      }
    }
    if (card.kind === "trainer" && card.trainerType === "tool") {
      const targets = getToolTargets(player);
      if (targets.length > 1) {
        setPendingSelection({ kind: "toolTarget", handIndex });
        setPreviewTarget(null);
        return;
      }
    }
    if (card.kind === "trainer" && card.effect.rainbowUncapCrystal) {
      const targets = getRainbowUncapTargets(game, player);
      if (targets.length > 0) {
        setPendingSelection({ kind: "rainbowUncapTarget", handIndex });
        setPreviewTarget(null);
        return;
      }
    }
    if (card.kind === "trainer" && card.effect.searchRandomBasicUmamusume) {
      applyPlayerGameUpdate((current) => playHandCard(current, handIndex), { kind: "traineeScoutTicket" });
      return;
    }
    if (card.kind === "trainer" && card.effect.draw) {
      applyPlayerGameUpdate((current) => playHandCard(current, handIndex), { kind: "genericGain" });
      return;
    }
    setGame((current) => playHandCard(current, handIndex));
  };

  const playHandCardOnCenter = (handIndex: number) => {
    const cardId = player.hand[handIndex];
    if (!cardId) return;
    const card = getCard(cardId);
    if (card.kind === "umamusume") return;
    if (card.kind !== "trainer" || card.effect.heal) return;
    if (card.trainerType === "tool") return;
    if (card.trainerType === "stadium") return;
    playCard(handIndex);
  };

  const playHandCardOnStadiumSpot = (handIndex: number) => {
    const cardId = player.hand[handIndex];
    if (!cardId) return;
    const card = getCard(cardId);
    if (card.kind !== "trainer" || card.trainerType !== "stadium") return;
    playCard(handIndex);
  };

  const playHandCardOnUmamusume = (handIndex: number, umamusumeUid: number) => {
    if (isTurnFlowBlocked) return;
    const cardId = player.hand[handIndex];
    if (!cardId || pendingSelection || game.phase !== "play" || game.pendingPlayerChoice) return;
    const card = getCard(cardId);
    if (card.kind === "umamusume" && card.stage > 0) {
      setGame((current) => playHandCard(current, handIndex, { umamusumeTargetUid: umamusumeUid }));
      return;
    }
    if (card.kind === "trainer" && card.effect.heal) {
      setGame((current) => playHandCard(current, handIndex, { umamusumeTargetUid: umamusumeUid }));
      return;
    }
    if (card.kind === "trainer" && card.effect.attachEnergyFromZoneToBench && player.bench.some((umamusume) => umamusume.uid === umamusumeUid)) {
      setGame((current) => playHandCard(current, handIndex, { umamusumeTargetUid: umamusumeUid }));
      return;
    }
    if (card.kind === "trainer" && card.trainerType === "tool") {
      setGame((current) => playHandCard(current, handIndex, { umamusumeTargetUid: umamusumeUid }));
      return;
    }
    if (card.kind === "trainer" && card.effect.rainbowUncapCrystal) {
      const target = getRainbowUncapTargets(game, player).find((umamusume) => umamusume.uid === umamusumeUid);
      if (!target) return;
      setPendingSelection({ kind: "rainbowUncapEvolution", handIndex, umamusumeUid });
      setPreviewTarget(null);
    }
  };

  const playHandCardOnBenchSlot = (handIndex: number) => {
    if (isTurnFlowBlocked) return;
    const cardId = player.hand[handIndex];
    if (!cardId || pendingSelection || game.phase !== "play" || game.pendingPlayerChoice) return;
    const card = getCard(cardId);
    if (card.kind === "umamusume" && card.stage === 0) {
      setGame((current) => playHandCard(current, handIndex));
    }
  };

  const attachEnergyByDrop = (umamusumeUid: number) => {
    if (isTurnFlowBlocked) return;
    if (game.phase !== "play" || pendingSelection || game.pendingPlayerChoice) return;
    setGame((current) => attachPlayerEnergy(current, umamusumeUid));
  };

  const moveAbilityEnergyByDrop = (sourceUmamusumeUid: number, energyType: EnergyType) => {
    if (isTurnFlowBlocked) return;
    if (game.phase !== "play" || !pendingSelection || pendingSelection.kind !== "moveEnergyAbility" || game.pendingPlayerChoice) return;
    if (!pendingSelection.energyTypes.includes(energyType)) return;
    setGame((current) => usePlayerAbility(current, pendingSelection.abilityUmamusumeUid, sourceUmamusumeUid, energyType));
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  const chooseHandCard = (handIndex: number) => {
    if (isTurnFlowBlocked) return;
    if (!pendingSelection) return;
    if (!selectableHandIndexes?.has(handIndex)) return;
    if (pendingSelection.kind === "rainbowUncapEvolution") {
      setGame((current) => playHandCard(current, pendingSelection.handIndex, {
        umamusumeTargetUid: pendingSelection.umamusumeUid,
        rainbowEvolutionHandIndex: handIndex,
      }));
      setPendingSelection(null);
      setPreviewTarget(null);
      return;
    }
    if (pendingSelection.kind === "discardForAbility") {
      setGame((current) => usePlayerAbility(current, pendingSelection.abilityUmamusumeUid, pendingSelection.abilityUmamusumeUid, undefined, handIndex));
      setPendingSelection(null);
      setPreviewTarget(null);
      return;
    }
    if (pendingSelection.kind === "discardForScout") {
      const discardedCardId = player.hand[handIndex];
      const discardedCardName = discardedCardId ? getCard(discardedCardId).name : "that card";
      setPendingSelection({
        kind: "deckForScout",
        handIndex: pendingSelection.handIndex,
        discardHandIndex: handIndex,
        discardedCardName,
      });
      setPreviewTarget(null);
    }
  };

  const chooseScoutDeckCard = (deckCardIndex: number) => {
    if (isTurnFlowBlocked) return;
    if (!pendingSelection || pendingSelection.kind !== "deckForScout") return;
    applyPlayerGameUpdate(
      (current) => playHandCard(current, pendingSelection.handIndex, {
        discardHandIndex: pendingSelection.discardHandIndex,
        deckCardIndex,
      }),
      { kind: "makeDebutScout", discardedCardName: pendingSelection.discardedCardName },
    );
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  const selectUmamusume = (umamusume: UmamusumeInstance) => {
    if (isTurnFlowBlocked) return;
    if (game.pendingPlayerChoice) {
      setGame((current) => resolvePendingPlayerChoice(current, umamusume.uid));
      setPreviewTarget(null);
      return;
    }
    if (!pendingSelection) return;
    if (pendingSelection.kind === "attachEnergy") {
      setGame((current) => attachPlayerEnergy(current, umamusume.uid));
    } else if (pendingSelection.kind === "attackHealTarget") {
      const active = player.active;
      const attack = active ? getPrimaryAttack(getUmamusumeCard(active)) : null;
      const coinAttack = getPendingAttackCoinFlip(game, "player", coinFlipIdRef.current++);
      if (coinAttack) {
        setPendingCoinAttack({
          eventId: coinAttack.id,
          attackerId: "player",
          result: coinAttack.result,
          healTargetUid: umamusume.uid,
        });
        setActiveCoinFlip(coinAttack);
      } else if (attack?.draw) {
        applyPlayerGameUpdate((current) => playerAttack(current, undefined, umamusume.uid), { kind: "genericGain" });
      } else {
        setGame((current) => playerAttack(current, undefined, umamusume.uid));
      }
    } else if (pendingSelection.kind === "attackDamageTarget") {
      const active = player.active;
      const attack = active ? getPrimaryAttack(getUmamusumeCard(active)) : null;
      if (attack?.draw) {
        applyPlayerGameUpdate((current) => playerAttack(current, umamusume.uid), { kind: "genericGain" });
      } else {
        setGame((current) => playerAttack(current, umamusume.uid));
      }
    } else if (pendingSelection.kind === "abilityDamageTarget") {
      setGame((current) => usePlayerAbility(
        current,
        pendingSelection.abilityUmamusumeUid,
        pendingSelection.abilityUmamusumeUid,
        undefined,
        undefined,
        umamusume.uid,
      ));
    } else if (pendingSelection.kind === "retreatTarget") {
      setGame((current) => playerRetreat(current, umamusume.uid, pendingSelection.discardEnergyTypes));
    } else if (pendingSelection.kind === "rainbowUncapTarget") {
      setPendingSelection({ kind: "rainbowUncapEvolution", handIndex: pendingSelection.handIndex, umamusumeUid: umamusume.uid });
      setPreviewTarget(null);
      return;
    } else if (
      pendingSelection.kind === "healTarget"
      || pendingSelection.kind === "evolveTarget"
      || pendingSelection.kind === "zoneBenchAttachTarget"
      || pendingSelection.kind === "toolTarget"
    ) {
      setGame((current) => playHandCard(current, pendingSelection.handIndex, { umamusumeTargetUid: umamusume.uid }));
    }
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  if (screen === "mainMenu") {
    return (
      <main style={appStyle(true, selectedPlaymat.image, uiTextTone)}>
        <MainMenuScreen
          equippedDeck={equippedDeck}
          onPlay={playEquippedDeck}
          onOpenDecks={() => navigateToScreen("decks")}
          onOpenCustomisation={() => navigateToScreen("customisation")}
          onQuit={quitApp}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "modeSelect") {
    return (
      <main style={appStyle(true, selectedPlaymat.image, uiTextTone)}>
        <MatchModeScreen
          onBack={() => navigateToScreen("mainMenu")}
          onChooseMode={startWithMode}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "decks") {
    return (
      <main style={appStyle(false, selectedPlaymat.image, uiTextTone)}>
        <DeckBrowserScreen
          decks={premadeDecks}
          equippedDeckId={equippedDeck.id}
          onEquipDeck={(deckId) => setEquippedDeckId(deckId)}
          onBack={() => navigateToScreen("mainMenu")}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "customisation") {
    return (
      <main style={appStyle(false, selectedPlaymat.image, uiTextTone)}>
        <CustomisationScreen
          settings={customisation}
          onChange={setCustomisation}
          onBack={() => navigateToScreen("mainMenu")}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  return (
    <main style={appStyle(false, undefined, uiTextTone)}>
      <div style={matchBackgroundLayerStyle(selectedPlaymat.image, showPlayerPlaymat ? 1 : 0)} />
      <div style={matchBackgroundLayerStyle(opponentPlaymat.image, showOpponentPlaymat ? 1 : 0)} />
      <div style={contentStyle}>
        <section style={duelGridStyle}>
          <SideBoard
            side={displayedPlayerSide}
            sideId="player"
            onInspect={openPreview}
            setupMode={game.phase === "setup"}
            abilityReadyUmamusumeUids={abilityReadyUmamusumeUids}
            selectableUmamusumeUids={game.phase === "play" ? playerSelectableUmamusumeUids : undefined}
            abilityEnergyTypes={abilityEnergyTypes}
            onUmamusumeSelect={selectUmamusume}
            onSetupDropActive={applySetupActive}
            onSetupDropBench={applySetupBench}
            onSetupPromoteToActive={promoteSetupBenchToActive}
            onHandCardDropOnActive={playHandCardOnUmamusume}
            onHandCardDropOnBenchSlot={playHandCardOnBenchSlot}
            onHandCardDropOnUmamusume={playHandCardOnUmamusume}
            onEnergyDropOnUmamusume={attachEnergyByDrop}
            onAbilityEnergyDropOnActive={moveAbilityEnergyByDrop}
            setupDragHandIndexByUid={setupDragHandIndexByUid}
          />
          <SideBoard
            key={hiddenOpponent ? "opponent-setup-hidden" : "opponent-live"}
            side={displayedOpponentSide}
            sideId="opponent"
            hidden={opponentBoardHidden}
            onInspect={openPreview}
            selectableUmamusumeUids={game.phase === "play" ? opponentSelectableUmamusumeUids : undefined}
            onUmamusumeSelect={selectUmamusume}
            sleeveImage={opponentSleeve.image}
            animateSetupReveal={game.phase === "setup" && opponentBoardHidden && opponentSetupRevealToken > 0}
            setupRevealToken={opponentSetupRevealToken}
            {...(hiddenOpponentBenchCount !== undefined ? { hiddenBenchCount: hiddenOpponentBenchCount } : {})}
          />
          {game.phase === "play" && (
            <>
              <StadiumSpot state={game} abilityReady={stadiumAbilityReady} onDropHandCard={playHandCardOnStadiumSpot} onInspect={openPreview} />
              <PlayDropZone onDropHandCard={playHandCardOnCenter} />
            </>
          )}
        </section>

        <section style={handPanelStyle}>
          {game.phase === "setup" ? (
            <PregameSetupPanel
              game={game}
              activeIndex={setupActiveIndex}
              benchIndexes={setupBenchIndexes}
              menuOpen={menuOpen}
              log={game.log}
              canSurrender={!game.gameOver && !isTurnFlowBlocked}
              onToggleMenu={toggleMenu}
              onSurrender={handleSurrender}
              onSetActive={applySetupActive}
              onReady={() => {
                if (isTurnFlowBlocked) return;
                if (setupActiveIndex === null) return;
                setGame((current) => completePregameSetup(current, setupActiveIndex, setupBenchIndexes));
              }}
              onInspect={openPreview}
              sleeveImage={selectedSleeve.image}
            />
          ) : (
            <>
              <PlayHandHeader
                canAttach={canAttachEnergy(game, player) && !isBusyWithChoice}
                energyRefreshKey={game.turnNumber}
                energyType={nextPlayerEnergy}
                extraCount={Math.max(0, player.energyZone.length - 1)}
                canEndTurn={!game.gameOver && game.currentSide === "player" && !isBusyWithChoice}
                onEndTurn={handleEndTurn}
                menuOpen={menuOpen}
                log={game.log}
                canSurrender={!game.gameOver && !isTurnFlowBlocked}
                onToggleMenu={toggleMenu}
                onSurrender={handleSurrender}
              />
              <Hand
                state={game}
                onInspect={openPreview}
                selectableHandIndexes={selectableHandIndexes}
                onChooseHandCard={chooseHandCard}
                onOpenDiscard={() => setDiscardOpen(true)}
                sleeveImage={selectedSleeve.image}
              />
            </>
          )}
        </section>
      </div>
      {(() => {
        const topBanner = getTopActionBanner(game);
        return topBanner ? <OpponentActionBanner title={topBanner.title} message={topBanner.message} paused={topBanner.paused} /> : null;
      })()}
      {activeCoinFlip && (
        <CoinFlipOverlay
          key={activeCoinFlip.id}
          result={activeCoinFlip.result}
          message={activeCoinFlip.message}
          onContinue={() => {
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
          }}
        />
      )}
      {activePendingSelection && (
        <SelectionPrompt
          pending={activePendingSelection}
          onCancel={game.pendingPlayerChoice ? () => undefined : cancelPendingSelection}
          nextEnergyType={nextPlayerEnergy}
          onRetreatDiscardAdjust={adjustRetreatDiscard}
          onConfirmRetreatDiscard={confirmRetreatDiscard}
        />
      )}
      <CardPreview
        state={game}
        target={previewTarget}
        canUseAttack={Boolean(!isTurnFlowBlocked && player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canAttack(game, player))}
        canUseRetreat={Boolean(!isTurnFlowBlocked && player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canRetreat(game, player))}
        canUseAbility={Boolean(
          !isTurnFlowBlocked && ((previewTarget?.umamusume && previewTarget.sideId === "player" && canUseUmamusumeAbility(game, player, previewTarget.umamusume.uid))
          || (
            previewTarget?.card.kind === "trainer"
            && previewTarget.card.trainerType === "stadium"
            && Boolean(previewTarget.card.effect.shuffleHandIntoDeckDraw)
            && canUseStadium(game, player)
          ))
        )}
        onAttack={() => {
          if (isTurnFlowBlocked) return;
          if (!player.active) return;
          const attack = getPrimaryAttack(getUmamusumeCard(player.active));
          if (attack.targetOpponent === "any") {
            setPendingSelection({ kind: "attackDamageTarget" });
            setPreviewTarget(null);
            return;
          }
          if (attack.heal && attack.healTarget === "any") {
            const damagedTargets = getDamagedUmamusume(player);
            if (damagedTargets.length > 0) {
              setPendingSelection({ kind: "attackHealTarget" });
              setPreviewTarget(null);
              return;
            }
          }
          const coinAttack = getPendingAttackCoinFlip(game, "player", coinFlipIdRef.current++);
          if (coinAttack) {
            setPendingCoinAttack({ eventId: coinAttack.id, attackerId: "player", result: coinAttack.result });
            setActiveCoinFlip(coinAttack);
            setPreviewTarget(null);
            return;
          }
          if (attack.draw) {
            applyPlayerGameUpdate(playerAttack, { kind: "genericGain" });
          } else {
            setGame((current) => playerAttack(current));
          }
          setPreviewTarget(null);
        }}
        onRetreat={() => {
          if (isTurnFlowBlocked) return;
          const active = player.active;
          if (!active) return;
          const retreatCost = getDisplayedRetreatCost(game, player, active);
          if (retreatCost <= 0) {
            setPendingSelection({ kind: "retreatTarget", discardEnergyTypes: [] });
          } else {
            const availableEnergyCounts = RETREAT_ENERGY_ORDER.reduce<Partial<Record<EnergyType, number>>>((counts, energyType) => {
              const amount = active.energies[energyType];
              if (amount > 0) counts[energyType] = amount;
              return counts;
            }, {});
            setPendingSelection({
              kind: "retreatDiscard",
              retreatCost,
              availableEnergyCounts,
              selectedEnergyCounts: {},
            });
          }
          setPreviewTarget(null);
        }}
        onAbility={() => {
          if (isTurnFlowBlocked) return;
          if (
            previewTarget?.card.kind === "trainer"
            && previewTarget.card.trainerType === "stadium"
            && previewTarget.card.effect.shuffleHandIntoDeckDraw
          ) {
            setGame(playerUseStadium);
            setPreviewTarget(null);
            return;
          }
          if (!previewTarget?.umamusume || previewTarget.sideId !== "player") return;
          const ability = getUmamusumeCard(previewTarget.umamusume).ability;
          if (!ability) return;
          if (ability.moveBenchedEnergyToActive) {
            const energyTypes = Array.isArray(ability.moveBenchedEnergyToActive) ? ability.moveBenchedEnergyToActive : [ability.moveBenchedEnergyToActive];
            setPendingSelection({ kind: "moveEnergyAbility", abilityUmamusumeUid: previewTarget.umamusume.uid, energyTypes });
          } else if (ability.damageOpponent) {
            if (ability.damageOpponentTarget === "any") {
              setPendingSelection({ kind: "abilityDamageTarget", abilityUmamusumeUid: previewTarget.umamusume.uid });
            } else {
              setGame((current) => usePlayerAbility(current, previewTarget.umamusume!.uid, previewTarget.umamusume!.uid));
            }
          } else if (ability.discardToDraw && player.hand.length >= ability.discardToDraw.discard) {
            setPendingSelection({ kind: "discardForAbility", abilityUmamusumeUid: previewTarget.umamusume.uid });
          } else if (ability.coinFlipDrawOrActiveDamageCounter) {
            setGame((current) => usePlayerAbility(current, previewTarget.umamusume!.uid, previewTarget.umamusume!.uid));
          } else {
            return;
          }
          setPreviewTarget(null);
        }}
        onInspect={openPreview}
        onClose={closePreview}
      />
      <EndTurnWarningModal
        actions={endTurnWarningActions}
        suppressForGame={suppressEndTurnWarningForGame}
        onSuppressForGameChange={setSuppressEndTurnWarningForGame}
        onCancel={() => setEndTurnWarningActions(null)}
        onConfirm={() => {
          setEndTurnWarningActions(null);
          setGame(playerEndTurn);
        }}
      />
      {discardOpen && (
        <DiscardPileModal
          cardIds={player.discard}
          onInspect={(card) => setPreviewTarget({ card })}
          onClose={() => setDiscardOpen(false)}
        />
      )}
      {pendingSelection?.kind === "deckForScout" && (
        <DeckChoiceModal
          cardIds={player.deck}
          onChoose={chooseScoutDeckCard}
          onClose={() => setPendingSelection({ kind: "discardForScout", handIndex: pendingSelection.handIndex })}
        />
      )}
      {actionNotice && (
        <ActionNotice
          notice={actionNotice}
          tone={getActionNoticeTone(actionNotice)}
          placement={isBottomActionNotice(actionNotice) ? "bottom" : "top"}
          interactive={isBottomActionNotice(actionNotice)}
          onClose={() => setActionNotice(null)}
        />
      )}
      {game.gameOver && <GameOverModal game={game} onPlayAgain={() => startNewGame()} onMainMenu={returnToMainMenu} />}
      <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
    </main>
  );
}
