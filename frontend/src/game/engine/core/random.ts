import type { EnergyType } from "../../../../../shared/src/types";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    const swap = copy[swapIndex];
    if (current === undefined || swap === undefined) continue;
    copy[index] = swap;
    copy[swapIndex] = current;
  }
  return copy;
}

export function rollEnergyFromPool(pool: EnergyType[]): EnergyType {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? "psychic";
}
