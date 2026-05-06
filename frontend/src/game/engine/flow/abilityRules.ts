import type { Ability, GameState, SideId, UmamusumeInstance } from "../../../../../shared/src/types";
import { getUmamusumeCard } from "../core/catalog";

export function getUmamusumeAbility(state: GameState, sideId: SideId, umamusume: UmamusumeInstance): Ability | undefined {
  const ability = getUmamusumeCard(umamusume).ability;
  if (!ability) return undefined;
  if (!isAbilitySuppressed(state, sideId, umamusume.uid)) return ability;
  return undefined;
}

function isAbilitySuppressed(state: GameState, ownerSideId: SideId, umamusumeUid: number): boolean {
  const suppressor = getAbilitySuppressorUid(state);
  if (suppressor === null) return false;
  return suppressor !== umamusumeUid;
}

function getAbilitySuppressorUid(state: GameState): number | null {
  const sides: SideId[] = ["player", "opponent"];
  for (const sideId of sides) {
    const active = state.sides[sideId].active;
    if (!active) continue;
    const ability = getUmamusumeCard(active).ability;
    if (ability?.disableOtherUmamusumeAbilitiesWhileActive) return active.uid;
  }
  return null;
}
