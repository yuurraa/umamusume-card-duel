import type { AiDifficulty } from "../../../shared/src/types";

const AI_DIFFICULTY_STORAGE_KEY = "umamusume-card-duel-ai-difficulty";

export const AI_DIFFICULTIES: AiDifficulty[] = ["easy", "normal", "hard"];
export const DEFAULT_AI_DIFFICULTY: AiDifficulty = "normal";

export function readAiDifficulty(): AiDifficulty {
  if (typeof window === "undefined") return DEFAULT_AI_DIFFICULTY;
  const stored = window.localStorage.getItem(AI_DIFFICULTY_STORAGE_KEY);
  if (!stored) return DEFAULT_AI_DIFFICULTY;
  return isAiDifficulty(stored) ? stored : DEFAULT_AI_DIFFICULTY;
}

export function writeAiDifficulty(aiDifficulty: AiDifficulty): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_DIFFICULTY_STORAGE_KEY, aiDifficulty);
}

function isAiDifficulty(value: string): value is AiDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

