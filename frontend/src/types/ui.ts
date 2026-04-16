import type { EnergyType } from "../../../shared/src/types";
import type { premadeDecks } from "../../../shared/src/gameData";

export type PendingSelection =
  | { kind: "attachEnergy" }
  | { kind: "retreatTarget" }
  | { kind: "replaceActive" }
  | { kind: "attackHealTarget" }
  | { kind: "healTarget"; handIndex: number }
  | { kind: "evolveTarget"; handIndex: number }
  | { kind: "moveEnergyAbility"; abilityPokemonUid: number; energyTypes: EnergyType[] }
  | { kind: "discardForScout"; handIndex: number }
  | { kind: "deckSearch"; handIndex: number; discardHandIndex: number; discardedCardName: string };

export type ActionNoticeSource =
  | { kind: "genericGain" }
  | { kind: "traineeScoutTicket" }
  | { kind: "makeDebutScout"; discardedCardName: string };

export type AppScreen = "mainMenu" | "decks" | "match";

export type PreviewTone = {
  accent: string;
};

export type PremadeDeck = (typeof premadeDecks)[number];
