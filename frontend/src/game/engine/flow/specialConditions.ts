import type { UmamusumeInstance } from "../../../../../shared/src/types";

export function clearSpecialConditions(umamusume: UmamusumeInstance): void {
  umamusume.specialConditions = [];
  umamusume.paralysedUntilOwnTurn = null;
}
