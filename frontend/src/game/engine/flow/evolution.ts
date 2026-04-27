import type { GameState, SideId, SideState, UmamusumeCard, UmamusumeInstance } from "../../../../../shared/src/types";
import { formatUmamusumeCardName, formatUmamusumeInstanceName, actorName } from "../core/labels";
import { getAllUmamusume } from "../core/umamusume";
import { log } from "../core/log";

export function getEvolutionTargets(state: GameState, side: SideState, evolutionCard: UmamusumeCard): UmamusumeInstance[] {
  return [side.active, ...side.bench]
    .filter((umamusume): umamusume is UmamusumeInstance => Boolean(umamusume))
    .filter((umamusume) => isValidEvolutionTarget(state, side, umamusume, evolutionCard));
}

export function findEvolutionTarget(state: GameState, side: SideState, evolutionCard: UmamusumeCard): UmamusumeInstance | undefined {
  return getEvolutionTargets(state, side, evolutionCard)[0];
}

export function isValidEvolutionTarget(state: GameState, side: SideState, umamusume: UmamusumeInstance, evolutionCard: UmamusumeCard): boolean {
  if (isSideFirstTurn(state, side.id)) return false;
  if (umamusume.species !== evolutionCard.evolvesFrom) return false;
  if (umamusume.stage !== evolutionCard.stage - 1) return false;
  if (umamusume.enteredTurn === state.turnNumber) return false;
  if (umamusume.evolvedTurn === state.turnNumber) return false;
  return true;
}

export function evolveUmamusume(state: GameState, side: SideState, umamusume: UmamusumeInstance, evolutionCard: UmamusumeCard): void {
  const damage = umamusume.maxHp - umamusume.hp;
  const previousName = formatUmamusumeInstanceName(umamusume);
  umamusume.evolutionCardIds = [...(umamusume.evolutionCardIds ?? []), umamusume.cardId];
  umamusume.cardId = evolutionCard.id;
  umamusume.species = evolutionCard.species;
  umamusume.stage = evolutionCard.stage;
  umamusume.maxHp = evolutionCard.hp;
  umamusume.hp = evolutionCard.hp - damage;
  umamusume.evolvedTurn = state.turnNumber;
  umamusume.enteredTurn = Math.min(umamusume.enteredTurn, state.turnNumber - 1);
  log(state, `${actorName(side)} evolved ${previousName} into ${formatUmamusumeCardName(evolutionCard)}.`);
}

function isSideFirstTurn(state: GameState, sideId: SideId): boolean {
  return (state.turnsTakenBySide[sideId] ?? 0) <= 1;
}
