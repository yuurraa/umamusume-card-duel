import type { EnergyType, UmamusumeType } from "../../../../../shared/src/types";

export const ALL_ENERGY_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

export const UMAMUSUME_TYPE_TO_ENERGY: Record<UmamusumeType, EnergyType> = {
  Grass: "grass",
  Fire: "fire",
  Water: "water",
  Lightning: "lightning",
  Psychic: "psychic",
  Fighting: "fighting",
  Darkness: "darkness",
  Steel: "steel",
  Colorless: "colorless",
  Dragon: "dragon",
};

export const ENERGY_LABELS: Record<EnergyType, string> = {
  grass: "Grass Energy",
  fire: "Fire Energy",
  water: "Water Energy",
  lightning: "Lightning Energy",
  psychic: "Psychic Energy",
  fighting: "Fighting Energy",
  darkness: "Darkness Energy",
  steel: "Steel Energy",
  colorless: "Colorless Energy",
  dragon: "Dragon Energy",
};
