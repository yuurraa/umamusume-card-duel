import type { Card, EnergyType, UmamusumeCard, UmamusumeInstance, SideState } from "../../../../../shared/src/types";
import { ENERGY_LABELS } from "./constants";
import { getUmamusumeCard } from "./catalog";

export function energyLabel(type: EnergyType): string {
  return ENERGY_LABELS[type];
}

export function actorName(side: SideState): string {
  return side.id === "player" ? "You" : "Opponent";
}

export function actorPossessive(side: SideState): string {
  return side.id === "player" ? "Your" : "Opponent's";
}

export function actorLowerPossessive(side: SideState): string {
  return side.id === "player" ? "your" : "their";
}

export function stageName(stage: number): string {
  if (stage === 0) return "Basic";
  return `Stage ${stage}`;
}

export function formatUmamusumeCardName(card: UmamusumeCard): string {
  return `${card.name} (${stageName(card.stage)})`;
}

export function formatUmamusumeInstanceName(umamusume: UmamusumeInstance): string {
  return formatUmamusumeCardName(getUmamusumeCard(umamusume));
}

export function formatCardName(card: Card): string {
  return card.kind === "umamusume" ? formatUmamusumeCardName(card) : card.name;
}

export function pluralize(amount: number, singular: string, plural = `${singular}s`): string {
  return amount === 1 ? singular : plural;
}
