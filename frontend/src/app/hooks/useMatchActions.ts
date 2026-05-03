import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EnergyType, GameState, UmamusumeInstance } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import type { ActionNoticeSource, PendingSelection } from "../../types/ui";
import {
  getCard,
  getEvolutionTargets,
  getPlayableAction,
  getPrimaryAttack,
  getRainbowUncapTargets,
  getToolTargets,
  getUmamusumeCard,
  playerAttack,
} from "../../game/engine";
import type { CoinFlipEvent } from "../gameUiHelpers";
import type { PlayerIntent } from "../../pvp/playerIntent";

export type PendingCoinAttack = {
  eventId: number;
  attackerId: "player" | "opponent";
  result: "heads" | "tails";
  results?: Array<"heads" | "tails"> | undefined;
  attackTargetUid?: number;
  healTargetUid?: number;
  attackIndex?: number;
};

type UseMatchActionsArgs = {
  game: GameState;
  player: GameState["sides"]["player"];
  isAiVsAi: boolean;
  pendingSelection: PendingSelection | null;
  selectableHandIndexes: Set<number> | undefined;
  isTurnFlowBlocked: boolean;
  setupActiveIndex: number | null;
  setupBenchIndexes: number[];
  coinFlipIdRef: MutableRefObject<number>;
  setGame: Dispatch<SetStateAction<GameState>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setPendingCoinAttack: Dispatch<SetStateAction<PendingCoinAttack | null>>;
  setActiveCoinFlip: Dispatch<SetStateAction<CoinFlipEvent | null>>;
  applyPlayerGameUpdate: (update: (state: GameState) => GameState, noticeSource?: ActionNoticeSource) => void;
  getPendingAttackCoinFlip: (state: GameState, attackerId: "player" | "opponent", id: number, attackIndex?: number) => CoinFlipEvent | null;
  submitPlayerIntent: (intent: PlayerIntent) => void;
  isNetworkMatch: boolean;
};

