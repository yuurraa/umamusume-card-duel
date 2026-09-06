export type SideId = "player" | "opponent";
export type AiDifficulty = "easy" | "normal" | "hard";
export type AiDeckStyle = "blitz" | "scaleBench" | "stall" | "balanced";
export type CoinFlipResult = "heads" | "tails";
export type EnergyType = "grass" | "fire" | "water" | "lightning" | "psychic" | "fighting" | "darkness" | "steel" | "colorless" | "dragon";
export type UmamusumeType = "Grass" | "Fire" | "Water" | "Lightning" | "Psychic" | "Fighting" | "Darkness" | "Steel" | "Colorless" | "Dragon";
export type EnergyRequirement = EnergyType | "colorless";
export type EnergyCost = Partial<Record<EnergyRequirement, number>>;
export type TrainerType = "supporter" | "item" | "stadium" | "tool";
export type SpecialCondition = "asleep" | "burned" | "frozen" | "paralysed" | "poisoned";
export type CardRarity = "common" | "uncommon" | "uncommonPlus" | "rare" | "artRare" | "specialArtRare" | "secretRare" | "ultraRare";
export type CardPrintVariant = "standard" | "holographic";
export type OpponentTurnStep = "bench" | "trainerBefore" | "evolve" | "attach" | "trainerAfter" | "attack" | "finish";
export type PremadeDeck = {
  id: string;
  name: string;
  coverCardId: string;
  cardIds: string[];
  energyTypes?: EnergyType[];
};

export type Attack = {
  name: string;
  cost: EnergyCost;
  damage: number;
  text: string;
  targetOpponent?: "active" | "any";
  benchDamage?: number;
  coinBonus?: number;
  drawOnHeads?: number;
  draw?: number;
  heal?: number;
  healTarget?: "self" | "any";
  discardEnergy?: Partial<Record<EnergyType, number>>;
  evolveFromDeck?: boolean;
  recoverSpecialConditions?: boolean;
  shuffleSelfIntoDeck?: {
    discardEnergy: Partial<Record<EnergyType, number>>;
    requiresBench: boolean;
  };
  switchSelfAfterAttack?: {
    bonusDamage?: number;
  };
  preventDamageNextTurn?: number;
  bonusIfTookDamageLastTurn?: number;
  damagePerAttachedEnergy?: {
    types: EnergyType[];
    amount: number;
  };
  damagePerUniqueAttachedEnergy?: number;
  damagePerUmamusumeInPlay?: {
    side: "own" | "all";
    amount: number;
  };
  attackDamageBonusIfToolAttached?: number;
  attackDamageBonusIfDiscardHandCard?: number;
  attackDamageBonusPerDiscardedHandCard?: {
    maxDiscard: number;
    bonusPerCard: number;
  };
  discardRandomOpponentHandOnHeads?: {
    selfDamage: number;
  };
  shuffleRandomDiscardIntoDeck?: number;
  guaranteeNextCoinFlipHeads?: number;
  knockOutActiveIfAllCoinHeads?: number;
  cannotAttackNextTurn?: boolean;
  inflictSpecialCondition?: SpecialCondition;
};

export type Ability = {
  name: string;
  text: string;
  heal?: number;
  damageOpponent?: number;
  damageOpponentTarget?: "active" | "any";
  discardEnergy?: Partial<Record<EnergyType, number>>;
  activeHpBonus?: number;
  allHpBonus?: number;
  damageReduction?: number;
  moveBenchedEnergyToActive?: EnergyType | EnergyType[];
  attackDamageBonusIfAttachedEnergy?: {
    type: EnergyType;
    min: number;
    amount: number;
  };
  attackDamageBonusIfEvolvedLastTurn?: number;
  disableOtherUmamusumeAbilitiesWhileActive?: boolean;
  oncePerGame?: boolean;
  shuffleRandomDiscardIntoDeck?: number;
  discardToDraw?: {
    discard: number;
    draw: number;
  };
  coinFlipDrawOrActiveDamageCounter?: {
    draw: number;
    damageOnTails: number;
  };
  retreatCostZeroIfTookDamageLastTurn?: boolean;
  retreatCostZeroIfHasEnergy?: boolean;
};

export type UmamusumeCard = {
  id: string;
  implemented?: boolean;
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
  implemented?: boolean;
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
    searchEvolutionUmamusume?: boolean;
    searchRandomBasicUmamusume?: boolean;
    revealSearchedCard?: boolean;
    retreatCostReduction?: number;
    gustOpponent?: boolean;
    activeAttackDamageBonus?: number;
    extraEnergyAttach?: number;
    attachEnergyFromZoneToBench?: number;
    moveEnergyFromBenchToActive?: boolean;
    shuffleOpponentHandIntoDeckDraw?: number;
    swapHandUmamusumeWithRandomDeckUmamusume?: boolean;
    discardToolOrStadium?: boolean;
    revealOpponentHand?: boolean;
    globalRetreatCostReduction?: number;
    basicHpBonus?: number;
    shuffleHandIntoDeckDraw?: number;
    randomBasicUmamusumeFromDiscard?: boolean;
    rainbowUncapCrystal?: boolean;
    discardRandomOpponentActiveEnergy?: boolean;
    recoverActiveSpecialConditions?: boolean;
    toolDamageReduction?: number;
    toolCounterDamage?: number;
    toolEndTurnHealActive?: number;
    toolEndTurnRecoverSpecialConditionsDiscardSelf?: boolean;
    disableTools?: boolean;
  };
};

