export type SideId = "player" | "opponent";
export type CoinFlipResult = "heads" | "tails";
export type EnergyType = "grass" | "fire" | "water" | "lightning" | "psychic" | "fighting" | "darkness" | "steel" | "colorless" | "dragon";
export type UmamusumeType = "Grass" | "Fire" | "Water" | "Lightning" | "Psychic" | "Fighting" | "Darkness" | "Steel" | "Colorless" | "Dragon";
export type EnergyRequirement = EnergyType | "colorless";
export type EnergyCost = Partial<Record<EnergyRequirement, number>>;
export type TrainerType = "supporter" | "item" | "stadium";
export type OpponentTurnStep = "bench" | "trainerBefore" | "evolve" | "attach" | "trainerAfter" | "attack" | "finish";

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
  damagePerUmamusumeInPlay?: {
    side: "own" | "all";
    amount: number;
  };
};

export type Ability = {
  name: string;
  text: string;
  heal?: number;
  activeHpBonus?: number;
  damageReduction?: number;
  moveBenchedEnergyToActive?: EnergyType | EnergyType[];
  attackDamageBonusIfAttachedEnergy?: {
    type: EnergyType;
    min: number;
    amount: number;
  };
  discardToDraw?: {
    discard: number;
    draw: number;
  };
};

export type UmamusumeCard = {
  id: string;
  owner: SideId;
  kind: "umamusume";
  name: string;
  label: string;
  species: string;
  type: UmamusumeType;
  stage: number;
  hp: number;
  portrait: string;
  weakness: { type: UmamusumeType; amount: number };
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
    searchUmamusume?: boolean;
    searchRandomBasicUmamusume?: boolean;
    revealSearchedCard?: boolean;
    retreatCostReduction?: number;
    gustOpponent?: boolean;
    activeAttackDamageBonus?: number;
    extraEnergyAttach?: number;
    attachEnergyFromZoneToBench?: number;
    globalRetreatCostReduction?: number;
    basicHpBonus?: number;
    shuffleHandIntoDeckDraw?: number;
  };
};

export type Card = UmamusumeCard | TrainerCard;

export type UmamusumeInstance = {
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
  | { kind: "promoteAfterKnockout"; resume: "finishOpponentTurn" | "none" }
  | { kind: "switchAfterGust"; resume: "resumeOpponentAfterFirstTrainerPass" | "resumeOpponentAfterSecondTrainerPass" | "none" };

export type SetupState = {
  coinFlipResult: CoinFlipResult;
  opponentReady: boolean;
  opponentRevealed: boolean;
};

export type SideState = {
  id: SideId;
  title: string;
  energyPool: EnergyType[];
  deck: string[];
  discard: string[];
  hand: string[];
  active: UmamusumeInstance | null;
  bench: UmamusumeInstance[];
  points: number;
  energyZone: EnergyType[];
  energyAttachmentsThisTurn: number;
  bonusEnergyAttachments: number;
  retreatCostReduction: number;
  activeAttackDamageBonus: number;
  usedSupporterThisTurn: boolean;
  usedRetreatThisTurn: boolean;
  usedStadiumThisTurn: boolean;
  usedAbilityNamesThisTurn: string[];
};

export type GameState = {
  phase: "setup" | "play";
  setup: SetupState | null;
  pendingPlayerChoice: PendingPlayerChoice | null;
  sides: Record<SideId, SideState>;
  currentSide: SideId | "done";
  opponentTurnStep: OpponentTurnStep | null;
  stadium: { cardId: string; owner: SideId } | null;
  turnNumber: number;
  firstPlayer: SideId;
  gameOver: boolean;
  winner: SideId | null;
  log: string[];
};

export type PlayAction =
  | { canPlay: true; type: "benchBasic" }
  | { canPlay: true; type: "evolve"; target: UmamusumeInstance }
  | { canPlay: true; type: "trainer" }
  | { canPlay: false; reason: string };

export type GameData = {
  cards: Record<string, Card>;
  playerDeckList: string[];
  opponentDeckList: string[];
};
