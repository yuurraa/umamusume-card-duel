import type { EnergyType, GameState, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { ALL_ENERGY_TYPES } from "../core/constants";
import { getCard, getUmamusumeCard } from "../core/catalog";

export function retreatCost(retreat: string): number {
  if (retreat === "Empty") return 0;
  const amount = retreat.match(/x(\d+)/)?.[1];
  return amount ? Number(amount) : 1;
}

export function getGlobalRetreatCostReduction(state: GameState): number {
  if (!state.stadium) return 0;
  const stadium = getCard(state.stadium.cardId);
  if (stadium.kind !== "trainer") return 0;
  return stadium.effect.globalRetreatCostReduction ?? 0;
}

export function effectiveRetreatCost(state: GameState, side: SideState): number {
  if (!side.active) return 0;
  return Math.max(0, retreatCost(getUmamusumeCard(side.active).retreat) - side.retreatCostReduction - getGlobalRetreatCostReduction(state));
}

export function payRetreatCost(umamusume: UmamusumeInstance, cost: number): void {
  let remaining = cost;
  for (const type of ALL_ENERGY_TYPES) {
    if (remaining <= 0) return;
    const discarded = Math.min(umamusume.energies[type], remaining);
    umamusume.energies[type] -= discarded;
    remaining -= discarded;
  }
}

export function payRetreatCostBySelection(umamusume: UmamusumeInstance, selectedEnergyTypes: EnergyType[], cost: number): boolean {
  if (selectedEnergyTypes.length !== cost) return false;

  const requiredByType = selectedEnergyTypes.reduce<Partial<Record<EnergyType, number>>>((counts, energyType) => {
    counts[energyType] = (counts[energyType] ?? 0) + 1;
    return counts;
  }, {});

  for (const energyType of ALL_ENERGY_TYPES) {
    const required = requiredByType[energyType] ?? 0;
    if (required > umamusume.energies[energyType]) return false;
  }

  for (const energyType of ALL_ENERGY_TYPES) {
    const required = requiredByType[energyType] ?? 0;
    if (required > 0) umamusume.energies[energyType] -= required;
  }

  return true;
}

export function getDisplayedRetreatCost(state: GameState, side: SideState, umamusume: UmamusumeInstance): number {
  return umamusume.uid === side.active?.uid
    ? effectiveRetreatCost(state, side)
    : Math.max(0, retreatCost(getUmamusumeCard(umamusume).retreat) - getGlobalRetreatCostReduction(state));
}
