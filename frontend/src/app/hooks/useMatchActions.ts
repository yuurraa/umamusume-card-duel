import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EnergyType, GameState, UmamusumeInstance } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import type { ActionNoticeSource, PendingSelection } from "../../types/ui";
import {
  attachPlayerEnergy,
  completePregameSetup,
  getCard,
  getDamagedUmamusume,
  getEvolutionTargets,
  getPlayableAction,
  getPrimaryAttack,
  getRainbowUncapTargets,
  getToolTargets,
  getUmamusumeCard,
  playHandCard,
  playerAttack,
  playerRetreat,
  resolvePendingPlayerChoice,
  usePlayerAbility,
} from "../../game/engine";
import type { CoinFlipEvent } from "../gameUiHelpers";

export type PendingCoinAttack = {
  eventId: number;
  attackerId: "player" | "opponent";
  result: "heads" | "tails";
  attackTargetUid?: number;
  healTargetUid?: number;
};

type UseMatchActionsArgs = {
  game: GameState;
  player: GameState["sides"]["player"];
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
  getPendingAttackCoinFlip: (state: GameState, attackerId: "player" | "opponent", id: number) => CoinFlipEvent | null;
};

export function useMatchActions(args: UseMatchActionsArgs) {
  const {
    game,
    player,
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

  const handleSetupReady = () => {
    if (isTurnFlowBlocked) return;
    if (setupActiveIndex === null) return;
    setGame((current) => completePregameSetup(current, setupActiveIndex, setupBenchIndexes));
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
