import type { EnergyCost, EnergyType, GameState, SideState, UmamusumeCard, UmamusumeInstance } from "../../../../../shared/src/types";
import { actorName, energyLabel, formatUmamusumeInstanceName } from "../core/labels";
import { attachedEnergyCount } from "../core/umamusume";
import { log } from "../core/log";

export function attachEnergy(state: GameState, side: SideState, umamusume: UmamusumeInstance): void {
  const nextEnergy = side.energyZone.shift();
  if (!nextEnergy) return;
  umamusume.energies[nextEnergy] += 1;
  side.energyAttachmentsThisTurn += 1;
  log(state, `${actorName(side)} attached 1 ${energyLabel(nextEnergy)} to ${formatUmamusumeInstanceName(umamusume)}.`);
}

export function hasEnoughEnergy(umamusume: UmamusumeInstance, cost: EnergyCost): boolean {
  const requiredColorless = cost.colorless ?? 0;
  const requiredTyped = (Object.entries(cost) as [keyof EnergyCost, number | undefined][])
    .filter(([type]) => type !== "colorless")
    .reduce((sum, [type, amount]) => {
      const required = amount ?? 0;
      if (umamusume.energies[type as EnergyType] < required) return Number.POSITIVE_INFINITY;
      return sum + required;
    }, 0);

  if (!Number.isFinite(requiredTyped)) return false;
  return attachedEnergyCount(umamusume) >= requiredTyped + requiredColorless;
}

export function getAbilityMoveEnergyTypes(ability: UmamusumeCard["ability"]): EnergyType[] {
  const energyTypes = ability?.moveBenchedEnergyToActive;
  if (!energyTypes) return [];
  return Array.isArray(energyTypes) ? energyTypes : [energyTypes];
}
