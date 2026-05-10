import type { GameState, PendingPlayerChoice, SideId, SideState } from "../../../../../../shared/src/types";
import type { SwitchAfterGustResume } from "../trainers";

export type AiTrainerDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  switchOutOpponentActive: (state: GameState, actingSideId: SideId, pendingChoiceResume?: SwitchAfterGustResume) => void;
};

export type AiCombatDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  choosePreferredActiveIndex: (side: SideState) => number;
};

export type AiCombatDecision =
  | { kind: "endTurn" }
  | {
    kind: "attack";
    retreatTargetUid?: number;
    attackTargetUid?: number;
    healTargetUid?: number;
    usesCoinFlip: boolean;
    useShuffleSelfIntoDeck?: boolean;
    discardHandIndex?: number;
    maxDiscardCount?: number;
    discardHandIndexes?: number[];
  };

export type AiCombatDecisionResult = {
  resolved: boolean;
  usedAttack: boolean;
  didRetreat?: boolean;
};

export type CombatCandidate = {
  id: string;
  decision: AiCombatDecision;
  score: number;
  keepsSafe: boolean;
  lethalTarget: boolean;
  targetValue: number;
  targetIsActive: boolean;
};

export type AiTacticalGoal =
  | "secure_lethal"
  | "deny_opponent_lethal"
  | "maximize_expected_damage";

export type AiTurnGoal =
  | "secure_lethal_now"
  | "set_up_two_turn_lethal"
  | "deny_opponent_lethal"
  | "stabilize_board"
  | "maximize_progress";

export type MidLevelDecision = {
  goal: AiTacticalGoal;
  candidate: CombatCandidate;
};

export type PendingSwitchAfterGustResume = Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"];