export function useMatchActions(args: UseMatchActionsArgs) {
  const {
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
  } = args;

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
      submitPlayerIntent({ type: "playHandCard", handIndex });
      return;
    }
    if (card.kind === "trainer" && card.effect.searchEvolutionUmamusume) {
      setPendingSelection({ kind: "deckForEvolutionSearch", handIndex });
      setPreviewTarget(null);
      return;
    }
    if (card.kind === "trainer" && card.effect.draw) {
      submitPlayerIntent({ type: "playHandCard", handIndex });
      return;
    }
    submitPlayerIntent({ type: "playHandCard", handIndex });
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
      submitPlayerIntent({ type: "playHandCard", handIndex, choices: { umamusumeTargetUid: umamusumeUid } });
      return;
    }
    if (card.kind === "trainer" && card.effect.heal) {
      submitPlayerIntent({ type: "playHandCard", handIndex, choices: { umamusumeTargetUid: umamusumeUid } });
      return;
    }
    if (card.kind === "trainer" && card.effect.attachEnergyFromZoneToBench && player.bench.some((umamusume) => umamusume.uid === umamusumeUid)) {
      submitPlayerIntent({ type: "playHandCard", handIndex, choices: { umamusumeTargetUid: umamusumeUid } });
      return;
    }
    if (card.kind === "trainer" && card.trainerType === "tool") {
      submitPlayerIntent({ type: "playHandCard", handIndex, choices: { umamusumeTargetUid: umamusumeUid } });
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
      submitPlayerIntent({ type: "playHandCard", handIndex });
    }
  };

  const attachEnergyByDrop = (umamusumeUid: number) => {
    if (isTurnFlowBlocked) return;
    if (game.phase !== "play" || pendingSelection || game.pendingPlayerChoice) return;
    submitPlayerIntent({ type: "attachEnergy", umamusumeUid });
  };

  const moveAbilityEnergyByDrop = (sourceUmamusumeUid: number, energyType: EnergyType) => {
    if (isTurnFlowBlocked) return;
    if (game.phase !== "play" || !pendingSelection || pendingSelection.kind !== "moveEnergyAbility" || game.pendingPlayerChoice) return;
    if (!pendingSelection.energyTypes.includes(energyType)) return;
    submitPlayerIntent({
      type: "useAbility",
      abilityUmamusumeUid: pendingSelection.abilityUmamusumeUid,
      sourceUmamusumeUid,
      selectedEnergyType: energyType,
    });
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  const chooseHandCard = (handIndex: number) => {
    if (isTurnFlowBlocked) return;
    if (!pendingSelection) return;
    if (!selectableHandIndexes?.has(handIndex)) return;
    if (pendingSelection.kind === "rainbowUncapEvolution") {
      submitPlayerIntent({
        type: "playHandCard",
        handIndex: pendingSelection.handIndex,
        choices: {
          umamusumeTargetUid: pendingSelection.umamusumeUid,
          rainbowEvolutionHandIndex: handIndex,
        },
      });
      setPendingSelection(null);
      setPreviewTarget(null);
      return;
    }
    if (pendingSelection.kind === "discardForAbility") {
      submitPlayerIntent({
        type: "useAbility",
        abilityUmamusumeUid: pendingSelection.abilityUmamusumeUid,
        sourceUmamusumeUid: pendingSelection.abilityUmamusumeUid,
        discardHandIndex: handIndex,
      });
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
    if (!pendingSelection || (pendingSelection.kind !== "deckForScout" && pendingSelection.kind !== "deckForEvolutionSearch" && pendingSelection.kind !== "deckForAttackEvolution")) return;
    if (pendingSelection.kind === "deckForAttackEvolution") {
      submitPlayerIntent({
        type: "attack",
        evolutionDeckCardIndex: deckCardIndex,
      });
      setPendingSelection(null);
      setPreviewTarget(null);
      return;
    }
    if (pendingSelection.kind === "deckForEvolutionSearch") {
      submitPlayerIntent({
        type: "playHandCard",
        handIndex: pendingSelection.handIndex,
        choices: {
          deckCardIndex,
        },
      });
      setPendingSelection(null);
      setPreviewTarget(null);
      return;
    }
    submitPlayerIntent({
      type: "playHandCard",
      handIndex: pendingSelection.handIndex,
      choices: {
        discardHandIndex: pendingSelection.discardHandIndex,
        deckCardIndex,
      },
    });
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  const selectUmamusume = (umamusume: UmamusumeInstance) => {
    if (isTurnFlowBlocked) return;
    if (game.pendingPlayerChoice?.sideId === "player") {
      submitPlayerIntent({ type: "resolvePendingChoice", umamusumeUid: umamusume.uid });
      setPreviewTarget(null);
      return;
    }
    if (!pendingSelection) return;
    if (pendingSelection.kind === "attachEnergy") {
      submitPlayerIntent({ type: "attachEnergy", umamusumeUid: umamusume.uid });
    } else if (pendingSelection.kind === "attackHealTarget") {
      if (isNetworkMatch) {
        submitPlayerIntent({ type: "attack", healTargetUid: umamusume.uid });
      } else {
        const active = player.active;
        const attack = active ? getPrimaryAttack(getUmamusumeCard(active)) : null;
        const coinAttack = getPendingAttackCoinFlip(game, "player", coinFlipIdRef.current++);
        if (coinAttack) {
          setPendingCoinAttack({
            eventId: coinAttack.id,
            attackerId: "player",
            result: coinAttack.result,
            results: coinAttack.results,
            healTargetUid: umamusume.uid,
          });
          setActiveCoinFlip(coinAttack);
        } else if (attack?.draw) {
          applyPlayerGameUpdate((current) => playerAttack(current, undefined, umamusume.uid), { kind: "genericGain" });
        } else {
          setGame((current) => playerAttack(current, undefined, umamusume.uid));
        }
      }
    } else if (pendingSelection.kind === "attackDamageTarget") {
      if (isNetworkMatch) {
        submitPlayerIntent({ type: "attack", attackTargetUid: umamusume.uid });
      } else {
        const active = player.active;
        const attack = active ? getPrimaryAttack(getUmamusumeCard(active)) : null;
        if (attack?.draw) {
          applyPlayerGameUpdate((current) => playerAttack(current, umamusume.uid), { kind: "genericGain" });
        } else {
          setGame((current) => playerAttack(current, umamusume.uid));
        }
      }
    } else if (pendingSelection.kind === "abilityDamageTarget") {
      submitPlayerIntent({
        type: "useAbility",
        abilityUmamusumeUid: pendingSelection.abilityUmamusumeUid,
        sourceUmamusumeUid: pendingSelection.abilityUmamusumeUid,
        opponentTargetUmamusumeUid: umamusume.uid,
      });
    } else if (pendingSelection.kind === "retreatTarget") {
      submitPlayerIntent({ type: "retreat", benchUmamusumeUid: umamusume.uid, discardEnergyTypes: pendingSelection.discardEnergyTypes });
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
      submitPlayerIntent({ type: "playHandCard", handIndex: pendingSelection.handIndex, choices: { umamusumeTargetUid: umamusume.uid } });
    }
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  const handleSetupReady = () => {
    if (isAiVsAi || isTurnFlowBlocked) return;
    if (setupActiveIndex === null) return;
    submitPlayerIntent({ type: "completeSetup", activeHandIndex: setupActiveIndex, benchHandIndexes: setupBenchIndexes });
  };

  return {
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
  };
}