export type Card = UmamusumeCard | TrainerCard;

export type UmamusumeInstance = {
  uid: number;
  cardId: string;
  evolutionCardIds: string[];
  species: string;
  stage: number;
  hp: number;
  maxHp: number;
  energies: Record<EnergyType, number>;
  specialConditions: SpecialCondition[];
  enteredTurn: number;
  evolvedTurn: number | null;
  tookDamageLastTurn: boolean;
  tookDamageThisTurn: boolean;
  nextTurnDamageReduction: number;
  usedAbilityThisTurn: boolean;
  attackBlockedUntilOwnTurn: number | null;
  paralysedUntilOwnTurn: number | null;
  toolCardId: string | null;
};

export type PendingPlayerChoice =
  | { kind: "promoteAfterKnockout"; sideId: SideId; resume: "finishOpponentTurn" | "none" }
  | { kind: "switchAfterGust"; sideId: SideId; resume: "resumeOpponentAfterFirstTrainerPass" | "resumeOpponentAfterSecondTrainerPass" | "none" };

export type GameEventVisibility = "public" | "actor" | "private";

export type GameEventBase = {
  id: number;
  transitionId: number;
  visibility: GameEventVisibility;
};

export type GameEvent =
  | (GameEventBase & {
    kind: "attack";
    actorSide: SideId;
    actorUid: number;
    targetSide: SideId;
    targetUid: number;
    attackName: string;
    damage: number;
    hpBefore: number;
    hpAfter: number;
  })
  | (GameEventBase & {
    kind: "damage" | "heal";
    actorSide?: SideId;
    targetSide: SideId;
    targetUid: number;
    amount: number;
    hpBefore: number;
    hpAfter: number;
  })
  | (GameEventBase & {
    kind: "knockout";
    scoringSide: SideId;
    knockedSide: SideId;
    targetUid: number;
    cardId: string;
    points: number;
    cause?: string;
  })
  | (GameEventBase & {
    kind: "score";
    side: SideId;
    points: number;
  })
  | (GameEventBase & {
    kind: "promotion";
    side: SideId;
    targetUid: number;
  })
  | (GameEventBase & {
    kind: "coin";
    side: SideId;
    results: CoinFlipResult[];
  })
  | (GameEventBase & {
    kind: "turn";
    side: SideId;
    turnNumber: number;
  })
  | (GameEventBase & {
    kind: "cardMovement";
    side: SideId;
    from: "deck" | "hand" | "discard" | "play";
    to: "deck" | "hand" | "discard" | "play";
    count: number;
    cardIds?: string[];
  })
  | (GameEventBase & {
    kind: "energy";
    side: SideId;
    targetUid: number;
    energyType: EnergyType;
    amount: number;
  })
  | (GameEventBase & {
    kind: "evolution";
    side: SideId;
    targetUid: number;
    fromCardId: string;
    toCardId: string;
  })
  | (GameEventBase & {
    kind: "status";
    side: SideId;
    targetUid: number;
    condition: SpecialCondition;
  })
  | (GameEventBase & {
    kind: "gameEnd";
    winner: SideId;
    reason: "points" | "noBench" | "surrender" | "disconnect";
  })
  | (GameEventBase & {
    kind: "message";
    message: string;
  });

export type SetupState = {
  coinChoice: CoinFlipResult | null;
  coinFlipResult: CoinFlipResult | null;
  openingHands: Record<SideId, string[]>;
  openingHandsDealt: boolean;
  readyBySide: Record<SideId, boolean>;
  opponentRevealed: boolean;
  countdownSecondsRemaining: number | null;
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
  usedAbilityNamesThisGame: string[];
  guaranteedCoinFlipHeads: number;
};

export type GameState = {
  /** Match-local allocator; never derive instance identity from module state. */
  nextUmamusumeUid: number;
  phase: "setup" | "play";
  setup: SetupState | null;
  pendingPlayerChoice: PendingPlayerChoice | null;
  sides: Record<SideId, SideState>;
  currentSide: SideId | "done";
  opponentTurnStep: OpponentTurnStep | null;
  stadium: { cardId: string; owner: SideId } | null;
  turnDeadlineMs: number | null;
  turnNumber: number;
  firstPlayer: SideId;
  turnsTakenBySide: Record<SideId, number>;
  aiDifficulty: AiDifficulty;
  humanBySide: Record<SideId, boolean>;
  aiDeckStyleBySide: Record<SideId, AiDeckStyle>;
  gameOver: boolean;
  winner: SideId | null;
  log: string[];
  /** Structured transition events are retained locally for presentation and catch-up. */
  events?: GameEvent[];
  nextEventId?: number;
  nextTransitionId?: number;
  activeTransitionId?: number;
};

export type PlayAction =
  | { canPlay: true; type: "benchBasic" }
  | { canPlay: true; type: "evolve"; target: UmamusumeInstance }
  | { canPlay: true; type: "attachTool"; target: UmamusumeInstance }
  | { canPlay: true; type: "trainer" }
  | { canPlay: false; reason: string };

export type GameData = {
  cards: Record<string, Card>;
  playerDeckList: string[];
  opponentDeckList: string[];
};
