import type { GameState } from "../../../../../shared/src/types";

export function log(state: GameState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 12);
}

export function logPrimaryFirst(state: GameState, primaryMessage: string, runEffects: () => void): void {
  runEffects();
  // Log the primary action last so it appears first in the UI list (newest-first log order).
  log(state, primaryMessage);
}
