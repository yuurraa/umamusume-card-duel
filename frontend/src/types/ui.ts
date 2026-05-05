import type { EnergyType, PremadeDeck as SharedPremadeDeck } from "../../../shared/src/types";

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
  | { kind: "attackShuffleSelfChoice"; attackIndex: number }
  | { kind: "attackSwitchTarget"; attackIndex: number }
  | { kind: "healTarget"; handIndex: number }
  | { kind: "evolveTarget"; handIndex: number }
  | { kind: "toolTarget"; handIndex: number }
  | { kind: "rainbowUncapTarget"; handIndex: number }
  | { kind: "rainbowUncapEvolution"; handIndex: number; umamusumeUid: number }
  | { kind: "moveEnergyAbility"; abilityUmamusumeUid: number; energyTypes: EnergyType[] }
  | { kind: "abilityDamageTarget"; abilityUmamusumeUid: number }
  | { kind: "discardForAbility"; abilityUmamusumeUid: number }
  | { kind: "discardForAttackBonus"; attackIndex: number; randomDiscardIndex?: number | undefined }
  | { kind: "discardForScout"; handIndex: number }
  | { kind: "deckForScout"; handIndex: number; discardHandIndex: number; discardedCardName: string }
  | { kind: "deckForEvolutionSearch"; handIndex: number }
  | { kind: "deckForAttackEvolution"; evolvesFrom: string; stage: number };

export type ActionNoticeSource =
  | { kind: "genericGain" }
  | { kind: "traineeScoutTicket" }
  | { kind: "3starMakeDebutScout"; discardedCardName: string };

export type AppScreen = "mainMenu" | "modeSelect" | "pvpLobby" | "decks" | "cards" | "customisation" | "match";
export type MatchMode = "playerVsPlayer" | "playerVsAi" | "aiVsAi";

export type PreviewTone = {
  accent: string;
};

export type PremadeDeck = SharedPremadeDeck;
