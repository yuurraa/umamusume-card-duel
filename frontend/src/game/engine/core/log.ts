import type { GameState } from "../../../../../shared/src/types";

export function log(state: GameState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 12);
}
