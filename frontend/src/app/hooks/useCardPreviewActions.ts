import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EnergyType, GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import type { ActionNoticeSource, PendingSelection } from "../../types/ui";
import {
  canAttack,
  canRetreat,
  canUseStadium,
  canUseUmamusumeAbility,
  getDamagedUmamusume,
  getDisplayedRetreatCost,
  getPrimaryAttack,
  getUmamusumeCard,
  playerAttack,
} from "../../game/engine";
import { RETREAT_ENERGY_ORDER, type CoinFlipEvent } from "../gameUiHelpers";
import type { PendingCoinAttack } from "./useMatchActions";
import type { PlayerIntent } from "../../pvp/playerIntent";

type UseCardPreviewActionsArgs = {
  game: GameState;
  player: GameState["sides"]["player"];
  previewTarget: InspectTarget | null;
  isTurnFlowBlocked: boolean;
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
  showShuffleReveal: (cardId: string) => void;
};

export function useCardPreviewActions(args: UseCardPreviewActionsArgs) {
  const {
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
  } = args;

  const canUseAttack = Boolean(!isTurnFlowBlocked && player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canAttack(game, player));
  const canUseRetreat = Boolean(!isTurnFlowBlocked && player.active && previewTarget?.isActive && previewTarget.sideId === "player" && canRetreat(game, player));
  const canUseAbility = Boolean(
    !isTurnFlowBlocked && ((previewTarget?.umamusume && previewTarget.sideId === "player" && canUseUmamusumeAbility(game, player, previewTarget.umamusume.uid))
    || (
      previewTarget?.card.kind === "trainer"
      && previewTarget.card.trainerType === "stadium"
      && Boolean(previewTarget.card.effect.shuffleHandIntoDeckDraw)
      && canUseStadium(game, player)
    )),
  );

  const onAttack = (attackIndex = 0) => {
    if (isTurnFlowBlocked) return;
    if (!player.active) return;
    const activeCard = getUmamusumeCard(player.active);
    const attack = activeCard.attacks[attackIndex] ?? getPrimaryAttack(activeCard);
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
    if (attack.evolveFromDeck) {
      setPendingSelection({
        kind: "deckForAttackEvolution",
        evolvesFrom: player.active.species,
        stage: player.active.stage + 1,
      });
      setPreviewTarget(null);
      return;
    }
    if (attack.attackDamageBonusIfDiscardHandCard && player.hand.length > 0) {
      setPendingSelection({ kind: "discardForAttackBonus", attackIndex });
      setPreviewTarget(null);
      return;
    }
    if (attack.switchSelfAfterAttack && player.bench.length > 0) {
      setPendingSelection({ kind: "attackSwitchTarget", attackIndex });
      setPreviewTarget(null);
      return;
    }
    const randomDiscardIndex = attack.shuffleRandomDiscardIntoDeck && player.discard.length > 0
      ? Math.floor(Math.random() * player.discard.length)
      : undefined;
    const revealedShuffleCardId = randomDiscardIndex !== undefined ? player.discard[randomDiscardIndex] : undefined;
    if (isNetworkMatch) {
      submitPlayerIntent({
        type: "attack",
        attackIndex,
        ...(randomDiscardIndex !== undefined ? { randomDiscardIndex } : {}),
      });
    } else {
      const coinAttack = getPendingAttackCoinFlip(game, "player", coinFlipIdRef.current++, attackIndex);
      if (coinAttack) {
        setPendingCoinAttack({ eventId: coinAttack.id, attackerId: "player", result: coinAttack.result, results: coinAttack.results, attackIndex });
        setActiveCoinFlip(coinAttack);
        setPreviewTarget(null);
        return;
      }
      if (attack.draw) {
        applyPlayerGameUpdate((current) => playerAttack(current, undefined, undefined, undefined, undefined, attackIndex, undefined, randomDiscardIndex), { kind: "genericGain" });
      } else {
        setGame((current) => playerAttack(current, undefined, undefined, undefined, undefined, attackIndex, undefined, randomDiscardIndex));
      }
    }
    setPreviewTarget(null);
    if (revealedShuffleCardId) showShuffleReveal(revealedShuffleCardId);
  };

  const onRetreat = () => {
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
  };

  const onAbility = () => {
    if (isTurnFlowBlocked) return;
    if (
      previewTarget?.card.kind === "trainer"
      && previewTarget.card.trainerType === "stadium"
      && previewTarget.card.effect.shuffleHandIntoDeckDraw
    ) {
      submitPlayerIntent({ type: "useStadium" });
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
        submitPlayerIntent({
          type: "useAbility",
          abilityUmamusumeUid: previewTarget.umamusume.uid,
          sourceUmamusumeUid: previewTarget.umamusume.uid,
        });
      }
    } else if (ability.discardToDraw && player.hand.length >= ability.discardToDraw.discard) {
      setPendingSelection({ kind: "discardForAbility", abilityUmamusumeUid: previewTarget.umamusume.uid });
    } else if (ability.coinFlipDrawOrActiveDamageCounter) {
      submitPlayerIntent({
        type: "useAbility",
        abilityUmamusumeUid: previewTarget.umamusume.uid,
        sourceUmamusumeUid: previewTarget.umamusume.uid,
      });
    } else {
      return;
    }
    setPreviewTarget(null);
  };

  return {
    canUseAttack,
    canUseRetreat,
    canUseAbility,
    onAttack,
    onRetreat,
    onAbility,
  };
}
