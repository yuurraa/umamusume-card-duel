import type { EnergyType } from "../../../../../shared/src/types";

/** A gameplay random source. Tests can inject a deterministic source per match. */
export type RandomSource = () => number;

export function shuffle<T>(items: T[], random: RandomSource = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = copy[index];
    const swap = copy[swapIndex];
    if (current === undefined || swap === undefined) continue;
    copy[index] = swap;
    copy[swapIndex] = current;
  }
  return copy;
}

export function rollEnergyFromPool(pool: EnergyType[], random: RandomSource = Math.random): EnergyType {
  const index = Math.floor(random() * pool.length);
  return pool[index] ?? "psychic";
}
