import { type CSSProperties, useEffect, useRef, useState } from "react";
import { MAX_BENCH, premadeDecks } from "../../shared/src/gameData";
import { Hand } from "./components/boards/Hand";
import { SideBoard } from "./components/boards/SideBoard";
import {
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
} from "./game/engine";
import type { EnergyType, GameState, SideId, UmamusumeInstance } from "../../shared/src/types";
import type { InspectTarget } from "./inspect";
import type { ActionNoticeSource, AppScreen, PendingSelection } from "./types/ui";
import { getDeckById, readEquippedDeckId, writeEquippedDeckId, pickRandomOpponentDeck } from "./utils/deck";
import {
  createSetupPreviewSide,
  createSetupEmptyOpponentSide,
  createSetupHiddenOpponentSide,
  getSelectableUmamusumeUids,
  getOpponentStepDelay,
} from "./match/utils/helpers";
import { CardPreview } from "./match/modals/CardPreview";
import { DiscardPileModal } from "./match/modals/DiscardPileModal";
import { DeckChoiceModal } from "./match/modals/DeckChoiceModal";
import { PlayDropZone } from "./match/board/PlayDropZone";
import { StadiumSpot } from "./match/board/StadiumSpot";
import { PlayHandHeader } from "./match/controls/HandControls";
import { PregameSetupPanel } from "./match/setup/PregameSetupPanel";
import { GameOverModal } from "./match/modals/GameOverModal";
import { EndTurnWarningModal } from "./match/modals/EndTurnWarningModal";
import { SelectionPrompt } from "./match/controls/SelectionPrompt";
import { OpponentActionBanner } from "./match/feedback/OpponentActionBanner";
import { ActionNotice } from "./match/feedback/ActionNotice";
import { CoinFlipOverlay } from "./match/feedback/CoinFlipOverlay";
import { MainMenuScreen } from "./screens/MainMenuScreen";
import { DeckBrowserScreen } from "./screens/DeckBrowserScreen";
import { CustomisationScreen } from "./screens/CustomisationScreen";
import {
  getPlaymatTextTone,
  getSelectedPlaymat,
  getSelectedSleeve,
  getRandomCustomisationSettings,
  readCustomisationSettings,
  writeCustomisationSettings,
  type CustomisationSettings,
} from "./utils/customisation";

type CoinFlipEvent = {
  id: number;
  result: "heads" | "tails";
  message: string;
};

type PendingCoinAttack = {
  eventId: number;
  attackerId: SideId;
  result: "heads" | "tails";
  attackTargetUid?: number;
  healTargetUid?: number;
};

const SCREEN_FADE_MS = 120;

export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [pendingScreen, setPendingScreen] = useState<AppScreen | null>(null);
  const [screenFadeOverlayOpacity, setScreenFadeOverlayOpacity] = useState(0);
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
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
  const [pendingCoinAttack, setPendingCoinAttack] = useState<PendingCoinAttack | null>(null);
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opponentSetupRevealToken, setOpponentSetupRevealToken] = useState(0);
  const previousLogRef = useRef<string[]>([]);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
  const equippedDeck = getDeckById(equippedDeckId);
  const selectedPlaymat = getSelectedPlaymat(customisation);
  const uiTextTone = getPlaymatTextTone(customisation);
  const selectedSleeve = getSelectedSleeve(customisation);
  const opponentPlaymat = getSelectedPlaymat(opponentCustomisation);
  const opponentSleeve = getSelectedSleeve(opponentCustomisation);
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
  const isBusyWithChoice = Boolean(pendingSelection || game.pendingPlayerChoice || endTurnWarningActions);
  const isCoinFlipBlocking = Boolean(activeCoinFlip || coinFlipQueue.length > 0);
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

  const startNewGame = () => {
    previousLogRef.current = [];
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setPendingCoinAttack(null);
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
    startNewGame();
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
    if (activeCoinFlip || coinFlipQueue.length === 0) return;
    const [nextFlip, ...rest] = coinFlipQueue;
    setActiveCoinFlip(nextFlip ?? null);
    setCoinFlipQueue(rest);
  }, [coinFlipQueue, activeCoinFlip]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (screen === "decks" || screen === "customisation") {
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
    if (coinFlips.length > 0) {
      setCoinFlipQueue((queue) => [...queue, ...coinFlips]);
    }

    const koEntry = newEntries.find((entry) => entry.includes("was knocked out"));
    if (koEntry) {
      const koCause = getKoCauseFromEntries(newEntries, koEntry);
      setActionNotice(formatKoActionNotice(koEntry, koCause));
      return;
    }

    if (actionNotice?.startsWith("KO |")) return;
  }, [game.log, actionNotice]);

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
              setGame((current) =>
                coinAttack.attackerId === "player"
                  ? playerAttack(current, coinAttack.attackTargetUid, coinAttack.healTargetUid, coinAttack.result)
                  : advanceOpponentTurnStep(current, coinAttack.result),
              );
              setPendingCoinAttack(null);
            }
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
      {game.gameOver && <GameOverModal game={game} onPlayAgain={startNewGame} onMainMenu={returnToMainMenu} />}
      <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
    </main>
  );
}

