import type { GameState } from "../../../../../shared/src/types";

export function cloneGame(state: GameState): GameState {
  return structuredClone(state);
}
