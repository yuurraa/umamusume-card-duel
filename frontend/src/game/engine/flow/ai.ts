import { MAX_BENCH, MAX_HAND } from "../../../../../shared/src/gameData";
import type { Card, GameState, PendingPlayerChoice, SideId, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../core/catalog";
import { actorName, formatUmamusumeCardName } from "../core/labels";
import { attachEnergy, hasEnoughEnergy } from "./energy";
import { evolveUmamusume, findEvolutionTarget } from "./evolution";
import { canAttachEnergy, canRetreat } from "./eligibility";
import { applyTrainer, hasDamagedHealingTarget, playStadium, SwitchAfterGustResume } from "./trainers";
import { getPlayableAction } from "./playRules";
import { getOpposingSide } from "./board";
import { effectiveRetreatCost } from "./retreat";
import { attachedEnergyCount } from "../core/umamusume";
import { createUmamusume } from "./setup";
import { log } from "../core/log";

type AiTrainerDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  switchOutOpponentActive: (state: GameState, actingSideId: SideId, pendingChoiceResume?: SwitchAfterGustResume) => void;
};

export function aiPlayOneBasic(state: GameState, side: SideState): boolean {
  if (side.bench.length >= MAX_BENCH) return false;
  const index = side.hand.findIndex((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
  if (index === -1) return false;
  const cardId = side.hand.splice(index, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "umamusume") return false;
  side.bench.push(createUmamusume(card.id, state.turnNumber));
  log(state, `${actorName(side)} benched ${formatUmamusumeCardName(card)}.`);
  return true;
}

export function aiEvolveOne(state: GameState, side: SideState): boolean {
  const index = side.hand.findIndex((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage > 0 && Boolean(findEvolutionTarget(state, side, card));
  });
  if (index === -1) return false;
  const cardId = side.hand.splice(index, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "umamusume") return false;
  const target = findEvolutionTarget(state, side, card);
  if (!target) return false;
  evolveUmamusume(state, side, target, card);
  return true;
}

export function aiAttachOneEnergy(state: GameState, side: SideState): boolean {
  if (!side.active || !canAttachEnergy(state, side)) return false;
  if (side.energyAttachmentsThisTurn >= 1) {
    attachEnergy(state, side, side.active);
    return true;
  }
  if (!hasEnoughEnergy(side.active, getPrimaryAttack(getUmamusumeCard(side.active)).cost)) {
    attachEnergy(state, side, side.active);
    return true;
  }
  const target = side.bench.find((umamusume) => !hasEnoughEnergy(umamusume, getPrimaryAttack(getUmamusumeCard(umamusume)).cost));
  attachEnergy(state, side, target || side.active);
  return true;
}

export function aiPlayOneTrainer(
  state: GameState,
  side: SideState,
  pendingChoiceResume: Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"],
  deps: AiTrainerDeps,
): boolean {
  const index = side.hand.findIndex((cardId) => shouldAiPlayTrainer(state, side, getCard(cardId)));
  if (index === -1) return false;
  const cardId = side.hand.splice(index, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "trainer") return false;
  if (card.trainerType === "stadium") {
    playStadium(state, side, card);
    deps.refreshContinuousEffects(state);
    return true;
  }
  const target = card.effect.attachEnergyFromZoneToBench ? getAiBenchEnergyAttachTarget(side) : undefined;
  applyTrainer(
    state,
    side,
    card,
    target ? { umamusumeTargetUid: target.uid } : {},
    deps.switchOutOpponentActive,
    pendingChoiceResume,
  );
  if (card.trainerType === "supporter") side.usedSupporterThisTurn = true;
  side.discard.push(card.id);
  log(state, `${actorName(side)} played ${card.name}.`);
  return true;
}

function shouldAiPlayTrainer(state: GameState, side: SideState, card: Card): boolean {
  if (card.kind !== "trainer") return false;
  if (!getPlayableAction(state, side, card.id).canPlay) return false;
  if (card.effect.gustOpponent) return getOpposingSide(state, side.id).bench.length > 0;
  if (card.effect.activeAttackDamageBonus) return true;
  if (card.effect.attachEnergyFromZoneToBench) return side.bench.length > 0;
  if (card.effect.extraEnergyAttach) return true;
  if (card.effect.retreatCostReduction) {
    const active = side.active;
    if (!active) return false;
    return side.bench.length > 0 && attachedEnergyCount(active) + card.effect.retreatCostReduction >= effectiveRetreatCost(state, side) && !canRetreat(state, side);
  }
  if (card.effect.heal && !hasDamagedHealingTarget(side, card)) return Boolean(card.effect.draw && side.hand.length < MAX_HAND);
  if (card.effect.draw && side.hand.length >= MAX_HAND) return false;
  if (card.effect.searchUmamusume || card.effect.searchRandomBasicUmamusume) return side.hand.length < MAX_HAND;
  return true;
}

function getAiBenchEnergyAttachTarget(side: SideState): UmamusumeInstance | undefined {
  const undercharged = side.bench.find((umamusume) => !hasEnoughEnergy(umamusume, getPrimaryAttack(getUmamusumeCard(umamusume)).cost));
  return undercharged ?? side.bench[0];
}
