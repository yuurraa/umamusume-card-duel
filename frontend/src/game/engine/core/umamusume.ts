import type { UmamusumeInstance, SideState } from "../../../../../shared/src/types";

export function attachedEnergyCount(umamusume: UmamusumeInstance): number {
  return Object.values(umamusume.energies).reduce((sum, amount) => sum + amount, 0);
}

export function getAllUmamusume(side: SideState): UmamusumeInstance[] {
  return side.active ? [side.active, ...side.bench] : [...side.bench];
}

export function getDamagedUmamusume(side: SideState): UmamusumeInstance[] {
  return getAllUmamusume(side).filter((umamusume) => umamusume.hp < umamusume.maxHp);
}

export function findOwnUmamusumeByUid(side: SideState, umamusumeUid: number): UmamusumeInstance | undefined {
  return getAllUmamusume(side).find((umamusume) => umamusume.uid === umamusumeUid);
}

export function findMostDamagedUmamusume(side: SideState): UmamusumeInstance {
  if (!side.active) {
    const fallback = side.bench[0];
    if (!fallback) throw new Error(`No healing target available for ${side.title}.`);
    return fallback;
  }
  return [side.active, ...side.bench].reduce((best, umamusume) => {
    const bestDamage = best.maxHp - best.hp;
    const currentDamage = umamusume.maxHp - umamusume.hp;
    return currentDamage > bestDamage ? umamusume : best;
  }, side.active);
}
