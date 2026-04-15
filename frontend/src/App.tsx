import { type CSSProperties, useEffect, useRef, useState } from "react";
import { MAX_BENCH, premadeDecks } from "../../shared/src/gameData";
import { Hand } from "./components/Hand";
import { SideBoard } from "./components/SideBoard";
import {
  advanceRivalTurnStep,
  attachPlayerEnergy,
  canAttack,
  canAttachEnergy,
  canRetreat,
  canUseActiveAbility,
  completePregameSetup,
  createGame,
  getAllPokemon,
  getCard,
  getDamagedPokemon,
  getEvolutionTargets,
  getPrimaryAttack,
  getPokemonCard,
  getPlayableAction,
  playerAttack,
  playerEndTurn,
  playerRetreat,
  playerSurrender,
  playHandCard,
  resolvePendingPlayerChoice,
  usePlayerActiveAbility,
} from "./game/engine";
import type { GameState, PokemonInstance } from "../../shared/src/types";
import type { InspectTarget } from "./inspect";
import type { ActionNoticeSource, AppScreen, PendingSelection } from "./types/ui";
import { getDeckById, readEquippedDeckId, writeEquippedDeckId } from "./utils/deck";
import {
  createSetupPreviewSide,
  createSetupHiddenRivalSide,
  getSelectablePokemonUids,
  getRivalStepDelay,
  getRivalBannerMessage,
  getOpponentAttackNotice,
  getActionNotice,
} from "./match/helpers";
import { CardPreview } from "./match/CardPreview";
import { PlayDropZone } from "./match/PlayDropZone";
import { StadiumSlot } from "./match/StadiumSlot";
import { PlayHandHeader } from "./match/HandControls";
import { PregameSetupPanel } from "./match/PregameSetupPanel";
import { GameOverModal } from "./match/GameOverModal";
import { ChoiceModal } from "./match/ChoiceModal";
import { SelectionPrompt } from "./match/SelectionPrompt";
import { RivalActionBanner } from "./match/RivalActionBanner";
import { ActionNotice } from "./match/ActionNotice";
import { MainMenuScreen } from "./screens/MainMenuScreen";
import { DeckBrowserScreen } from "./screens/DeckBrowserScreen";

