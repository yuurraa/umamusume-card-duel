import type { EnergyType, GameState } from "../../../shared/src/types";
import type { PlayChoices } from "../game/engine";
import {
  attachPlayerEnergy,
  completePregameSetup,
  playHandCard,
  playerAttack,
  playerEndTurn,
  playerRetreat,
  playerSurrender,
  playerUseStadium,
  resolvePendingPlayerChoice,
  usePlayerAbility,
} from "../game/engine";

export type PlayerIntent =
  | { type: "playHandCard"; handIndex: number; choices?: PlayChoices }
  | { type: "attachEnergy"; umamusumeUid?: number }
  | { type: "attack"; attackTargetUid?: number; healTargetUid?: number }
  | { type: "retreat"; benchUmamusumeUid?: number; discardEnergyTypes?: EnergyType[] }
  | {
    type: "useAbility";
    abilityUmamusumeUid: number;
    sourceUmamusumeUid: number;
    selectedEnergyType?: EnergyType;
    discardHandIndex?: number;
    opponentTargetUmamusumeUid?: number;
  }
  | { type: "resolvePendingChoice"; umamusumeUid: number }
  | { type: "completeSetup"; activeHandIndex: number; benchHandIndexes: number[] }
  | { type: "endTurn" }
  | { type: "useStadium" }
  | { type: "surrender" };

export function applyPlayerIntent(state: GameState, intent: PlayerIntent): GameState {
  switch (intent.type) {
    case "playHandCard":
      return playHandCard(state, intent.handIndex, intent.choices ?? {});
    case "attachEnergy":
      return attachPlayerEnergy(state, intent.umamusumeUid);
    case "attack":
      return playerAttack(state, intent.attackTargetUid, intent.healTargetUid);
    case "retreat":
      return playerRetreat(state, intent.benchUmamusumeUid, intent.discardEnergyTypes);
    case "useAbility":
      return usePlayerAbility(
        state,
        intent.abilityUmamusumeUid,
        intent.sourceUmamusumeUid,
        intent.selectedEnergyType,
        intent.discardHandIndex,
        intent.opponentTargetUmamusumeUid,
      );
    case "resolvePendingChoice":
      return resolvePendingPlayerChoice(state, intent.umamusumeUid);
    case "completeSetup":
      return completePregameSetup(state, intent.activeHandIndex, intent.benchHandIndexes);
    case "endTurn":
      return playerEndTurn(state);
    case "useStadium":
      return playerUseStadium(state);
    case "surrender":
      return playerSurrender(state);
    default:
      return state;
  }
}
