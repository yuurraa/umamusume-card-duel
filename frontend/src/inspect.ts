import type { PokemonCard, PokemonInstance, SideId, TrainerCard } from "../../shared/src/types";

export type InspectTarget = {
  card: PokemonCard | TrainerCard;
  pokemon?: PokemonInstance;
  sideId?: SideId;
  isActive?: boolean;
};