export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
  const [game, setGame] = useState(() => createGame(getDeckById(readEquippedDeckId()).cardIds));
  const [previewTarget, setPreviewTarget] = useState<InspectTarget | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const previousSideRef = useRef<GameState["currentSide"] | null>(null);
  const equippedDeck = getDeckById(equippedDeckId);
  const player = game.sides.player;
  const nextPlayerEnergy = player.energyZone[0] ?? null;
  const activePendingSelection = game.pendingPlayerChoice ? ({ kind: "replaceActive" } as PendingSelection) : pendingSelection;
  const selectablePokemonUids = getSelectablePokemonUids(game, activePendingSelection);
  const hiddenRival = game.phase === "setup" && !game.setup?.rivalRevealed;
  const isBusyWithChoice = Boolean(pendingSelection || game.pendingPlayerChoice);
  const displayedPlayerSide = game.phase === "setup" ? createSetupPreviewSide(player, setupActiveIndex, setupBenchIndexes) : player;
  const displayedRivalSide = hiddenRival ? createSetupHiddenRivalSide(game.sides.rival) : game.sides.rival;
  const hiddenRivalBenchCount = hiddenRival ? game.sides.rival.bench.length : undefined;
  const setupDragHandIndexByUid = game.phase === "setup"
    ? {
        ...(setupActiveIndex !== null ? { [-1]: setupActiveIndex } : {}),
        ...Object.fromEntries(setupBenchIndexes.map((handIndex, order) => [-(order + 2), handIndex])),
      }
    : {};

  const applySetupActive = (index: number) => {
    const cardId = player.hand[index];
    const card = cardId ? getCard(cardId) : null;
    if (!card || card.kind !== "pokemon" || card.stage !== 0) return;
    setSetupActiveIndex(index);
    setSetupBenchIndexes((current) => current.filter((entry) => entry !== index));
  };

  const promoteSetupBenchToActive = (index: number) => {
    const cardId = player.hand[index];
    const card = cardId ? getCard(cardId) : null;
    if (!card || card.kind !== "pokemon" || card.stage !== 0) return;
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
    const cardId = player.hand[index];
    const card = cardId ? getCard(cardId) : null;
    if (!card || card.kind !== "pokemon" || card.stage !== 0) return;
    if (index === setupActiveIndex) return;
    setSetupBenchIndexes((current) => {
      if (current.includes(index) || current.length >= MAX_BENCH) return current;
      return [...current, index];
    });
  };

  const startNewGame = () => {
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setPreviewTarget(null);
    setActionNotice(null);
    setMenuOpen(false);
    setGame(createGame(equippedDeck.cardIds));
  };

  const playEquippedDeck = () => {
    startNewGame();
    setScreen("match");
  };

  const quitApp = () => {
    window.close();
    window.setTimeout(() => {
      window.location.replace("about:blank");
    }, 80);
  };

  const clearSelection = () => setPendingSelection(null);
  const openPreview = (target: InspectTarget) => setPreviewTarget(target);
  const closePreview = () => setPreviewTarget(null);

  useEffect(() => {
    writeEquippedDeckId(equippedDeck.id);
  }, [equippedDeck.id]);

  useEffect(() => {
    if (!actionNotice) return undefined;
    const timeoutId = window.setTimeout(() => setActionNotice(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [actionNotice]);

  useEffect(() => {
    if (!previewTarget?.pokemon || !previewTarget.sideId) return;
    if (game.phase === "setup") return;
    const liveSide = previewTarget.sideId === "player" ? game.sides.player : game.sides.rival;
    const livePokemon = getAllPokemon(liveSide).find((pokemon) => pokemon.uid === previewTarget.pokemon?.uid);
    if (!livePokemon) {
      setPreviewTarget(null);
      return;
    }
    const liveCard = getPokemonCard(livePokemon);
    if (livePokemon !== previewTarget.pokemon || liveCard.id !== previewTarget.card.id) {
      setPreviewTarget({
        ...previewTarget,
        card: liveCard,
        pokemon: livePokemon,
        isActive: liveSide.active?.uid === livePokemon.uid,
      });
    }
  }, [game, previewTarget]);

  useEffect(() => {
    if (game.pendingPlayerChoice) setPreviewTarget(null);
  }, [game.pendingPlayerChoice]);

  useEffect(() => {
    if (!game.gameOver) return;
    setPendingSelection(null);
    setPreviewTarget(null);
    setMenuOpen(false);
  }, [game.gameOver]);

  useEffect(() => {
    if (game.phase !== "setup") return;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setPreviewTarget(null);
  }, [game.phase, player.hand]);

  useEffect(() => {
    if (game.phase !== "play" || game.currentSide !== "rival" || game.gameOver || game.pendingPlayerChoice) return undefined;
    const timeoutId = window.setTimeout(() => {
      setGame((current) => advanceRivalTurnStep(current));
    }, getRivalStepDelay(game));
    return () => window.clearTimeout(timeoutId);
  }, [game]);

  useEffect(() => {
    const previousSide = previousSideRef.current;
    previousSideRef.current = game.currentSide;
    if (previousSide !== "rival" || game.currentSide === "rival" || game.gameOver) return;
    const notice = getOpponentAttackNotice(game);
    if (notice) setActionNotice(notice);
  }, [game]);

  const applyPlayerGameUpdate = (update: (state: GameState) => GameState, noticeSource?: ActionNoticeSource) => {
    const next = update(game);
    setGame(next);
    if (!noticeSource) return;
    const notice = getActionNotice(game, next, noticeSource);
    setActionNotice(notice);
  };

  const playCard = (handIndex: number) => {
    const cardId = player.hand[handIndex];
    if (!cardId || pendingSelection || game.phase !== "play" || game.pendingPlayerChoice) return;
    const card = getCard(cardId);
    const action = getPlayableAction(game, player, cardId);
    if (!action.canPlay) return;

    if (card.kind === "pokemon" && card.stage > 0) {
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
    if (card.kind === "trainer" && card.effect.searchRandomBasicPokemon) {
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
    if (card.kind !== "trainer" || card.effect.heal) return;
    if (card.trainerType === "stadium") return;
    playCard(handIndex);
  };

  const playHandCardOnStadiumSlot = (handIndex: number) => {
    const cardId = player.hand[handIndex];
    if (!cardId) return;
    const card = getCard(cardId);
    if (card.kind !== "trainer" || card.trainerType !== "stadium") return;
    playCard(handIndex);
  };

  const playHandCardOnPokemon = (handIndex: number, pokemonUid: number) => {
    const cardId = player.hand[handIndex];
    if (!cardId || pendingSelection || game.phase !== "play" || game.pendingPlayerChoice) return;
    const card = getCard(cardId);
    if (card.kind === "pokemon" && card.stage > 0) {
      setGame((current) => playHandCard(current, handIndex, { pokemonTargetUid: pokemonUid }));
      return;
    }
    if (card.kind === "trainer" && card.effect.heal) {
      setGame((current) => playHandCard(current, handIndex, { pokemonTargetUid: pokemonUid }));
    }
  };

  const playHandCardOnBenchSlot = (handIndex: number) => {
    const cardId = player.hand[handIndex];
    if (!cardId || pendingSelection || game.phase !== "play" || game.pendingPlayerChoice) return;
    const card = getCard(cardId);
    if (card.kind === "pokemon" && card.stage === 0) {
      setGame((current) => playHandCard(current, handIndex));
    }
  };

  const attachEnergyByDrop = (pokemonUid: number) => {
    if (game.phase !== "play" || pendingSelection || game.pendingPlayerChoice) return;
    setGame((current) => attachPlayerEnergy(current, pokemonUid));
  };

  const retreatByDrop = (benchPokemonUid: number) => {
    if (game.phase !== "play" || pendingSelection || game.pendingPlayerChoice) return;
    setGame((current) => playerRetreat(current, benchPokemonUid));
  };

  const selectPokemon = (pokemon: PokemonInstance) => {
    if (game.pendingPlayerChoice) {
      setGame((current) => resolvePendingPlayerChoice(current, pokemon.uid));
      setPreviewTarget(null);
      return;
    }
    if (!pendingSelection) return;
    if (pendingSelection.kind === "attachEnergy") {
      setGame((current) => attachPlayerEnergy(current, pokemon.uid));
    } else if (pendingSelection.kind === "attackHealTarget") {
      const active = player.active;
      const attack = active ? getPrimaryAttack(getPokemonCard(active)) : null;
      if (attack?.draw) {
        applyPlayerGameUpdate((current) => playerAttack(current, pokemon.uid), { kind: "genericGain" });
      } else {
        setGame((current) => playerAttack(current, pokemon.uid));
      }
    } else if (pendingSelection.kind === "moveEnergyAbility") {
      setGame((current) => usePlayerActiveAbility(current, pokemon.uid));
    } else if (pendingSelection.kind === "retreatTarget") {
      setGame((current) => playerRetreat(current, pokemon.uid));
    } else if (pendingSelection.kind === "healTarget" || pendingSelection.kind === "evolveTarget") {
      setGame((current) => playHandCard(current, pendingSelection.handIndex, { pokemonTargetUid: pokemon.uid }));
    }
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  if (screen === "mainMenu") {
    return (
      <main style={appStyle(true)}>
        <MainMenuScreen
          equippedDeck={equippedDeck}
          onPlay={playEquippedDeck}
          onOpenDecks={() => setScreen("decks")}
          onQuit={quitApp}
        />
      </main>
    );
  }

  if (screen === "decks") {
    return (
      <main style={appStyle()}>
        <DeckBrowserScreen
          decks={premadeDecks}
          equippedDeckId={equippedDeck.id}
          onEquipDeck={(deckId) => setEquippedDeckId(deckId)}
          onBack={() => setScreen("mainMenu")}
        />
      </main>
    );
  }

  return (
    <main style={appStyle()}>
      <div style={contentStyle}>
        <section style={duelGridStyle}>
          <SideBoard
            side={displayedPlayerSide}
            sideId="player"
            onInspect={openPreview}
            setupMode={game.phase === "setup"}
            activeRetreatDraggable={game.phase === "play" && canRetreat(game, player) && !isBusyWithChoice}
            selectablePokemonUids={game.phase === "play" ? selectablePokemonUids : undefined}
            onPokemonSelect={selectPokemon}
            onSetupDropActive={applySetupActive}
            onSetupDropBench={applySetupBench}
            onSetupPromoteToActive={promoteSetupBenchToActive}
            onHandCardDropOnActive={playHandCardOnPokemon}
            onHandCardDropOnBenchSlot={playHandCardOnBenchSlot}
            onHandCardDropOnPokemon={playHandCardOnPokemon}
            onEnergyDropOnPokemon={attachEnergyByDrop}
            onRetreatDropOnPokemon={retreatByDrop}
            setupDragHandIndexByUid={setupDragHandIndexByUid}
          />
          <SideBoard
            key={hiddenRival ? "rival-setup-hidden" : "rival-live"}
            side={displayedRivalSide}
            sideId="rival"
            hidden={hiddenRival}
            onInspect={openPreview}
            {...(hiddenRivalBenchCount !== undefined ? { hiddenBenchCount: hiddenRivalBenchCount } : {})}
          />
          {game.phase === "play" && (
            <>
              <StadiumSlot state={game} onDropHandCard={playHandCardOnStadiumSlot} onInspect={openPreview} />
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
              onSetActive={applySetupActive}
              onReady={() => {
                if (setupActiveIndex === null) return;
                setGame((current) => completePregameSetup(current, setupActiveIndex, setupBenchIndexes));
              }}
              onInspect={openPreview}
            />
          ) : (
            <>
              <PlayHandHeader
                canAttach={canAttachEnergy(game, player) && !isBusyWithChoice}
                energyType={nextPlayerEnergy}
                extraCount={Math.max(0, player.energyZone.length - 1)}
                canEndTurn={!game.gameOver && game.currentSide === "player" && !isBusyWithChoice}
                onEndTurn={() => setGame(playerEndTurn)}
                menuOpen={menuOpen}
                log={game.log}
                canSurrender={!game.gameOver}
                onToggleMenu={() => setMenuOpen((open) => !open)}
                onSurrender={() => {
                  setMenuOpen(false);
                  setGame(playerSurrender);
                }}
              />
              <Hand state={game} onInspect={openPreview} />
            </>
          )}
        </section>
      </div>
      {game.phase === "play" && game.currentSide === "rival" && (
        <RivalActionBanner message={getRivalBannerMessage(game)} paused={Boolean(game.pendingPlayerChoice)} />
      )}
      {activePendingSelection && <SelectionPrompt pending={activePendingSelection} onCancel={game.pendingPlayerChoice ? () => undefined : clearSelection} nextEnergyType={nextPlayerEnergy} />}
      <CardPreview
        state={game}
        target={previewTarget}
        canUseAttack={Boolean(player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canAttack(game, player))}
        canUseRetreat={Boolean(player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canRetreat(game, player))}
        canUseAbility={Boolean(player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canUseActiveAbility(game, player))}
        onAttack={() => {
          if (!player.active) return;
          const attack = getPrimaryAttack(getPokemonCard(player.active));
          if (attack.heal && attack.healTarget === "any") {
            const damagedTargets = getDamagedPokemon(player);
            if (damagedTargets.length > 0) {
              setPendingSelection({ kind: "attackHealTarget" });
              setPreviewTarget(null);
              return;
            }
          }
          if (attack.draw) {
            applyPlayerGameUpdate(playerAttack, { kind: "genericGain" });
          } else {
            setGame(playerAttack);
          }
          setPreviewTarget(null);
        }}
        onRetreat={() => {
          setPendingSelection({ kind: "retreatTarget" });
          setPreviewTarget(null);
        }}
        onAbility={() => {
          if (!player.active) return;
          const ability = getPokemonCard(player.active).ability;
          if (!ability?.moveBenchedEnergyToActive) return;
          setPendingSelection({ kind: "moveEnergyAbility", energyType: ability.moveBenchedEnergyToActive });
          setPreviewTarget(null);
        }}
        onClose={closePreview}
      />
      <ChoiceModal
        pending={pendingSelection}
        hand={player.hand}
        deck={player.deck}
        onCancel={clearSelection}
        onChooseHand={(discardHandIndex) => {
          if (!pendingSelection || pendingSelection.kind !== "discardForScout") return;
          const discardedCardId = player.hand[discardHandIndex];
          const discardedCardName = discardedCardId ? getCard(discardedCardId).name : "that card";
          setPendingSelection({ kind: "deckSearch", handIndex: pendingSelection.handIndex, discardHandIndex, discardedCardName });
        }}
        onChooseDeck={(deckCardIndex) => {
          if (!pendingSelection || pendingSelection.kind !== "deckSearch") return;
          applyPlayerGameUpdate(
            (current) => playHandCard(current, pendingSelection.handIndex, { discardHandIndex: pendingSelection.discardHandIndex, deckCardIndex }),
            { kind: "makeDebutScout", discardedCardName: pendingSelection.discardedCardName },
          );
          setPendingSelection(null);
        }}
        onResolveEmptyDeckSearch={() => {
          if (!pendingSelection || pendingSelection.kind !== "deckSearch") return;
          applyPlayerGameUpdate(
            (current) => playHandCard(current, pendingSelection.handIndex, { discardHandIndex: pendingSelection.discardHandIndex }),
            { kind: "makeDebutScout", discardedCardName: pendingSelection.discardedCardName },
          );
          setPendingSelection(null);
        }}
      />
      {actionNotice && <ActionNotice notice={actionNotice} onClose={() => setActionNotice(null)} />}
      {game.gameOver && <GameOverModal game={game} onPlayAgain={startNewGame} />}
    </main>
  );
}

function appStyle(isMenu = false): CSSProperties {
  return {
    height: isMenu ? "100%" : "auto",
    minHeight: "100%",
    position: "relative",
    overflow: isMenu ? "hidden" : "clip",
    padding: isMenu ? 0 : 16,
    boxSizing: "border-box",
    color: "#17211c",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#eef3f1",
  };
}

const contentStyle: CSSProperties = {
  position: "relative",
  maxWidth: 1760,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const duelGridStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const handPanelStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.72)",
  background: "rgba(255, 255, 255, 0.78)",
  padding: 10,
  boxShadow: "0 24px 80px rgba(17, 24, 39, 0.14)",
};
