import { type CSSProperties, type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { defaultPlayerDeckId, MAX_BENCH, premadeDecks } from "../../shared/src/gameData";
import { Hand } from "./components/Hand";
import { SideBoard } from "./components/SideBoard";
import { EnergyIcon } from "./components/EnergyIcon";
import { hasTextDragPayload, readDragPayload, writeDragPayload } from "./components/dragData";
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
  getDisplayedRetreatCost,
  getEvolutionTargets,
  getPrimaryAttack,
  getPokemonCard,
  getPlayableAction,
  isPokemonInDeck,
  energyLabel,
  playerAttack,
  playerEndTurn,
  playerRetreat,
  playerSurrender,
  playHandCard,
  resolvePendingPlayerChoice,
  usePlayerActiveAbility,
} from "./game/engine";
import type { Card, EnergyType, GameState, PokemonInstance, PokemonType, SideState } from "../../shared/src/types";
import type { InspectTarget } from "./inspect";

type PendingSelection =
  | { kind: "attachEnergy" }
  | { kind: "retreatTarget" }
  | { kind: "replaceActive" }
  | { kind: "attackHealTarget" }
  | { kind: "healTarget"; handIndex: number }
  | { kind: "evolveTarget"; handIndex: number }
  | { kind: "moveEnergyAbility"; energyType: EnergyType }
  | { kind: "discardForScout"; handIndex: number }
  | { kind: "deckSearch"; handIndex: number; discardHandIndex: number; discardedCardName: string };

type ActionNoticeSource =
  | { kind: "genericGain" }
  | { kind: "traineeScoutTicket" }
  | { kind: "makeDebutScout"; discardedCardName: string };

type AppScreen = "mainMenu" | "decks" | "match";
type PreviewTone = {
  accent: string;
};

type PremadeDeck = (typeof premadeDecks)[number];

const typeAccentColors: Record<PokemonType, string> = {
  Grass: "#7bc03e",
  Fire: "#e8885a",
  Water: "#5aa8e8",
  Lightning: "#dbb94a",
  Psychic: "#b882d8",
  Fighting: "#b88a60",
  Darkness: "#445063",
  Metal: "#7f8c9b",
};

const neutralPreviewTone: PreviewTone = {
  accent: "#94a3b8",
};

const deckTypeToEnergy: Record<PokemonType, EnergyType> = {
  Grass: "grass",
  Fire: "fire",
  Water: "water",
  Lightning: "lightning",
  Psychic: "psychic",
  Fighting: "fighting",
  Darkness: "darkness",
  Metal: "metal",
};

const equippedDeckStorageKey = "umamusume-tcg-pocket-equipped-deck";

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
  const setupBasics = player.hand
    .map((cardId, index) => ({ cardId, index }))
    .filter(({ cardId }) => {
      const card = getCard(cardId);
      return card.kind === "pokemon" && card.stage === 0;
    });
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

function createSetupPreviewSide(side: SideState, activeIndex: number | null, benchIndexes: number[]): SideState {
  const activeCardId = activeIndex === null ? null : getSetupPreviewPokemonCardId(side.hand[activeIndex]);
  return {
    ...side,
    active: activeCardId ? createSetupPreviewPokemon(activeCardId, -1) : null,
    bench: benchIndexes
      .map((index, order) => {
        const cardId = getSetupPreviewPokemonCardId(side.hand[index]);
        return cardId ? createSetupPreviewPokemon(cardId, -(order + 2)) : null;
      })
      .filter((pokemon): pokemon is PokemonInstance => Boolean(pokemon)),
  };
}

function createSetupHiddenRivalSide(side: SideState): SideState {
  return {
    ...side,
    bench: [],
  };
}

function getSetupPreviewPokemonCardId(cardId?: string): string | null {
  if (!cardId) return null;
  const card = getCard(cardId);
  return card.kind === "pokemon" ? cardId : null;
}

function createSetupPreviewPokemon(cardId: string, uid: number): PokemonInstance {
  const card = getCard(cardId);
  if (card.kind !== "pokemon") throw new Error(`Expected pokemon card for setup preview: ${cardId}`);
  return {
    uid,
    cardId,
    species: card.species,
    stage: card.stage,
    hp: card.hp,
    maxHp: card.hp,
    energies: {
      grass: 0,
      fire: 0,
      water: 0,
      lightning: 0,
      psychic: 0,
      fighting: 0,
      darkness: 0,
      metal: 0,
    },
    enteredTurn: 0,
    evolvedTurn: null,
    tookDamageLastTurn: false,
    tookDamageThisTurn: false,
    nextTurnDamageReduction: 0,
    usedAbilityThisTurn: false,
  };
}

function getSelectablePokemonUids(game: GameState, pending: PendingSelection | null): Set<number> | undefined {
  if (!pending) return undefined;
  const player = game.sides.player;
  if (pending.kind === "attachEnergy") return new Set(getAllPokemon(player).map((pokemon) => pokemon.uid));
  if (pending.kind === "attackHealTarget") return new Set(getDamagedPokemon(player).map((pokemon) => pokemon.uid));
  if (pending.kind === "moveEnergyAbility") return new Set(player.bench.filter((pokemon) => pokemon.energies[pending.energyType] > 0).map((pokemon) => pokemon.uid));
  if (pending.kind === "retreatTarget") return new Set(player.bench.map((pokemon) => pokemon.uid));
  if (pending.kind === "replaceActive") return new Set(player.bench.map((pokemon) => pokemon.uid));
  if (pending.kind === "healTarget") {
    const cardId = player.hand[pending.handIndex];
    const card = cardId ? getCard(cardId) : undefined;
    if (!card || card.kind !== "trainer") return undefined;
    const targets = card.effect.healTarget === "active" ? (player.active ? [player.active] : []) : getAllPokemon(player);
    return new Set(targets.map((pokemon) => pokemon.uid));
  }
  if (pending.kind === "evolveTarget") {
    const cardId = player.hand[pending.handIndex];
    const card = cardId ? getCard(cardId) : undefined;
    if (!card || card.kind !== "pokemon") return undefined;
    return new Set(getEvolutionTargets(game, player, card).map((pokemon) => pokemon.uid));
  }
  return undefined;
}

function getRivalStepDelay(game: GameState): number {
  if (game.rivalTurnStep === "attack" || game.rivalTurnStep === "finish") return 1400;
  return 1260;
}

function getRivalBannerMessage(game: GameState): string {
  if (game.pendingPlayerChoice) return game.log[0] ?? "Opponent waited for your choice.";
  const latest = game.log[0];
  if (latest && (latest.includes("Opponent") || latest.includes("coin flip"))) return latest;
  return "Opponent planned their turn.";
}

