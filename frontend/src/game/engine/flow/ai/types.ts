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
  | { kind: "attack"; retreatTargetUid?: number; attackTargetUid?: number; healTargetUid?: number; usesCoinFlip: boolean };

export type AiCombatDecisionResult = {
  resolved: boolean;
  usedAttack: boolean;
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

export type PendingSwitchAfterGustResume = Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"];