function appStyle(isMenu = false, playmatImage?: string | null, textTone: "dark" | "light" = "dark"): CSSProperties {
  const uiTextColor = textTone === "light" ? "#f8fafc" : "#05070a";
  const uiTextShadow = textTone === "light"
    ? "0 1px 0 rgba(0, 0, 0, 0.82), 0 0 1px rgba(0, 0, 0, 0.94), 0 2px 12px rgba(0, 0, 0, 0.65)"
    : "0 1px 0 rgba(255, 255, 255, 0.92), 0 0 1px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(0, 0, 0, 0.35)";
  const uiMutedTextColor = textTone === "light" ? "rgba(226, 232, 240, 0.76)" : "rgba(100, 113, 104, 0.52)";

  return {
    height: isMenu ? "100%" : "auto",
    minHeight: "100%",
    position: "relative",
    overflow: isMenu ? "hidden" : "clip",
    padding: isMenu ? 0 : 16,
    boxSizing: "border-box",
    color: "var(--ui-text-color)",
    textShadow: "var(--ui-text-shadow)",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--ui-text-color": uiTextColor,
    "--ui-text-shadow": uiTextShadow,
    "--ui-muted-text-color": uiMutedTextColor,
    background: playmatImage
      ? `url("${playmatImage}") center / cover fixed no-repeat`
      : "radial-gradient(circle at 18% 8%, rgba(214, 81, 157, 0.2), transparent 28%), radial-gradient(circle at 84% 20%, rgba(63, 159, 92, 0.16), transparent 30%), linear-gradient(135deg, #101820 0%, #223733 54%, #4a2647 100%)",
  } as CSSProperties;
}

function screenFadeOverlayStyle(opacity: number): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    pointerEvents: "none",
    background: "#000000",
    opacity,
    transition: `opacity ${SCREEN_FADE_MS}ms ease`,
  };
}

const contentStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  maxWidth: 1760,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

function matchBackgroundLayerStyle(playmatImage: string | null | undefined, opacity: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    opacity,
    transition: "opacity 420ms ease",
    background: playmatImage ? `url("${playmatImage}") center / cover fixed no-repeat` : "none",
  };
}

const duelGridStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const handPanelStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.46)",
  background: "rgba(148, 163, 184, 0.08)",
  padding: 10,
  boxShadow: "0 24px 80px rgba(17, 24, 39, 0.14)",
};

const RETREAT_ENERGY_ORDER: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

function getNewLogEntries(currentLog: string[], previousLog: string[]): string[] {
  if (previousLog.length === 0) return currentLog;

  for (let startIndex = 0; startIndex < currentLog.length; startIndex += 1) {
    if (currentLog[startIndex] !== previousLog[0]) continue;
    const overlap = Math.min(currentLog.length - startIndex, previousLog.length);
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (currentLog[startIndex + index] !== previousLog[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return currentLog.slice(0, startIndex);
  }

  return currentLog;
}

function getKoCauseFromEntries(newEntries: string[], koEntry: string): string | null {
  if (koEntry.includes(" by ")) return null;

  const maxHpCause = newEntries.find((entry) => entry.includes("max HP was reduced"));
  if (maxHpCause) return "max HP reduction";

  const attackCause = newEntries.find((entry) => entry.includes("attacked with "));
  if (!attackCause) return null;

  const attackDetails = attackCause.replace(/^You attacked with /, "").replace(/^Opponent attacked with /, "");
  return `attack: ${attackDetails}`;
}

function formatKoActionNotice(koEntry: string, koCause: string | null): string {
  const normalizedEntry = koEntry.endsWith(".") ? koEntry.slice(0, -1) : koEntry;
  return koCause
    ? `KO | ${normalizedEntry} | Cause: ${koCause}`
    : `KO | ${normalizedEntry}`;
}

function getTopActionBanner(game: GameState): { title: string; message: string; paused: boolean } | null {
  if (game.phase !== "play" || game.gameOver) return null;

  if (game.pendingPlayerChoice && game.currentSide === "opponent") {
    return {
      title: "Opponent is waiting",
      message: game.log[0] ?? "Choose your next active Umamusume.",
      paused: true,
    };
  }

  const latest = game.log[0];
  if (game.currentSide === "player") {
    return {
      title: "Your turn",
      message: latest?.startsWith("You ") ? latest : "Your turn.",
      paused: false,
    };
  }

  return {
    title: "Opponent turn",
    message: latest && (latest.includes("Opponent") || latest.includes("coin flip")) ? latest : "Opponent planned their turn.",
    paused: false,
  };
}


function isBottomActionNotice(notice: string): boolean {
  return notice.startsWith("KO |");
}

function getActionNoticeTone(notice: string): "default" | "danger" | "info" {
  if (notice.startsWith("KO | Opponent's")) return "info";
  if (notice.startsWith("KO |")) return "danger";
  return "default";
}

function getPendingAttackCoinFlip(state: GameState, attackerId: SideId, id: number): CoinFlipEvent | null {
  if (state.phase !== "play") return null;
  if (attackerId === "opponent" && (state.currentSide !== "opponent" || state.opponentTurnStep !== "attack")) return null;
  if (attackerId === "player" && state.currentSide !== "player") return null;

  const attacker = state.sides[attackerId];
  if (!attacker.active) return null;
  const attack = getPrimaryAttack(getUmamusumeCard(attacker.active));
  if (!attack.coinBonus && !attack.drawOnHeads) return null;

  const result = Math.random() >= 0.5 ? "heads" : "tails";
  const actor = attackerId === "player" ? "You" : "Opponent";
  return { id, result, message: `${actor} flipped a coin and got 1x ${result}.` };
}

function toCoinFlipEvent(entry: string, id: number): CoinFlipEvent | null {
  const lowered = entry.toLowerCase();
  if (!lowered.includes("coin flip was") && !lowered.includes("flipped a coin and got") && !lowered.includes("flip a coin and got")) return null;
  const resultMatch = entry.match(/\b(heads|tails)\b/i);
  if (!resultMatch) return null;
  const result = resultMatch[1]?.toLowerCase() === "tails" ? "tails" : "heads";
  return { id, result, message: entry };
}
