import type { EnergyType } from "../../../../../shared/src/types";

/** A gameplay random source. Tests can inject a deterministic source per match. */
export type RandomSource = () => number;

/**
 * Runs a state updater with a random source whose draws are replayable.
 *
 * React may evaluate a state updater more than once while checking whether a
 * transition is safe to commit. Keeping the generated values and resetting
 * the cursor for each evaluation prevents those checks from changing the
 * outcome that is eventually committed.
 */
export function createReplayableRandomUpdate(randomSource: RandomSource = Math.random) {
  const values: number[] = [];

  return function replayableRandomUpdate<T>(operation: (random: RandomSource) => T): T {
    let cursor = 0;
    const replayableRandom: RandomSource = () => {
      const cached = values[cursor];
      const value = cached ?? randomSource();
      if (cached === undefined) values[cursor] = value;
      cursor += 1;
      return value;
    };
    return operation(replayableRandom);
  };
}

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
