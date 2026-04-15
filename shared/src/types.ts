export type SideId = "player" | "rival";
export type CoinFlipResult = "heads" | "tails";
export type EnergyType = "grass" | "fire" | "water" | "lightning" | "psychic" | "fighting" | "darkness" | "metal";
export type PokemonType = "Grass" | "Fire" | "Water" | "Lightning" | "Psychic" | "Fighting" | "Darkness" | "Metal";
export type EnergyRequirement = EnergyType | "colorless";
export type EnergyCost = Partial<Record<EnergyRequirement, number>>;
export type TrainerType = "supporter" | "item" | "stadium";
export type RivalTurnStep = "bench" | "trainerBefore" | "evolve" | "attach" | "trainerAfter" | "attack" | "finish";

export type Attack = {
  name: string;
  cost: EnergyCost;
  damage: number;
  text: string;
  coinBonus?: number;
  draw?: number;
  heal?: number;
  healTarget?: "self" | "any";
  discardEnergy?: Partial<Record<EnergyType, number>>;
  preventDamageNextTurn?: number;
  bonusIfTookDamageLastTurn?: number;
  damagePerAttachedEnergy?: {
    types: EnergyType[];
    amount: number;
  };
};

export type Ability = {
  name: string;
  text: string;
  heal?: number;
  activeHpBonus?: number;
  damageReduction?: number;
  moveBenchedEnergyToActive?: EnergyType;
};

export type PokemonCard = {
  id: string;
  owner: SideId;
  kind: "pokemon";
  name: string;
  label: string;
  species: string;
  type: PokemonType;
  stage: number;
  hp: number;
  portrait: string;
  weakness: { type: PokemonType; amount: number };
  retreat: string;
  attacks: Attack[];
  evolvesFrom?: string;
  ability?: Ability;
};

export type TrainerCard = {
  id: string;
  kind: "trainer";
  trainerType: TrainerType;
  name: string;
  label: string;
  image: string;
  text: string;
  effect: {
    draw?: number;
    heal?: number;
    healTarget?: "active" | "any";
    discardOtherCard?: boolean;
    searchPokemon?: boolean;
    searchRandomBasicPokemon?: boolean;
    revealSearchedCard?: boolean;
    retreatCostReduction?: number;
    gustOpponent?: boolean;
    attackDamageBonus?: number;
    extraEnergyAttach?: number;
    globalRetreatCostReduction?: number;
    basicHpBonus?: number;
  };
};

export type Card = PokemonCard | TrainerCard;

export type PokemonInstance = {
  uid: number;
  cardId: string;
  species: string;
  stage: number;
  hp: number;
  maxHp: number;
  energies: Record<EnergyType, number>;
  enteredTurn: number;
  evolvedTurn: number | null;
  tookDamageLastTurn: boolean;
  tookDamageThisTurn: boolean;
  nextTurnDamageReduction: number;
  usedAbilityThisTurn: boolean;
};

export type PendingPlayerChoice =
  | { kind: "promoteAfterKnockout"; resume: "finishRivalTurn" | "none" }
  | { kind: "switchAfterGust"; resume: "resumeRivalAfterFirstTrainerPass" | "resumeRivalAfterSecondTrainerPass" | "none" };

export type SetupState = {
  coinFlipResult: CoinFlipResult;
  rivalReady: boolean;
  rivalRevealed: boolean;
};

export type SideState = {
  id: SideId;
  title: string;
  energyPool: EnergyType[];
  deck: string[];
  discard: string[];
  hand: string[];
  active: PokemonInstance | null;
  bench: PokemonInstance[];
  points: number;
  energyZone: EnergyType[];
  energyAttachmentsThisTurn: number;
  bonusEnergyAttachments: number;
  retreatCostReduction: number;
  attackDamageBonus: number;
  usedSupporterThisTurn: boolean;
  usedRetreatThisTurn: boolean;
};

export type GameState = {
  phase: "setup" | "play";
  setup: SetupState | null;
  pendingPlayerChoice: PendingPlayerChoice | null;
  sides: Record<SideId, SideState>;
  currentSide: SideId | "done";
  rivalTurnStep: RivalTurnStep | null;
  stadium: { cardId: string; owner: SideId } | null;
  turnNumber: number;
  firstPlayer: SideId;
  gameOver: boolean;
  winner: SideId | null;
  log: string[];
};

export type PlayAction =
  | { canPlay: true; type: "benchBasic" }
  | { canPlay: true; type: "evolve"; target: PokemonInstance }
  | { canPlay: true; type: "trainer" }
  | { canPlay: false; reason: string };

export type GameData = {
  cards: Record<string, Card>;
  playerDeckList: string[];
  rivalDeckList: string[];
};
