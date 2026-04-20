import type { EnergyType } from "../../../shared/src/types";
import type { premadeDecks } from "../../../shared/src/gameData";

export type EnergyCountMap = Partial<Record<EnergyType, number>>;

export type PendingSelection =
  | { kind: "attachEnergy" }
  | { kind: "zoneBenchAttachTarget"; handIndex: number }
  | { kind: "retreatDiscard"; retreatCost: number; availableEnergyCounts: EnergyCountMap; selectedEnergyCounts: EnergyCountMap }
  | { kind: "retreatTarget"; discardEnergyTypes: EnergyType[] }
  | { kind: "replaceActive" }
  | { kind: "forceSwitchActive" }
  | { kind: "attackHealTarget" }
  | { kind: "attackDamageTarget" }
  | { kind: "healTarget"; handIndex: number }
  | { kind: "evolveTarget"; handIndex: number }
  | { kind: "toolTarget"; handIndex: number }
  | { kind: "rainbowUncapTarget"; handIndex: number }
  | { kind: "rainbowUncapEvolution"; handIndex: number; umamusumeUid: number }
  | { kind: "moveEnergyAbility"; abilityUmamusumeUid: number; energyTypes: EnergyType[] }
  | { kind: "abilityDamageTarget"; abilityUmamusumeUid: number }
  | { kind: "discardForAbility"; abilityUmamusumeUid: number }
  | { kind: "discardForScout"; handIndex: number }
  | { kind: "deckForScout"; handIndex: number; discardHandIndex: number; discardedCardName: string };

export type ActionNoticeSource =
  | { kind: "genericGain" }
  | { kind: "traineeScoutTicket" }
  | { kind: "makeDebutScout"; discardedCardName: string };

export type AppScreen = "mainMenu" | "modeSelect" | "decks" | "customisation" | "match";
export type MatchMode = "playerVsPlayer" | "playerVsAi" | "aiVsAi";

export type PreviewTone = {
  accent: string;
};

export type PremadeDeck = (typeof premadeDecks)[number];