function getOpponentAttackNotice(game: GameState): string | null {
  return game.log.find((entry) => entry.startsWith("Opponent attacked with ") || entry === "Opponent did not attack.") ?? null;
}

function RivalActionBanner({ message, paused }: { message: string; paused: boolean }) {
  return (
    <section style={rivalActionBannerStyle}>
      <span style={rivalPulseStyle(paused)} />
      <div style={{ minWidth: 0 }}>
        <div style={previewKickerStyle}>{paused ? "Opponent is waiting" : "Opponent turn"}</div>
        <strong style={rivalActionTextStyle}>{message}</strong>
      </div>
    </section>
  );
}

function SelectionPrompt({ pending, onCancel, nextEnergyType }: { pending: PendingSelection; onCancel: () => void; nextEnergyType: EnergyType | null }) {
  const copy = pending.kind === "attachEnergy"
      ? nextEnergyType
        ? <AttachPromptContent energyType={nextEnergyType} />
        : "Choose one of your Umamusume to receive this turn's Energy."
    : pending.kind === "moveEnergyAbility"
      ? <MoveEnergyPromptContent energyType={pending.energyType} />
    : pending.kind === "retreatTarget"
      ? "Choose the benched Umamusume to move active."
      : pending.kind === "replaceActive"
        ? "Choose the benched Umamusume to move active."
      : pending.kind === "attackHealTarget"
        ? "Choose one of your damaged Umamusume to heal."
      : pending.kind === "healTarget"
        ? "Choose one Umamusume to heal."
        : pending.kind === "evolveTarget"
          ? "Choose the Umamusume that should evolve."
          : pending.kind === "discardForScout"
            ? "Choose one other card from your hand to discard."
          : "Choose an Umamusume from your deck.";

  return (
    <section style={selectionPromptStyle}>
      <strong style={selectionPromptTextStyle}>{copy}</strong>
      {pending.kind !== "replaceActive" && <NeutralButton style={selectionPromptButtonStyle} onClick={onCancel}>Cancel</NeutralButton>}
    </section>
  );
}

