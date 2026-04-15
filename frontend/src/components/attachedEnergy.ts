import type { EnergyType, PokemonInstance } from "../../../shared/src/types";

export function getAttachedEnergy(pokemon: PokemonInstance): EnergyType[] {
  const energyEntries = Object.entries(pokemon.energies) as [EnergyType, number][];
  return energyEntries.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
}
