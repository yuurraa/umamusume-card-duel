import type { Card } from "../../../shared/src/types";

export function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const lastName = names[names.length - 1] ?? "";
  return `${names.slice(0, -1).join(", ")}, and ${lastName}`;
}

export function formatCardDisplayName(card: Card): string {
  if (card.kind !== "pokemon") return card.name;
  const stageLabel = card.stage === 0 ? "Basic" : card.stage === 1 ? "Stage 1" : "Stage 2";
  return `${card.name} (${stageLabel})`;
}