function PlayDropZone({ onDropHandCard }: { onDropHandCard: (handIndex: number) => void }) {
  const [hovered, setHovered] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = readDragPayload(event.dataTransfer);
    setHovered(false);
    if (payload?.kind !== "hand-card") return;
    onDropHandCard(payload.handIndex);
  };

  return (
    <div
      style={{
        ...playDropZoneStyle,
        borderColor: hovered ? "rgba(100, 113, 104, 0.6)" : playDropZoneStyle.borderColor,
        background: hovered ? "rgba(247, 250, 248, 0.96)" : playDropZoneStyle.background,
      }}
      onDragOver={(event) => {
        if (!hasTextDragPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setHovered(true);
      }}
      onDragEnter={(event) => {
        if (!hasTextDragPayload(event)) return;
        setHovered(true);
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={handleDrop}
    >
      Play Card
    </div>
  );
}

function StadiumSlot({ state, onDropHandCard, onInspect }: { state: GameState; onDropHandCard: (handIndex: number) => void; onInspect: (target: InspectTarget) => void }) {
  const [hovered, setHovered] = useState(false);
  const stadium = state.stadium ? getCard(state.stadium.cardId) : null;
  const stadiumImage = stadium?.kind === "trainer" ? stadium.image : null;
  const stadiumName = stadium?.kind === "trainer" ? stadium.name : "Stadium Slot";

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const payload = readDragPayload(event.dataTransfer);
    setHovered(false);
    if (payload?.kind !== "hand-card") return;
    onDropHandCard(payload.handIndex);
  };

  return (
    <button
      type="button"
      style={stadiumSlotStyle(hovered, Boolean(stadiumImage))}
      onClick={() => {
        if (!stadium || stadium.kind !== "trainer") return;
        onInspect({ card: stadium });
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onDragOver={(event) => {
        if (!hasTextDragPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setHovered(true);
      }}
      onDragEnter={(event) => {
        if (!hasTextDragPayload(event)) return;
        setHovered(true);
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={handleDrop}
      aria-label={stadiumName}
    >
      {stadiumImage ? <img style={stadiumImageStyle(hovered)} src={stadiumImage} alt={stadiumName} draggable={false} /> : <span style={stadiumEmptyTextStyle}>Stadium Slot</span>}
    </button>
  );
}

function PlayHandHeader({
  canAttach,
  energyType,
  extraCount,
  canEndTurn,
  menuOpen,
  log,
  canSurrender,
  onEndTurn,
  onToggleMenu,
  onSurrender,
}: {
  canAttach: boolean;
  energyType: EnergyType | null;
  extraCount: number;
  canEndTurn: boolean;
  menuOpen: boolean;
  log: string[];
  canSurrender: boolean;
  onEndTurn: () => void;
  onToggleMenu: () => void;
  onSurrender: () => void;
}) {
  return (
    <div style={playHandHeaderStyle}>
      <div style={playHandActionRowStyle}>
        <button type="button" style={menuButtonStyle(menuOpen)} onClick={onToggleMenu} aria-label="Open battle menu">
          <span style={hamburgerLineStyle} />
          <span style={hamburgerLineStyle} />
          <span style={hamburgerLineStyle} />
        </button>
        <EnergyDragToken canDrag={canAttach} energyType={energyType} extraCount={extraCount} />
      </div>
      <NeutralButton style={buttonStyle(canEndTurn)} disabled={!canEndTurn} onClick={onEndTurn}>
        End Turn
      </NeutralButton>
      {menuOpen && <BattleMenu log={log} canSurrender={canSurrender} onSurrender={onSurrender} />}
    </div>
  );
}

function EnergyDragToken({ canDrag, energyType, extraCount }: { canDrag: boolean; energyType: EnergyType | null; extraCount: number }) {
  return (
    <div
      style={energyTokenStyle(canDrag)}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) return;
        event.dataTransfer.effectAllowed = "move";
        writeDragPayload(event.dataTransfer, { kind: "energy-token" });
      }}
      aria-label={energyType ? `Drag ${energyLabel(energyType)}` : "No Energy available"}
    >
      {energyType ? <EnergyIcon type={energyType} size="md" /> : <span style={energyTokenEmptyStyle}>?</span>}
      {extraCount > 0 && <span style={energyTokenBadgeStyle}>+{extraCount}</span>}
    </div>
  );
}

function BattleMenu({ log, canSurrender, onSurrender }: { log: string[]; canSurrender: boolean; onSurrender: () => void }) {
  return (
    <section style={battleMenuStyle}>
      <div style={battleMenuHeaderStyle}>
        <div>
          <div style={previewKickerStyle}>Menu</div>
          <strong style={battleMenuTitleStyle}>Battle Log</strong>
        </div>
        <NeutralButton style={surrenderButtonStyle(canSurrender)} disabled={!canSurrender} onClick={onSurrender}>
          Surrender
        </NeutralButton>
      </div>
      <div style={battleLogListStyle}>
        {log.length === 0 ? (
          <span style={battleLogEmptyStyle}>No actions yet.</span>
        ) : (
          log.map((entry, index) => (
            <div key={`${entry}-${index}`} style={battleLogEntryStyle(index)}>
              {entry}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PregameSetupPanel({
  game,
  activeIndex,
  benchIndexes,
  onSetActive,
  onReady,
  onInspect,
}: {
  game: GameState;
  activeIndex: number | null;
  benchIndexes: number[];
  onSetActive: (index: number) => void;
  onReady: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const coinFlipCopy = game.firstPlayer === "player" ? "Heads. You went first." : "Tails. Opponent went first.";

  return (
    <div style={pregamePanelStyle}>
      <div style={pregamePanelHeaderStyle}>
        <div>
          <div style={previewKickerStyle}>Preparation Phase</div>
          <h2 style={pregameTitleStyle}>{coinFlipCopy}</h2>
          <p style={pregameBodyStyle}>Move a Basic Umamusume to the active slot, as well as any Basic Umamusume to your bench.</p>
        </div>
        <div style={pregameActionRowStyle}>
          <NeutralButton style={attackButtonStyle(activeIndex !== null)} disabled={activeIndex === null} onClick={onReady}>Ready</NeutralButton>
        </div>
      </div>
      <Hand
        state={game}
        mode="setup"
        setupActiveIndex={activeIndex}
        setupBenchIndexes={benchIndexes}
        onSetupChooseActive={onSetActive}
        onInspect={onInspect}
      />
    </div>
  );
}

function GameOverModal({ game, onPlayAgain }: { game: GameState; onPlayAgain: () => void }) {
  const playerWon = game.winner === "player";
  const title = playerWon ? "You Win" : "Opponent Wins";
  const latest = game.log[0] ?? (playerWon ? "First to three points." : "The duel is over.");

  return (
    <div style={gameOverBackdropStyle}>
      <section style={gameOverShellStyle}>
        <div style={previewKickerStyle}>Duel Finished</div>
        <h2 style={gameOverTitleStyle}>{title}</h2>
        <p style={gameOverBodyStyle}>{latest}</p>
        <div style={gameOverScoreRowStyle}>
          <ScoreSummary label="You" points={game.sides.player.points} accent="#d6519d" />
          <ScoreSummary label="Opponent" points={game.sides.rival.points} accent="#26312d" />
        </div>
        <NeutralButton style={gameOverButtonStyle} onClick={onPlayAgain}>Play Again</NeutralButton>
      </section>
    </div>
  );
}

function ScoreSummary({ label, points, accent }: { label: string; points: number; accent: string }) {
  return (
    <div style={scoreSummaryStyle}>
      <span style={scoreSummaryLabelStyle}>{label}</span>
      <strong style={{ ...scoreSummaryPointsStyle, color: accent }}>{points}</strong>
    </div>
  );
}

function ChoiceModal({
  pending,
  hand,
  deck,
  onCancel,
  onChooseHand,
  onChooseDeck,
  onResolveEmptyDeckSearch,
}: {
  pending: PendingSelection | null;
  hand: string[];
  deck: string[];
  onCancel: () => void;
  onChooseHand: (handIndex: number) => void;
  onChooseDeck: (deckIndex: number) => void;
  onResolveEmptyDeckSearch: () => void;
}) {
  if (!pending || (pending.kind !== "discardForScout" && pending.kind !== "deckSearch")) return null;
  const isDiscard = pending.kind === "discardForScout";
  const options = isDiscard
    ? hand.map((cardId, index) => ({ cardId, index })).filter(({ index }) => index !== pending.handIndex)
    : deck.map((cardId, index) => ({ cardId, index })).filter(({ cardId }) => isPokemonInDeck(cardId));
  const kicker = isDiscard ? "Discard Cost" : "Deck Search";
  const title = isDiscard ? "Choose 1 card to discard" : "Choose 1 Umamusume";
  const emptyCopy = "There are no eligible Umamusume in your deck.";

  return (
    <div style={choiceBackdropStyle}>
      <section style={choiceShellStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={previewKickerStyle}>{kicker}</div>
            <h2 style={choiceTitleStyle}>{title}</h2>
          </div>
          <NeutralButton style={smallButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
        </div>
        {options.length === 0 && !isDiscard ? (
          <div style={emptyChoiceStyle}>
            <strong>{emptyCopy}</strong>
            <span style={emptyChoiceSubtextStyle}>You can still finish resolving this trainer, but it will not add an Umamusume to your hand.</span>
            <NeutralButton style={buttonStyle(true)} onClick={onResolveEmptyDeckSearch}>Resolve Without Drawing</NeutralButton>
          </div>
        ) : (
          <div style={choiceGridStyle}>
            {options.map(({ cardId, index }) => {
              const card = getCard(cardId);
              const image = card.kind === "pokemon" ? card.portrait : card.image;
              const displayName = formatCardDisplayName(card);
              return (
                <button key={`${cardId}-${index}`} type="button" style={choiceCardStyle} onClick={() => (isDiscard ? onChooseHand(index) : onChooseDeck(index))}>
                  <img style={choiceImageStyle} src={image} alt={card.name} />
                  <strong style={choiceNameStyle}>{displayName}</strong>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ActionNotice({ notice, onClose }: { notice: string; onClose: () => void }) {
  return (
    <section style={actionNoticeStyle}>
      <strong style={actionNoticeTextStyle}>{notice}</strong>
      <NeutralButton style={actionNoticeCloseStyle} onClick={onClose}>Close</NeutralButton>
    </section>
  );
}

function getActionNotice(previous: GameState, next: GameState, source: ActionNoticeSource): string | null {
  const gainedCards = getHandAdditions(previous.sides.player.hand, next.sides.player.hand).map((cardId) => formatCardDisplayName(getCard(cardId)));
  if (source.kind === "makeDebutScout") {
    return gainedCards.length > 0
      ? `You discarded ${source.discardedCardName} and obtained ${formatNameList(gainedCards)}.`
      : `You discarded ${source.discardedCardName} and obtained no Umamusume.`;
  }
  if (gainedCards.length > 0) return `You obtained ${formatNameList(gainedCards)}.`;
  if (source.kind === "traineeScoutTicket") return "You have no more Basic Umamusume in your deck.";
  return null;
}

function getHandAdditions(previousHand: string[], nextHand: string[]): string[] {
  const previousCounts = new Map<string, number>();
  previousHand.forEach((cardId) => previousCounts.set(cardId, (previousCounts.get(cardId) ?? 0) + 1));

  return nextHand.filter((cardId) => {
    const remaining = previousCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      previousCounts.set(cardId, remaining - 1);
      return false;
    }
    return true;
  });
}

function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const lastName = names[names.length - 1] ?? "";
  return `${names.slice(0, -1).join(", ")}, and ${lastName}`;
}

function formatCardDisplayName(card: Card): string {
  if (card.kind !== "pokemon") return card.name;
  const stageLabel = card.stage === 0 ? "Basic" : card.stage === 1 ? "Stage 1" : "Stage 2";
  return `${card.name} (${stageLabel})`;
}

function AttachEnergyContent({ energyType, extraCount }: { energyType: EnergyType | null; extraCount: number }) {
  if (!energyType) return <>Attach Energy</>;
  return (
    <span style={inlineEnergyLabelStyle}>
      <EnergyIcon type={energyType} size="sm" />
      <span>{extraCount > 0 ? `Attach ${energyLabel(energyType)} (+${extraCount})` : `Attach ${energyLabel(energyType)}`}</span>
    </span>
  );
}

function AttachPromptContent({ energyType }: { energyType: EnergyType }) {
  return (
    <span style={inlineEnergyLabelStyle}>
      <span>Choose one of your Umamusume to receive</span>
      <EnergyIcon type={energyType} size="sm" />
      <span>{energyLabel(energyType)}.</span>
    </span>
  );
}

function MoveEnergyPromptContent({ energyType }: { energyType: EnergyType }) {
  return (
    <span style={inlineEnergyLabelStyle}>
      <span>Choose the benched Umamusume to send</span>
      <EnergyIcon type={energyType} size="sm" />
      <span>{energyLabel(energyType)} from.</span>
    </span>
  );
}

function RetreatCostDisplay({ cost }: { cost: number }) {
  if (cost <= 0) return <strong>Free</strong>;
  return (
    <span style={retreatPipListStyle} aria-label={`Retreat cost ${cost}`}>
      {Array.from({ length: cost }, (_, index) => <span key={index} style={colorlessPipStyle} />)}
    </span>
  );
}

function getPreviewTone(card: Card): PreviewTone {
  if (card.kind !== "pokemon") return neutralPreviewTone;
  const accent = typeAccentColors[card.type];
  return {
    accent,
  };
}

function alphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function NeutralButton({
  children,
  onClick,
  disabled = false,
  style,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const enabled = !disabled;

  return (
    <button
      type="button"
      style={{ ...neutralButtonStyle(enabled, hovered), ...style }}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function PreviewAccentButton({
  children,
  onClick,
  disabled = false,
  accent,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent: string;
  style?: CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const enabled = !disabled;

  return (
    <button
      type="button"
      style={{ ...previewAccentButtonStyle(enabled, hovered, accent), ...style }}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

function CardPreview({ state, target, canUseAttack, canUseRetreat, canUseAbility, onAttack, onRetreat, onAbility, onClose }: { state: GameState; target: InspectTarget | null; canUseAttack: boolean; canUseRetreat: boolean; canUseAbility: boolean; onAttack: () => void; onRetreat: () => void; onAbility: () => void; onClose: () => void }) {
  if (!target) return null;
  const { card, pokemon } = target;
  const previewTone = getPreviewTone(card);
  const image = card.kind === "pokemon" ? card.portrait : card.image;
  const hpPercent = pokemon ? Math.max(0, Math.round((pokemon.hp / pokemon.maxHp) * 100)) : 0;
  const energyEntries = pokemon ? (Object.entries(pokemon.energies) as [EnergyType, number][]) : [];
  const attachedEnergy = energyEntries.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
  const previewSide = target.sideId === "player" ? state.sides.player : state.sides.rival;
  const retreatCost = pokemon ? getDisplayedRetreatCost(state, previewSide, pokemon) : 0;

  return (
    <div style={previewBackdropStyle} onClick={onClose}>
      <NeutralButton style={closeButtonStyle} onClick={onClose}>Close</NeutralButton>
      <div style={previewShellStyle} onClick={(event) => event.stopPropagation()}>
        <img style={previewImageStyle} src={image} alt={card.name} />
        <aside style={previewInfoStyle()}>
          <div>
            <div style={previewKickerStyle}>{card.kind === "pokemon" ? card.label : card.label}</div>
            <h2 style={previewTitleStyle}>{card.name}</h2>
          </div>

          {pokemon && (
            <section style={previewBlockStyle()}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900 }}>
                <span>HP</span>
                <span>{pokemon.hp}/{pokemon.maxHp}</span>
              </div>
              <div style={{ height: 9, marginTop: 8, overflow: "hidden", borderRadius: 999, background: "#e2e8f0" }}>
                <div style={{ height: "100%", width: `${hpPercent}%`, borderRadius: 999, background: previewTone.accent }} />
              </div>
            </section>
          )}

          {pokemon && (
            <section style={previewBlockStyle()}>
              <div style={previewKickerStyle}>Attached Energy</div>
              <div style={{ display: "flex", minHeight: 38, alignItems: "center", gap: 6, marginTop: 8 }}>
                {attachedEnergy.length === 0 ? (
                  <span style={{ color: "#647168", fontSize: 12, fontWeight: 800 }}>None</span>
                ) : (
                  attachedEnergy.map((type, index) => (
                    <span key={`${type}-${index}`} style={previewEnergyRingStyle}>
                      <EnergyIcon type={type} size="md" />
                    </span>
                  ))
                )}
              </div>
            </section>
          )}

          {card.kind === "pokemon" && pokemon && (
            <NeutralButton disabled={!canUseRetreat} onClick={onRetreat} style={retreatButtonStyle(canUseRetreat)}>
              <span>Retreat</span>
              <span style={retreatCostContentStyle}>
                <RetreatCostDisplay cost={retreatCost} />
              </span>
            </NeutralButton>
          )}

          {card.kind === "pokemon" && card.ability && (
            <section style={abilitySectionStyle()}>
              <div style={previewKickerStyle}>Ability</div>
              <strong style={abilityNameStyle}>{card.ability.name}</strong>
              <span style={abilityTextStyle}>{card.ability.text}</span>
              {card.ability.moveBenchedEnergyToActive && (
                <PreviewAccentButton accent={previewTone.accent} style={abilityButtonStyle()} disabled={!canUseAbility} onClick={onAbility}>
                  Use Ability
                </PreviewAccentButton>
              )}
            </section>
          )}

          {card.kind === "pokemon" && (
            <section style={previewMovesStyle}>
              {card.attacks.map((attack, index) => (
                <PreviewAccentButton
                  key={attack.name}
                  accent={previewTone.accent}
                  style={moveButtonStyle()}
                  disabled={!canUseAttack || index !== 0}
                  onClick={onAttack}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{attack.name}</strong>
                    <strong>{attack.damage}</strong>
                  </span>
                  <span style={{ display: "block", marginTop: 4, color: "inherit", opacity: 0.82, fontSize: 12, lineHeight: 1.25 }}>{attack.text}</span>
                </PreviewAccentButton>
              ))}
            </section>
          )}

          {card.kind === "trainer" && (
            <section style={previewBlockStyle()}>
              <div style={previewKickerStyle}>{card.trainerType}</div>
              <p style={{ margin: "6px 0 0", color: "#17211c", fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{card.text}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function neutralButtonStyle(enabled: boolean, hovered: boolean): CSSProperties {
  return {
    height: 48,
    borderRadius: 8,
    border: `1px solid ${hovered && enabled ? "rgba(100, 113, 104, 0.34)" : "rgba(203, 213, 225, 0.9)"}`,
    background: hovered && enabled ? "rgba(241, 245, 249, 0.98)" : "rgba(255, 255, 255, 0.92)",
    color: enabled ? "#17211c" : "#647168",
    fontSize: 14,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.55,
    boxShadow: hovered && enabled ? "0 16px 36px rgba(17, 24, 39, 0.14)" : "0 12px 28px rgba(17, 24, 39, 0.1)",
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
  };
}

function buttonStyle(enabled: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, false),
  };
}

function attackButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, false),
  };
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

const playDropZoneStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "52%",
  transform: "translate(-50%, -50%)",
  zIndex: 3,
  width: 132,
  height: 132,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "2px dashed rgba(100, 113, 104, 0.32)",
  background: "rgba(255, 255, 255, 0.86)",
  color: "#647168",
  fontSize: 13,
  fontWeight: 900,
  textAlign: "center",
  boxShadow: "0 14px 36px rgba(17, 24, 39, 0.14)",
  pointerEvents: "auto",
  userSelect: "none",
};

function stadiumSlotStyle(hovered: boolean, hasCard: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "calc(52% - 188px)",
    transform: "translate(-50%, -50%)",
    zIndex: 4,
    width: 148,
    height: 208,
    display: "grid",
    placeItems: "center",
    overflow: "visible",
    borderRadius: 8,
    border: hovered ? "2px dashed rgba(100, 113, 104, 0.6)" : "2px dashed rgba(100, 113, 104, 0.32)",
    background: hasCard ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.58)",
    color: "#647168",
    padding: 8,
    fontSize: 12,
    fontWeight: 950,
    cursor: hasCard ? "pointer" : "default",
    boxShadow: hovered ? "0 0 0 5px rgba(100, 113, 104, 0.12), 0 18px 42px rgba(17, 24, 39, 0.18)" : "0 10px 30px rgba(17, 24, 39, 0.1)",
    boxSizing: "border-box",
    transition: "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
  };
}

function stadiumImageStyle(hovered: boolean): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    borderRadius: 8,
    filter: hovered
      ? "drop-shadow(0 20px 28px rgba(17, 24, 39, 0.24)) saturate(1.04)"
      : "drop-shadow(0 14px 20px rgba(17, 24, 39, 0.18))",
    transform: hovered ? "translateY(-6px) rotate(0.8deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
    transition: "transform 160ms ease, filter 160ms ease",
  };
}

const stadiumEmptyTextStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "100%",
  height: "100%",
  borderRadius: 6,
  background: "rgba(247,250,248,0.5)",
  textAlign: "center",
};

const pregameOverviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 16,
  alignItems: "stretch",
};

const handPanelStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.72)",
  background: "rgba(255, 255, 255, 0.78)",
  padding: 10,
  boxShadow: "0 24px 80px rgba(17, 24, 39, 0.14)",
};

const playHandHeaderStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 6,
  zIndex: 6,
};

const playHandActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const pregameBoardStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(214, 81, 157, 0.22)",
  background: "linear-gradient(180deg, rgba(255, 250, 253, 0.97) 0%, rgba(255, 255, 255, 0.94) 100%)",
  color: "#17211c",
  boxShadow: "0 22px 68px rgba(17, 24, 39, 0.2)",
  padding: 18,
  minHeight: 292,
};

const pregameBoardHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const pregameBoardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  lineHeight: 1.05,
  fontWeight: 950,
};

const pregameBoardColumnsStyle: CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const pregameColumnStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const pregameSlotTitleStyle: CSSProperties = {
  color: "#647168",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
};

const pregameEmptySlotStyle: CSSProperties = {
  minHeight: 206,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px dashed rgba(100, 113, 104, 0.28)",
  background: "rgba(247,250,248,0.85)",
  color: "#647168",
  fontSize: 15,
  fontWeight: 900,
  textAlign: "center",
  padding: 16,
};

const pregameBenchGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const pregameBenchEmptyStyle: CSSProperties = {
  minHeight: 138,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px dashed rgba(100, 113, 104, 0.28)",
  background: "rgba(247,250,248,0.72)",
  color: "#647168",
  fontSize: 12,
  fontWeight: 900,
};

const pregameActiveCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  justifyItems: "center",
  borderRadius: 8,
  border: "1px solid rgba(100,113,104,0.18)",
  background: "rgba(247,250,248,0.9)",
  padding: 10,
  boxShadow: "0 12px 28px rgba(17, 24, 39, 0.1)",
};

const pregameBenchCardStyle: CSSProperties = {
  ...pregameActiveCardStyle,
  padding: 8,
};

const pregameCardImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: 176,
  objectFit: "contain",
  display: "block",
};

const pregameCardNameStyle: CSSProperties = {
  color: "#17211c",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
};

const pregamePanelStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const pregamePanelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const pregameTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 26,
  lineHeight: 1.05,
  fontWeight: 950,
};

const pregameBodyStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#47554c",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.4,
};

const pregameActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const pregameHandGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
  gap: 12,
};

const pregameHandCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  borderRadius: 8,
  border: "1px solid rgba(100,113,104,0.18)",
  background: "rgba(247,250,248,0.9)",
  padding: 10,
  boxShadow: "0 12px 28px rgba(17, 24, 39, 0.08)",
};

const pregameHandImageStyle: CSSProperties = {
  width: "100%",
  height: 176,
  objectFit: "contain",
  display: "block",
};

const pregameHandNameStyle: CSSProperties = {
  color: "#17211c",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
};

const pregameChoiceRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const pregameKeepInHandStyle: CSSProperties = {
  minHeight: 34,
  display: "grid",
  placeItems: "center",
  color: "#647168",
  fontSize: 12,
  fontWeight: 900,
};

const pregameHiddenActiveStyle: CSSProperties = {
  minHeight: 206,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px solid rgba(23, 33, 28, 0.18)",
  background: "linear-gradient(180deg, #26312d 0%, #17211c 100%)",
  color: "#ffffff",
  fontSize: 20,
  fontWeight: 950,
  textAlign: "center",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
};

const pregameHiddenBenchStyle: CSSProperties = {
  minHeight: 138,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px solid rgba(23, 33, 28, 0.16)",
  background: "linear-gradient(180deg, rgba(38, 49, 45, 0.9) 0%, rgba(23, 33, 28, 0.96) 100%)",
  color: "rgba(255,255,255,0.86)",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
};

const overlaySurfaceStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(203, 213, 225, 0.9)",
  background: "linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)",
  color: "#17211c",
  boxShadow: "0 22px 68px rgba(17, 24, 39, 0.2)",
};

const overlayButtonStyle: CSSProperties = {
  ...neutralButtonStyle(true, false),
  height: 34,
  padding: "0 12px",
  fontSize: 12,
};

const overlayBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(15, 23, 42, 0.62)",
};

const selectionPromptStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 18,
  zIndex: 45,
  width: "min(720px, calc(100vw - 32px))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  transform: "translateX(-50%)",
  padding: "12px 86px 12px 18px",
  textAlign: "center",
  ...overlaySurfaceStyle,
};

const selectionPromptTextStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.35,
  textAlign: "center",
};

const inlineEnergyLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
};

function menuButtonStyle(active: boolean): CSSProperties {
  return {
    width: 42,
    height: 42,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: "50%",
    border: active ? "1px solid rgba(23, 33, 28, 0.32)" : "1px solid rgba(255, 255, 255, 0.82)",
    background: active ? "#17211c" : "rgba(255, 255, 255, 0.92)",
    color: active ? "#ffffff" : "#17211c",
    cursor: "pointer",
    boxShadow: active ? "0 12px 26px rgba(23, 33, 28, 0.18)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
    padding: 0,
  };
}

const hamburgerLineStyle: CSSProperties = {
  width: 15,
  height: 2,
  borderRadius: 999,
  background: "currentColor",
  color: "inherit",
  display: "block",
};

const battleMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  bottom: 54,
  zIndex: 20,
  width: 360,
  maxWidth: "calc(100vw - 48px)",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.76)",
  background: "rgba(255, 255, 255, 0.94)",
  boxShadow: "0 24px 70px rgba(17, 24, 39, 0.18)",
  padding: 12,
};

const battleMenuHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const battleMenuTitleStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#17211c",
  fontSize: 18,
  lineHeight: 1.1,
  fontWeight: 950,
};

function surrenderButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, false),
    minWidth: 102,
    height: 38,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 950,
  };
}

const battleLogListStyle: CSSProperties = {
  marginTop: 12,
  maxHeight: 280,
  overflow: "auto",
  display: "grid",
  gap: 7,
};

function battleLogEntryStyle(index: number): CSSProperties {
  return {
    borderRadius: 8,
    border: "1px solid rgba(100,113,104,0.12)",
    background: index === 0 ? "rgba(214, 81, 157, 0.1)" : "rgba(247,250,248,0.82)",
    color: "#17211c",
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 850,
  };
}

const battleLogEmptyStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed rgba(100,113,104,0.24)",
  color: "#647168",
  padding: 12,
  fontSize: 12,
  fontWeight: 850,
};

const rivalActionBannerStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: 16,
  zIndex: 44,
  width: "min(520px, calc(100vw - 32px))",
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr)",
  alignItems: "center",
  gap: 10,
  transform: "translateX(-50%)",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.74)",
  background: "rgba(255, 255, 255, 0.9)",
  boxShadow: "0 18px 48px rgba(17, 24, 39, 0.18)",
  pointerEvents: "none",
};

