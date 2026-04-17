import type { EnergyType, UmamusumeInstance } from "../../../../shared/src/types";

export function getAttachedEnergy(umamusume: UmamusumeInstance): EnergyType[] {
  const energyEntries = Object.entries(umamusume.energies) as [EnergyType, number][];
  return energyEntries.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
}
