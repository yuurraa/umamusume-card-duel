import type { EnergyCost, EnergyType, SideState } from "../../../../../../shared/src/types";

export function getUnsupportedTypedEnergy(stateSide: SideState, cost: EnergyCost): number {
  const pool = new Set(stateSide.energyPool);
  return Object.entries(cost).reduce((missing, [energyType, amount]) => {
    if (!amount || energyType === "colorless") return missing;
    return pool.has(energyType as EnergyType) ? missing : missing + amount;
  }, 0);
}

export function isAttackSupportedByEnergyPool(stateSide: SideState, cost: EnergyCost): boolean {
  return getUnsupportedTypedEnergy(stateSide, cost) === 0;
}

export function scoreAttackEnergyPoolFit(stateSide: SideState, cost: EnergyCost): number {
  const unsupportedTyped = getUnsupportedTypedEnergy(stateSide, cost);
  if (unsupportedTyped <= 0) return 14;
  return -45 - unsupportedTyped * 22;
}