function rivalPulseStyle(paused: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "1px solid rgba(23, 33, 28, 0.18)",
    background: paused ? "#94a3b8" : "#26312d",
    boxShadow: paused ? "0 0 0 7px rgba(148, 163, 184, 0.16)" : "0 0 0 7px rgba(38, 49, 45, 0.12), 0 0 22px rgba(38, 49, 45, 0.22)",
    transition: "background 180ms ease, box-shadow 180ms ease",
  };
}

const rivalActionTextStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#17211c",
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 950,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function energyTokenStyle(enabled: boolean): CSSProperties {
  return {
    position: "relative",
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: "1px solid rgba(255, 255, 255, 0.82)",
    background: "rgba(255, 255, 255, 0.92)",
    boxShadow: enabled ? "0 12px 26px rgba(214, 81, 157, 0.18)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
    cursor: enabled ? "grab" : "not-allowed",
    opacity: enabled ? 1 : 0.46,
    userSelect: "none",
  };
}

const energyTokenEmptyStyle: CSSProperties = {
  color: "#647168",
  fontSize: 16,
  fontWeight: 900,
};

const energyTokenBadgeStyle: CSSProperties = {
  position: "absolute",
  right: -4,
  bottom: -4,
  minWidth: 18,
  height: 18,
  display: "grid",
  placeItems: "center",
  padding: "0 4px",
  borderRadius: 999,
  background: "#d6519d",
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 900,
  boxShadow: "0 6px 14px rgba(214, 81, 157, 0.28)",
};

