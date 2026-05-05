import type { GameState, SideId, SideState, UmamusumeInstance } from "../../../../../../shared/src/types";
import { getOpposingSide } from "../board";

export type PublicSideView = {
  id: SideId;
  active: UmamusumeInstance | null;
  bench: UmamusumeInstance[];
  discard: string[];
  points: number;
  stadiumCardId: string | null;
};

export function getPublicOpponentView(state: GameState, sideId: SideId): PublicSideView {
  const opponent = getOpposingSide(state, sideId);
  return toPublicSideView(state, opponent);
}

export function toPublicSideView(state: GameState, side: SideState): PublicSideView {
  return {
    id: side.id,
    active: side.active,
    bench: [...side.bench],
    discard: [...side.discard],
    points: side.points,
    stadiumCardId: state.stadium?.cardId ?? null,
  };
}
