import type { EnergyType, GameEvent, GameState } from "../../../shared/src/types";
import type { PlayChoices } from "../game/engine";
import { getNewGameEvents } from "../game/engine";
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
  | { type: "attack"; attackTargetUid?: number; healTargetUid?: number; evolutionDeckCardIndex?: number; evolutionHandCardIndex?: number; attackIndex?: number; discardHandIndex?: number; randomDiscardIndex?: number; switchTargetUid?: number; useShuffleSelfIntoDeck?: boolean }
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

export type PlayerIntentResult = {
  state: GameState;
  accepted: boolean;
  events: GameEvent[];
  transitionId?: number;
};

export function applyPlayerIntent(state: GameState, intent: PlayerIntent): GameState {
  return applyPlayerIntentWithResult(state, intent).state;
}

/** Applies a command once and reports whether it produced a canonical transition. */
export function applyPlayerIntentWithResult(state: GameState, intent: PlayerIntent): PlayerIntentResult {
  const before = JSON.stringify(state);
  const next = applyPlayerIntentUnchecked(state, intent);
  const events = getNewGameEvents(state.events, next.events);
  const transitionId = events[0]?.transitionId;
  return {
    state: next,
    accepted: before !== JSON.stringify(next),
    events,
    ...(transitionId === undefined ? {} : { transitionId }),
  };
}

function applyPlayerIntentUnchecked(state: GameState, intent: PlayerIntent): GameState {
  switch (intent.type) {
    case "playHandCard":
      return playHandCard(state, intent.handIndex, intent.choices ?? {});
    case "attachEnergy":
      return attachPlayerEnergy(state, intent.umamusumeUid);
    case "attack":
      return playerAttack(
        state,
        intent.attackTargetUid,
        intent.healTargetUid,
        undefined,
        intent.evolutionDeckCardIndex,
        intent.attackIndex,
        intent.discardHandIndex,
        intent.randomDiscardIndex,
        intent.switchTargetUid,
        intent.useShuffleSelfIntoDeck,
        undefined,
        intent.evolutionHandCardIndex,
      );
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