const actionNoticeStyle: CSSProperties = {
  ...selectionPromptStyle,
  zIndex: 46,
  width: "min(760px, calc(100vw - 32px))",
  position: "fixed",
  justifyContent: "center",
  padding: "12px 86px 12px 18px",
  textAlign: "center",
  minHeight: 30,
};

const actionNoticeTextStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.35,
  textAlign: "center",
};

const actionNoticeCloseStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
};

const selectionPromptButtonStyle: CSSProperties = {
  ...actionNoticeCloseStyle,
};

const smallButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
};

const choiceBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 60,
};

const gameOverBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 80,
};

const gameOverShellStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(420px, 100%)",
  padding: 20,
  textAlign: "center",
};

const gameOverTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#17211c",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 950,
};

const gameOverBodyStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#47554c",
  fontSize: 14,
  lineHeight: 1.4,
  fontWeight: 850,
};

const gameOverScoreRowStyle: CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const scoreSummaryStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(100,113,104,0.14)",
  background: "rgba(247,250,248,0.86)",
  padding: 12,
};

const scoreSummaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#647168",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};

const scoreSummaryPointsStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 950,
};

const gameOverButtonStyle: CSSProperties = {
  ...neutralButtonStyle(true, false),
  width: "100%",
  marginTop: 18,
  fontWeight: 950,
};

const choiceShellStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(980px, 100%)",
  maxHeight: "86vh",
  overflow: "auto",
  padding: 18,
};

const choiceTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const choiceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const emptyChoiceStyle: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 12,
  justifyItems: "start",
  borderRadius: 8,
  border: "1px solid rgba(100,113,104,0.18)",
  background: "rgba(247,250,248,0.85)",
  padding: 16,
};

const emptyChoiceSubtextStyle: CSSProperties = {
  color: "#647168",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.35,
};

const choiceCardStyle: CSSProperties = {
  minHeight: 238,
  borderRadius: 8,
  border: "1px solid rgba(100, 113, 104, 0.2)",
  background: "rgba(247, 250, 248, 0.9)",
  padding: 8,
  cursor: "pointer",
  textAlign: "left",
  boxShadow: "0 12px 28px rgba(17, 24, 39, 0.12)",
};

const choiceImageStyle: CSSProperties = {
  width: "100%",
  height: 192,
  objectFit: "contain",
  display: "block",
};

const choiceNameStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  color: "#17211c",
  fontSize: 12,
  textAlign: "center",
};

const previewBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 50,
};

const closeButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  top: 16,
  right: 16,
  padding: "0 16px",
  fontSize: 14,
  height: 40,
};

const previewShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 460px) minmax(260px, 360px)",
  gap: 18,
  alignItems: "center",
  width: "100%",
  maxWidth: 900,
};

const previewImageStyle: CSSProperties = {
  maxHeight: "90vh",
  width: "100%",
  borderRadius: 8,
  objectFit: "contain",
  boxShadow: "0 32px 100px rgba(0, 0, 0, 0.44)",
};

function previewInfoStyle(): CSSProperties {
  return {
    ...overlaySurfaceStyle,
    border: "1px solid rgba(203, 213, 225, 0.9)",
    background: "#ffffff",
    padding: 16,
  };
}

const previewKickerStyle: CSSProperties = {
  color: "#647168",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const previewTitleStyle: CSSProperties = {
  margin: "2px 0 14px",
  color: "#17211c",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

function previewBlockStyle(): CSSProperties {
  return {
    marginTop: 10,
    borderRadius: 8,
    border: "1px solid rgba(226, 232, 240, 0.95)",
    background: "#ffffff",
    padding: 10,
  };
}

const previewEnergyRingStyle: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid white",
  background: "white",
  boxShadow: "0 8px 18px rgba(17,24,39,0.14)",
};

function previewAccentButtonStyle(enabled: boolean, hovered: boolean, accent: string): CSSProperties {
  return {
    width: "100%",
    borderRadius: 8,
    border: enabled ? `1px solid ${hovered ? accent : "rgba(203, 213, 225, 0.9)"}` : "1px solid rgba(203, 213, 225, 0.9)",
    background: enabled && hovered ? accent : "#ffffff",
    padding: 10,
    color: enabled ? (hovered ? "#ffffff" : "#17211c") : "#647168",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.62,
    boxShadow: enabled && hovered ? `0 12px 28px ${alphaColor(accent, 0.22)}` : "0 8px 18px rgba(17,24,39,0.08)",
    transition: "background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease",
  };
}

function abilityButtonStyle(): CSSProperties {
  return {
    marginTop: 10,
  };
}

function abilitySectionStyle(): CSSProperties {
  return {
    ...previewBlockStyle(),
  };
}

const abilityNameStyle: CSSProperties = {
  display: "block",
  marginTop: 6,
  color: "#17211c",
  fontSize: 18,
  lineHeight: 1.1,
  fontWeight: 950,
};

const abilityTextStyle: CSSProperties = {
  display: "block",
  marginTop: 6,
  color: "#17211c",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.35,
};

function retreatButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, false),
    width: "100%",
    height: 44,
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 12px",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 900,
  };
}

const retreatCostContentStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  minHeight: 20,
};

const retreatPipListStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const colorlessPipStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "2px solid currentColor",
  background: "radial-gradient(circle at center, rgba(255,255,255,0.98) 0 32%, transparent 36%)",
  boxSizing: "border-box",
};

const previewMovesStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

function moveButtonStyle(): CSSProperties {
  return {
    padding: 12,
    fontSize: 14,
  };
}

function getDeckById(deckId: string): PremadeDeck {
  return premadeDecks.find((deck) => deck.id === deckId)
    ?? premadeDecks.find((deck) => deck.id === defaultPlayerDeckId)
    ?? premadeDecks[0]
    ?? { id: defaultPlayerDeckId, name: "Deck", coverCardId: "mihonoBourbonStage2", cardIds: [] };
}

function readEquippedDeckId(): string {
  if (typeof window === "undefined") return defaultPlayerDeckId;
  const stored = window.localStorage.getItem(equippedDeckStorageKey);
  return stored && premadeDecks.some((deck) => deck.id === stored) ? stored : defaultPlayerDeckId;
}

function writeEquippedDeckId(deckId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(equippedDeckStorageKey, deckId);
}

function getDeckCoverCard(deck: PremadeDeck) {
  const card = getCard(deck.coverCardId);
  if (card.kind !== "pokemon") throw new Error(`Deck cover card must be a pokemon: ${deck.coverCardId}`);
  return card;
}

function getDeckEnergyTypes(deck: PremadeDeck): EnergyType[] {
  const types = new Set<EnergyType>();
  const displayOrder: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"];
  deck.cardIds.forEach((cardId) => {
    const card = getCard(cardId);
    if (card.kind === "pokemon") types.add(deckTypeToEnergy[card.type]);
  });

  return displayOrder.filter((type) => types.has(type));
}

function MainMenuScreen({
  equippedDeck,
  onPlay,
  onOpenDecks,
  onQuit,
}: {
  equippedDeck: PremadeDeck;
  onPlay: () => void;
  onOpenDecks: () => void;
  onQuit: () => void;
}) {
  return (
    <section style={menuScreenStyle}>
      <div style={menuHeroStyle}>
        <h1 style={menuTitleStyle}>Umamusume TCG Pocket</h1>
        <div style={menuActionPanelStyle}>
          <div style={menuButtonColumnStyle}>
          <NeutralButton style={menuPrimaryButtonStyle} onClick={onPlay}>Play</NeutralButton>
          <NeutralButton style={menuPrimaryButtonStyle} onClick={onOpenDecks}>Decks</NeutralButton>
          <NeutralButton style={menuPrimaryButtonStyle} onClick={onQuit}>Quit</NeutralButton>
          </div>
        </div>
      </div>
      <div style={equippedDeckDockStyle}>
        <DeckSummaryCard deck={equippedDeck} label="Equipped Deck" compact />
      </div>
    </section>
  );
}

function DeckBrowserScreen({
  decks,
  equippedDeckId,
  onEquipDeck,
  onBack,
}: {
  decks: PremadeDeck[];
  equippedDeckId: string;
  onEquipDeck: (deckId: string) => void;
  onBack: () => void;
}) {
  return (
    <section style={deckBrowserShellStyle}>
      <div style={deckBrowserHeaderStyle}>
        <div>
          <div style={menuKickerStyle}>Decks</div>
          <h1 style={deckBrowserTitleStyle}>Choose your deck</h1>
          <p style={deckBrowserSubtitleStyle}>Select a deck and equip it for the next match.</p>
        </div>
        <NeutralButton style={deckBrowserBackButtonStyle} onClick={onBack}>Back</NeutralButton>
      </div>
      <div style={deckBrowserGridStyle}>
        {decks.map((deck) => {
          const equipped = deck.id === equippedDeckId;
          return <DeckBrowserTile key={deck.id} deck={deck} equipped={equipped} onEquip={() => onEquipDeck(deck.id)} />;
        })}
      </div>
    </section>
  );
}

function DeckBrowserTile({ deck, equipped, onEquip }: { deck: PremadeDeck; equipped: boolean; onEquip: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      style={deckBrowserCardStyle(equipped, hovered)}
      onClick={onEquip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {equipped && <span style={deckSelectedBadgeStyle}>✓</span>}
      <DeckSummaryCard deck={deck} label="Premade Deck" />
    </button>
  );
}

function DeckSummaryCard({ deck, label, compact = false }: { deck: PremadeDeck; label: string; compact?: boolean }) {
  const coverCard = getDeckCoverCard(deck);
  const energyTypes = getDeckEnergyTypes(deck);

  return (
    <div style={deckSummaryCardStyle(compact)}>
      <img style={deckCoverImageStyle(compact)} src={coverCard.portrait} alt={coverCard.name} draggable={false} />
      <div style={deckSummaryTextStyle}>
        <div style={deckSummaryLabelStyle}>{label}</div>
        <strong style={deckSummaryNameStyle(compact)}>{deck.name}</strong>
        <div style={deckEnergyRowStyle}>
          {energyTypes.map((type) => (
            <span key={`${deck.id}-${type}`} style={deckEnergyIconWrapStyle} aria-label={energyLabel(type)}>
              <EnergyIcon type={type} size="sm" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const menuScreenStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const menuHeroStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 20,
};

const menuKickerStyle: CSSProperties = {
  color: "#647168",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const menuTitleStyle: CSSProperties = {
  margin: 0,
  color: "#17211c",
  maxWidth: 900,
  fontSize: "clamp(48px, 9vw, 88px)",
  lineHeight: 0.92,
  fontWeight: 950,
  paddingBottom: 20,
  textWrap: "balance",
};

const menuActionPanelStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minWidth: 280,
  padding: 12,
  borderRadius: 18,
  border: "1px solid rgba(203, 213, 225, 0.9)",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 20px 60px rgba(17, 24, 39, 0.1)",
};

const menuButtonColumnStyle: CSSProperties = {
  width: 240,
  display: "grid",
  gap: 10,
};

const menuPrimaryButtonStyle: CSSProperties = {
  width: "100%",
  height: 54,
  fontSize: 16,
};

const equippedDeckDockStyle: CSSProperties = {
  position: "absolute",
  left: 20,
  bottom: 20,
  width: "min(230px, calc(100vw - 112px))",
  zIndex: 1,
};

const deckBrowserShellStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "grid",
  gap: 22,
  padding: "24px 0 40px",
};

const deckBrowserHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const deckBrowserTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#17211c",
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 950,
};

const deckBrowserSubtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#647168",
  fontSize: 15,
  fontWeight: 800,
};

const deckBrowserBackButtonStyle: CSSProperties = {
  padding: "0 16px",
  height: 44,
};

const deckBrowserGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 22,
};

function deckBrowserCardStyle(equipped: boolean, hovered: boolean): CSSProperties {
  return {
    position: "relative",
    border: equipped
      ? "2px solid rgba(23, 33, 28, 0.62)"
      : hovered
        ? "1px solid rgba(100, 113, 104, 0.42)"
        : "1px solid rgba(203, 213, 225, 0.92)",
    borderRadius: 18,
    background: equipped
      ? "rgba(255, 255, 255, 0.98)"
      : hovered
        ? "rgba(247, 250, 248, 0.98)"
        : "rgba(255, 255, 255, 0.92)",
    boxShadow: equipped
      ? "0 22px 60px rgba(17, 24, 39, 0.16)"
      : hovered
        ? "0 22px 56px rgba(17, 24, 39, 0.14)"
        : "0 16px 44px rgba(17, 24, 39, 0.1)",
    padding: 16,
    textAlign: "left",
    cursor: "pointer",
    transform: hovered && !equipped ? "translateY(-4px)" : "translateY(0)",
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
  };
}

function deckSummaryCardStyle(compact: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: compact ? 10 : 14,
    alignItems: "center",
    borderRadius: 14,
    border: "1px solid rgba(203, 213, 225, 0.9)",
    background: "rgba(255, 255, 255, 0.96)",
    boxShadow: "0 16px 42px rgba(17, 24, 39, 0.12)",
    padding: compact ? 12 : 14,
  };
}

const deckSummaryTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 6,
  justifyItems: "center",
  textAlign: "center",
};

const deckSummaryLabelStyle: CSSProperties = {
  color: "#647168",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.16,
  textTransform: "uppercase",
};

function deckSummaryNameStyle(compact: boolean): CSSProperties {
  return {
    color: "#17211c",
    fontSize: compact ? 20 : 28,
    lineHeight: 1.05,
    fontWeight: 950,
  };
}

const deckEnergyRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
};

const deckEnergyIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
};

function deckCoverImageStyle(compact: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: compact ? 132 : 256,
    justifySelf: "center",
    borderRadius: 10,
    display: "block",
    objectFit: "contain",
    filter: "drop-shadow(0 18px 28px rgba(17, 24, 39, 0.2))",
  };
}

const deckSelectedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 1,
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid rgba(23, 33, 28, 0.18)",
  background: "#17211c",
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 950,
  boxShadow: "0 10px 20px rgba(17, 24, 39, 0.18)",
};

