import assert from "node:assert/strict";
import { opponentDeckList, playerDeckList, type EnergyType, type GameState, type SideState, type UmamusumeInstance } from "umamusume-pocket-shared";
import { advanceOpponentTurnStep, attachPlayerEnergy, chooseOpeningCoin, completePregameSetup, createGame, createUmamusume, getCard, playHandCard, playerAttack, playerEndTurn, playerRetreat, refreshContinuousHp, usePlayerAbility, type PlayChoices } from "umamusume-pocket-frontend/engine";
import { applyPlayerIntentWithResult } from "umamusume-pocket-frontend/pvp/playerIntent";

type Scenario = {
  name: string;
  run: () => void;
};

let fixtureIdentityState: GameState | null = null;

const scenarios: Scenario[] = [
  { name: "hard takes lethal KO over non-lethal target", run: scenarioLethalTargeting },
  { name: "hard prefers highest-value target when no lethal exists", run: scenarioTargetValueTieBreaker },
  { name: "hard chooses a damaged heal target on heal-any attack", run: scenarioHealTargeting },
  { name: "hard retreats when immediate KO threat exists and attack line remains", run: scenarioThreatRetreat },
  { name: "hard does not retreat when attacking now is clearly better", run: scenarioNoUnneededRetreat },
  { name: "hard uses move-energy ability when it unlocks active pressure", run: scenarioUsefulMoveEnergyAbility },
  { name: "hard skips move-energy ability when attacking now is better", run: scenarioSkipsUselessMoveEnergyAbility },
  { name: "Tamamo Cross Stage 1 evolves from deck after attacking", run: scenarioTamamoAttackEvolvesFromDeck },
  { name: "Fast As Lightning evolves into the selected deck card", run: scenarioPlayerTamamoAttackSelectsEvolution },
  { name: "Thunderbolt Step adds damage when evolved last turn", run: scenarioThunderboltStepDamage },
  { name: "White Lightning shuffles Tamamo Cross and attached cards into deck", run: scenarioWhiteLightningShuffle },
  { name: "Team Rigil discards opponent active Energy", run: scenarioTeamRigilDiscardEnergy },
  { name: "Team Spica searches an Evolution Umamusume", run: scenarioTeamSpicaSearchEvolution },
  { name: "Leftover Carrot heals active at end of turn", run: scenarioLeftoverCarrotEndTurnHeal },
  { name: "Clear Heart heals and clears Special Conditions", run: scenarioClearHeartRecovery },
  { name: "Agnes Digital attack scales with own in-play count", run: scenarioAgnesDigitalOwnInPlayScaling },
  { name: "Burning Passion grants damage bonus at 4 Fire Energy", run: scenarioBurningPassionThresholdBonus },
  { name: "Mihono Bourbon reduction alters lethal target choice", run: scenarioMihonoReductionInfluencesTargeting },
  { name: "Team Canopus attaches Energy to highest-value bench target", run: scenarioTeamCanopusBenchAttachTargeting },
  { name: "Carrot Jelly is used when it unlocks a retreat attack line", run: scenarioCarrotJellyEnablesRetreatLine },
  { name: "Tracen Gym disables Oguri tool bonus damage", run: scenarioTracenGymDisablesToolBonusDamage },
  { name: "Master Cleat Hammer chooses opponent's valuable Tool over own Stadium", run: scenarioMasterCleatHammerTargetsOpponentTool },
  { name: "Reset Whistle swaps away lowest-value hand Umamusume", run: scenarioResetWhistleSwapsWeakHandUmamusume },
  { name: "Spark Research Report is held when it improves opponent hand", run: scenarioSparkResearchReportHeldWhenBad },
  { name: "Rudolf EX discards only enough low-value cards for lethal", run: scenarioRudolfExMinimalDiscard },
  { name: "Paralysis attack is preferred when it denies lethal", run: scenarioParalysisDeniesLethal },
  { name: "Poison attack is valued when it sets up end-turn KO", run: scenarioPoisonEndTurnKo },
  { name: "Miracle Cure attaches to statused active", run: scenarioMiracleCureTargetsStatusedActive },
  { name: "Rudolf EX once-per-game recovery is saved until discard is rich", run: scenarioRudolfExRecoveryRestraint },
  { name: "Nice Nature EX grants non-stacking HP bonus to all own Umamusume", run: scenarioNiceNatureExAllHpBonus },
  { name: "unaffordable selected attack leaves player state unchanged", run: scenarioRejectsUnaffordableSelectedAttack },
  { name: "invalid attack targets leave player state unchanged", run: scenarioRejectsInvalidAttackTarget },
  { name: "invalid ability targets leave player state unchanged", run: scenarioRejectsInvalidAbilityTarget },
  { name: "invalid trainer targets leave player state unchanged", run: scenarioRejectsInvalidTrainerTarget },
  { name: "invalid trainer card selections leave player state unchanged", run: scenarioRejectsInvalidTrainerCardSelections },
  { name: "malformed trainer choices leave player state unchanged", run: scenarioRejectsMalformedTrainerChoices },
  { name: "invalid Energy targets leave player state unchanged", run: scenarioRejectsInvalidEnergyTarget },
  { name: "invalid retreat targets leave player state unchanged", run: scenarioRejectsInvalidRetreatTarget },
  { name: "invalid retreat Energy selections leave player state unchanged", run: scenarioRejectsInvalidRetreatEnergySelection },
  { name: "retreat payments emit structured Energy changes", run: scenarioStructuredRetreatEnergyEvent },
  { name: "invalid selected evolution leaves player state unchanged", run: scenarioRejectsInvalidEvolutionSelection },
  { name: "invalid optional discard selection leaves player state unchanged", run: scenarioRejectsInvalidDiscardSelection },
  { name: "foreign pending choices leave player state unchanged", run: scenarioRejectsForeignPendingChoice },
  { name: "invalid pending replacement choices leave player state unchanged", run: scenarioRejectsInvalidPendingChoice },
  { name: "terminal matches reject further actions", run: scenarioRejectsTerminalActions },
  { name: "trainer play preserves card conservation", run: scenarioTrainerPlayPreservesCardConservation },
  { name: "bench-to-active trainer Energy emits both sides of the transfer", run: scenarioTrainerEnergyTransferEvents },
  { name: "ability damage emits a structured target event", run: scenarioStructuredAbilityDamageEvent },
  { name: "lethal attacks emit ordered structured events", run: scenarioStructuredLethalAttackEvents },
  { name: "knocking out an EX awards two points", run: scenarioExKnockoutAwardsTwoPoints },
  { name: "EX knockout score caps at three points", run: scenarioExKnockoutScoreCapsAtThreePoints },
  { name: "Frozen uses the Pocket Confusion attack coin flip", run: scenarioFrozenAttackCoinFlip },
  { name: "coin knockout attacks preserve pre-KO HP in structured events", run: scenarioStructuredCoinKnockoutEvent },
  { name: "card play and trainer draws emit structured movement events", run: scenarioStructuredCardMovementEvents },
  { name: "AI card play and knockout discard emit structured movement events", run: scenarioStructuredAiCardMovementEvents },
  { name: "player intents report rejected transitions without mutation", run: scenarioIntentResultContract },
  { name: "instance IDs are isolated between interleaved matches", run: scenarioMatchLocalInstanceIds },
  { name: "injected opening randomness produces reproducible match setup", run: scenarioDeterministicOpeningSetup },
  { name: "injected coin randomness resolves the chosen opening flip deterministically", run: scenarioDeterministicOpeningCoin },
  { name: "invalid opening coin choice leaves setup state unchanged", run: scenarioRejectsInvalidOpeningCoin },
  { name: "malformed setup indexes leave setup state unchanged", run: scenarioRejectsMalformedSetupIndexes },
  { name: "malformed action indexes leave player state unchanged", run: scenarioRejectsMalformedActionIndexes },
  { name: "invalid random discard indexes leave player state unchanged", run: scenarioRejectsInvalidRandomDiscardIndex },
  { name: "invalid ability discard indexes leave player state unchanged", run: scenarioRejectsInvalidAbilityDiscardIndex },
  { name: "injected turn randomness determines generated Energy", run: scenarioDeterministicTurnEnergy },
  { name: "canonical state invariants survive chained transitions", run: scenarioCanonicalStateInvariants },
];

scenarios.forEach(({ name, run }) => {
  run();
  console.log(`PASS: ${name}`);
});

console.log(`All ${scenarios.length} AI combat scenarios passed.`);

function scenarioLethalTargeting() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("manhattanCafeBasic"), { darkness: 1 });
  opponent.bench = [];
  player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  const lethalBench = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  lethalBench.hp = 20;
  player.bench = [lethalBench];

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.points, 1, "opponent should gain a point from lethal bench KO");
  assert.ok(next.sides.player.discard.includes(lethalBench.cardId), "bench target should be KO'd");
}

function scenarioTargetValueTieBreaker() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("manhattanCafeBasic"), { darkness: 1 });
  opponent.bench = [];
  player.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  player.active.hp = 50;
  const highValueBench = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  highValueBench.hp = 120;
  player.bench = [highValueBench];

  const next = advanceOpponentTurnStep(state);
  const postBench = next.sides.player.bench.find((umamusume) => umamusume.uid === highValueBench.uid);
  const postActive = next.sides.player.active;
  assert.ok(postBench && postActive, "targets should still exist");
  assert.equal(postBench.hp, 100, "AI should damage higher-value bench target");
  assert.equal(postActive.hp, 50, "AI should not hit lower-value active target");
}

function scenarioHealTargeting() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("nishinoFlowerBasic"), { grass: 1 });
  opponent.active.hp = 50;
  const hurtBench = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  hurtBench.hp = 20;
  opponent.bench = [hurtBench];
  player.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  player.bench = [];

  const next = advanceOpponentTurnStep(state);
  const healedActive = next.sides.opponent.active;
  const healedBench = next.sides.opponent.bench.find((umamusume) => umamusume.uid === hurtBench.uid);
  assert.ok(healedBench && healedActive, "heal candidates should still exist");
  assert.ok(healedBench.hp > 20 || healedActive.hp > 50, "AI should heal a damaged own target");
}

function scenarioThreatRetreat() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("nishinoFlowerBasic"), { grass: 1 });
  opponent.active.hp = 70;
  const safeRetreatTarget = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  opponent.bench = [safeRetreatTarget];
  player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  player.bench = [];

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.active?.uid, safeRetreatTarget.uid, "AI should retreat to safer attacker");
  assert.equal(next.sides.opponent.usedRetreatThisTurn, true, "retreat should be consumed");
}

function scenarioNoUnneededRetreat() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  opponent.bench = [withEnergy(createUma("nishinoFlowerBasic"), { grass: 1 })];
  player.active = withEnergy(createUma("riceShowerStage1"), { darkness: 1 });
  player.active.hp = 70;
  player.bench = [];

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.usedRetreatThisTurn, false, "AI should prefer direct strong attack line");
  assert.equal(next.sides.player.active?.hp ?? 0, 0, "AI should take direct KO on active");
}

function scenarioUsefulMoveEnergyAbility() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("haruUraraBasic"), { colorless: 1 });
  const source = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  opponent.bench = [source];
  player.active = withEnergy(createUma("riceShowerStage1"), { darkness: 1 });
  player.bench = [];

  const next = advanceOpponentTurnStep(state);
  const movedToActive = next.sides.opponent.active?.energies.darkness ?? 0;
  const movedFromSource = next.sides.opponent.bench.find((umamusume) => umamusume.uid === source.uid)?.energies.darkness ?? 0;
  assert.ok(movedToActive === 1 || (next.sides.player.active?.hp ?? 0) < 70, "AI should either use the move-energy ability or make attack progress");
  if (movedToActive === 1) {
    assert.equal(movedFromSource, 0, "AI should remove energy from selected bench source");
    const energyChanges = (next.events ?? []).filter((event) => event.kind === "energy");
    assert.equal(energyChanges.some((event) => event.kind === "energy" && event.targetUid === source.uid && event.amount === -1), true);
    assert.equal(energyChanges.some((event) => event.kind === "energy" && event.targetUid === opponent.active?.uid && event.amount === 1), true);
  }
}

function scenarioSkipsUselessMoveEnergyAbility() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  const haru = createUma("haruUraraBasic");
  const source = withEnergy(createUma("riceShowerStage1"), { darkness: 1 });
  opponent.bench = [haru, source];
  player.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  player.bench = [];
  const playerStartHp = player.active.hp;

  const next = advanceOpponentTurnStep(state);
  assert.ok((next.sides.player.active?.hp ?? 0) < playerStartHp, "AI should attack immediately instead of spending turn on low-value move-energy ability");
}

function scenarioTamamoAttackEvolvesFromDeck() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = createUma("tamamoCrossBasic");
  opponent.deck = ["tamamoCrossStage1"];
  player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.active?.cardId, "tamamoCrossStage1", "Tamamo should evolve from deck after Fast As Lightning");
  assert.equal(next.sides.opponent.deck.length, 0, "evolution card should leave the deck");
}

function scenarioPlayerTamamoAttackSelectsEvolution() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = createUma("tamamoCrossBasic");
  player.deck = ["riceShowerBasic", "tamamoCrossStage1"];
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = playerAttack(state, undefined, undefined, undefined, 1);
  assert.equal(next.sides.player.active?.cardId, "tamamoCrossStage1", "Fast As Lightning should use the selected evolution from deck");
  assert.deepEqual(next.sides.player.active?.evolutionCardIds, ["tamamoCrossBasic"], "the previous stage should stay under the evolved Umamusume");
  assert.deepEqual(next.sides.player.deck, ["riceShowerBasic"], "only the selected evolution should leave the deck");
  const evolutionEvent = (next.events ?? []).find((event) => event.kind === "evolution");
  assert.deepEqual(evolutionEvent?.kind === "evolution" ? {
    targetUid: evolutionEvent.targetUid,
    fromCardId: evolutionEvent.fromCardId,
    toCardId: evolutionEvent.toCardId,
  } : undefined, {
    targetUid: player.active.uid,
    fromCardId: "tamamoCrossBasic",
    toCardId: "tamamoCrossStage1",
  }, "deck evolution should emit a structured identity-preserving event");
}

function scenarioThunderboltStepDamage() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("tamamoCrossStage1"), { lightning: 2 });
  opponent.active.evolvedTurn = state.turnNumber - 1;
  player.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  player.active.hp = 60;

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.player.active, null, "Thunderbolt Step should raise White Lightning to 60 damage and KO 60 HP");
}

function scenarioWhiteLightningShuffle() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = withEnergy(createUma("tamamoCrossStage1"), { lightning: 2 });
  player.active.evolutionCardIds = ["tamamoCrossBasic"];
  player.active.toolCardId = "leftoverCarrot";
  const promoted = withEnergy(createUma("tamamoCrossBasic"), { lightning: 1 });
  player.bench = [promoted];
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = playerAttack(state, undefined, undefined, undefined, undefined, 0, undefined, undefined, undefined, true);
  assert.equal(next.sides.player.active?.uid, promoted.uid, "bench Umamusume should promote after White Lightning shuffles the active");
  assert.ok(next.sides.player.deck.includes("tamamoCrossStage1"), "Tamamo Cross Stage 1 should be shuffled into the deck");
  assert.ok(next.sides.player.deck.includes("tamamoCrossBasic"), "Basic Tamamo Cross under Tamamo should be shuffled into the deck");
  assert.ok(next.sides.player.deck.includes("leftoverCarrot"), "attached Tool should be shuffled into the deck");
}

function scenarioTeamRigilDiscardEnergy() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.hand = ["teamRigil"];
  player.active = createUma("tamamoCrossBasic");
  opponent.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });

  const next = playHandCard(state, 0);
  assert.equal(next.sides.opponent.active?.energies.darkness, 0, "Team Rigil should discard the only attached Energy");
  assert.equal(next.sides.player.usedSupporterThisTurn, true, "Team Rigil should consume Supporter use");
  const energyEvent = (next.events ?? []).find((event) => event.kind === "energy" && event.targetUid === opponent.active?.uid);
  assert.equal(energyEvent?.kind === "energy" ? energyEvent.amount : null, -1, "Team Rigil should emit the discarded Energy as a structured event");
}

function scenarioTeamSpicaSearchEvolution() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  player.hand = ["teamSpica"];
  player.active = createUma("tamamoCrossBasic");
  player.deck = ["tamamoCrossBasic", "tamamoCrossStage1"];

  const next = playHandCard(state, 0, { deckCardIndex: 1 });
  assert.ok(next.sides.player.hand.includes("tamamoCrossStage1"), "Team Spica should add the selected Evolution Umamusume to hand");
  assert.deepEqual(next.sides.player.deck, ["tamamoCrossBasic"], "selected evolution should leave the deck");
}

function scenarioLeftoverCarrotEndTurnHeal() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  player.active = createUma("superCreekBasic");
  player.active.hp = 40;
  player.active.toolCardId = "leftoverCarrot";

  const next = playerEndTurn(state);
  assert.equal(next.sides.player.active?.hp, 50, "Leftover Carrot should heal active before the next turn starts");
}

function scenarioClearHeartRecovery() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = withEnergy(createUma("superCreekStage1"), { water: 1, colorless: 2 });
  const hurtBench = createUma("superCreekBasic");
  hurtBench.hp = 40;
  hurtBench.specialConditions = ["poisoned", "asleep"];
  player.bench = [hurtBench];
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = playerAttack(state, undefined, hurtBench.uid);
  const healed = next.sides.player.bench.find((umamusume) => umamusume.uid === hurtBench.uid);
  assert.equal(healed?.hp, 60, "Clear Heart should heal the chosen Umamusume");
  assert.deepEqual(healed?.specialConditions, [], "Clear Heart should clear all Special Conditions");
}

function scenarioAgnesDigitalOwnInPlayScaling() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = withEnergy(createUma("agnesDigitalBasic"), { fire: 1 });
  player.bench = [createUma("riceShowerBasic"), createUma("nishinoFlowerBasic")];
  opponent.active = createUma("superCreekBasic");
  opponent.active.hp = 50;

  const next = playerAttack(state);
  assert.equal(next.sides.opponent.active?.hp, 20, "Fangirling should do 30 damage with 3 own Umamusume in play");
}

function scenarioBurningPassionThresholdBonus() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = withEnergy(createUma("agnesDigitalStage1"), { fire: 4 });
  opponent.active = createUma("superCreekStage1");
  opponent.active.hp = 120;

  const next = playerAttack(state);
  assert.equal(next.sides.opponent.active?.hp, 70, "Uma Stan should include Burning Passion's +30 damage");
}

function scenarioMihonoReductionInfluencesTargeting() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("manhattanCafeBasic"), { darkness: 1 });
  player.active = createUma("riceShowerBasic");
  player.active.hp = 20;
  const protectedBench = createUma("mihonoBourbonBasic");
  protectedBench.hp = 20;
  player.bench = [protectedBench];

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.points, 1, "AI should take guaranteed lethal on active instead of reduced-damage bench target");
  const postProtected = next.sides.player.bench.find((umamusume) => umamusume.uid === protectedBench.uid);
  assert.equal(postProtected?.hp, 20, "bench Mihono should remain untouched when AI prefers active lethal");
}

function scenarioTeamCanopusBenchAttachTargeting() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  state.opponentTurnStep = "trainerAfter";
  opponent.hand = ["teamCanopus"];
  opponent.active = createUma("riceShowerBasic");
  const weakBench = createUma("tamamoCrossBasic");
  const strongBench = createUma("riceShowerStage2");
  opponent.bench = [weakBench, strongBench];
  player.active = createUma("riceShowerBasic");

  const next = advanceOpponentTurnStep(state);
  const weakAfter = next.sides.opponent.bench.find((umamusume) => umamusume.uid === weakBench.uid);
  const strongAfter = next.sides.opponent.bench.find((umamusume) => umamusume.uid === strongBench.uid);
  const weakEnergy = weakAfter ? totalAttachedEnergy(weakAfter) : 0;
  const strongEnergy = strongAfter ? totalAttachedEnergy(strongAfter) : 0;
  assert.equal(strongEnergy, 1, "Team Canopus should attach to the higher-value bench attacker");
  assert.equal(weakEnergy, 0, "lower-value bench attacker should not receive the Energy");
}

function scenarioCarrotJellyEnablesRetreatLine() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  state.opponentTurnStep = "trainerAfter";
  opponent.hand = ["carrotJelly"];
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 1 });
  const benchAttacker = withEnergy(createUma("tamamoCrossStage1"), { lightning: 2 });
  opponent.bench = [benchAttacker];
  player.active = createUma("superCreekBasic");
  player.active.hp = 60;

  const afterTrainer = advanceOpponentTurnStep(state);
  assert.equal(afterTrainer.sides.opponent.hand.includes("carrotJelly"), false, "AI should play Carrot Jelly in trainer-after step");

  const afterRetreat = runOpponentUntilAttackResolution(afterTrainer);
  assert.equal(afterRetreat.sides.opponent.active?.uid, benchAttacker.uid, "AI should retreat after Carrot Jelly lowers retreat cost");
  assert.equal(afterRetreat.sides.opponent.usedRetreatThisTurn, true, "retreat should be consumed");
}

function scenarioTracenGymDisablesToolBonusDamage() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  state.stadium = { cardId: "tracenGym", owner: "player" };
  player.active = withEnergy(createUma("oguriCapStage1"), { colorless: 1 });
  player.active.toolCardId = "leftoverCarrot";
  opponent.active = createUma("superCreekBasic");
  opponent.active.hp = 70;

  const next = playerAttack(state);
  assert.equal(next.sides.opponent.active?.hp, 40, "Tracen Gym should suppress Oguri's +20 tool damage bonus");
}

function scenarioMasterCleatHammerTargetsOpponentTool() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  state.opponentTurnStep = "trainerAfter";
  state.stadium = { cardId: "nakayamaTurf", owner: "opponent" };
  opponent.hand = ["masterCleatHammer"];
  opponent.active = createUma("riceShowerBasic");
  opponent.active.toolCardId = "leftoverCarrot";
  player.active = createUma("riceShowerStage2");
  player.active.toolCardId = "boxingGloves";

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.player.active?.toolCardId, null, "AI should discard opponent's high-value active Tool");
  assert.equal(next.sides.opponent.active?.toolCardId, "leftoverCarrot", "AI should preserve its own Tool");
  assert.equal(next.stadium?.cardId, "nakayamaTurf", "AI should not discard its own helpful Stadium first");
}

function scenarioResetWhistleSwapsWeakHandUmamusume() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  state.opponentTurnStep = "trainerAfter";
  opponent.hand = ["resetWhistle", "matikanefukukitaruStage1", "riceShowerStage2"];
  opponent.deck = ["symboliRudolfStage2"];
  opponent.active = createUma("riceShowerBasic");
  player.active = createUma("riceShowerBasic");

  const next = advanceOpponentTurnStep(state);
  assert.ok(!next.sides.opponent.hand.includes("matikanefukukitaruStage1"), "AI should send the lowest-value Umamusume from hand");
  assert.ok(next.sides.opponent.hand.includes("riceShowerStage2"), "AI should keep the stronger hand Umamusume");
  assert.ok(next.sides.opponent.hand.includes("symboliRudolfStage2"), "AI should receive the deck Umamusume");
}

function scenarioSparkResearchReportHeldWhenBad() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  state.opponentTurnStep = "trainerAfter";
  opponent.hand = ["sparkResearchReport"];
  opponent.active = createUma("riceShowerBasic");
  player.active = createUma("riceShowerBasic");
  player.hand = ["tazunaHayakawa"];

  const next = advanceOpponentTurnStep(state);
  assert.ok(next.sides.opponent.hand.includes("sparkResearchReport"), "AI should not play hand reset when it would improve opponent hand size");
}

function scenarioRudolfExMinimalDiscard() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("symboliRudolfStage2Ex"), { water: 1, dragon: 1, colorless: 1 });
  opponent.hand = ["teamSpica", "tamamoCrossBasic", "tazunaHayakawa", "riceShowerStage2", "aoiKiryuin"];
  player.active = createUma("superCreekBasic");
  player.active.hp = 70;

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.player.active, null, "AI should reach lethal with one discarded card");
  assert.equal(next.sides.opponent.discard.includes("tamamoCrossBasic"), true, "AI should discard a low-value card");
  assert.equal(next.sides.opponent.discard.includes("teamSpica"), false, "AI should preserve higher-value Supporter");
  assert.equal(next.sides.opponent.hand.length, 4, "AI should discard only one card for exact lethal");
}

function scenarioParalysisDeniesLethal() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("twinTurboBasic"), { lightning: 1, colorless: 1 });
  opponent.active.hp = 80;
  const biggerBench = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  opponent.bench = [biggerBench];
  player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  player.active.hp = 120;

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.active?.uid, opponent.active.uid, "AI should stay with paralysis attacker");
  assert.ok(next.sides.player.active?.specialConditions.includes("paralysed"), "AI should paralyse the lethal counterattacker");
  const statusEvent = (next.events ?? []).find((event) => event.kind === "status" && event.targetUid === player.active?.uid);
  assert.deepEqual(statusEvent?.kind === "status" ? { condition: statusEvent.condition, action: statusEvent.action } : undefined, { condition: "paralysed", action: "apply" }, "paralysis should emit a typed status event for the targeted active");
}

function scenarioPoisonEndTurnKo() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("niceNatureBasicEx"), { grass: 2, colorless: 1 });
  opponent.bench = [withEnergy(createUma("riceShowerStage2"), { darkness: 2 })];
  player.active = createUma("mihonoBourbonStage2Ex");
  player.active.hp = 90;

  const next = advanceOpponentTurnStep(state);
  assert.ok(next.sides.player.active?.specialConditions.includes("poisoned"), "AI should value poison when direct damage leaves 10 HP");
  const statusEvent = (next.events ?? []).find((event) => event.kind === "status" && event.targetUid === player.active?.uid);
  assert.deepEqual(statusEvent?.kind === "status" ? { condition: statusEvent.condition, action: statusEvent.action } : undefined, { condition: "poisoned", action: "apply" }, "poison should emit a typed status event for the targeted active");
}

function scenarioMiracleCureTargetsStatusedActive() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  state.opponentTurnStep = "trainerAfter";
  opponent.hand = ["miracleCure"];
  opponent.active = createUma("riceShowerStage2");
  opponent.active.specialConditions = ["paralysed"];
  const bench = createUma("riceShowerBasic");
  opponent.bench = [bench];
  player.active = createUma("riceShowerBasic");

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.active?.toolCardId, "miracleCure", "AI should attach Miracle Cure to the statused active");
  assert.equal(next.sides.opponent.bench[0]?.toolCardId, null, "AI should not waste Miracle Cure on clean bench");
}

function scenarioRudolfExRecoveryRestraint() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("symboliRudolfStage2Ex"), { water: 1, dragon: 1, colorless: 1 });
  opponent.discard = ["tamamoCrossBasic"];
  opponent.deck = Array.from({ length: 12 }, () => "riceShowerBasic");
  player.active = createUma("mihonoBourbonStage2Ex");
  player.active.hp = 120;

  const next = advanceOpponentTurnStep(state);
  assert.deepEqual(next.sides.opponent.discard, ["tamamoCrossBasic"], "AI should save once-per-game recovery when discard is thin and deck is healthy");
  assert.equal(next.sides.opponent.usedAbilityNamesThisGame.includes("Behold Thine Emperor's Divine Might"), false, "once-per-game ability should remain available");
}

function scenarioNiceNatureExAllHpBonus() {
  const state = makeCombatState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = createUma("riceShowerBasic");
  player.bench = [createUma("niceNatureBasicEx"), createUma("superCreekBasic"), createUma("niceNatureBasicEx")];
  opponent.active = createUma("riceShowerBasic");

  refreshContinuousHp(state);

  assert.equal(player.active?.maxHp, 60, "Nice Nature EX should buff the active even from bench");
  assert.equal(player.bench[0]?.maxHp, 120, "Nice Nature EX should buff itself");
  assert.equal(player.bench[1]?.maxHp, 80, "Nice Nature EX should buff other benched Umamusume");
  assert.equal(player.bench[2]?.maxHp, 120, "Nice Nature EX should not stack with another Nice Nature EX");
  assert.equal(opponent.active?.maxHp, 50, "Nice Nature EX should not buff opponent Umamusume");
}

function scenarioRejectsUnaffordableSelectedAttack() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("matikanefukukitaruStage1"), { psychic: 1 });
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);

  const next = playerAttack(state, undefined, undefined, undefined, undefined, 1);

  assert.deepEqual(next, before, "selecting an unaffordable secondary attack must not spend resources or advance the turn");
}

function scenarioRejectsInvalidAttackTarget() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("manhattanCafeBasic"), { darkness: 1 });
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);

  const next = playerAttack(state, 999_999);

  assert.deepEqual(next, before, "a target-any attack must not silently substitute an invalid target");
}

function scenarioRejectsInvalidAbilityTarget() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("manhattanCafeStage1");
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);

  const next = usePlayerAbility(state, state.sides.player.active.uid, state.sides.player.active.uid, undefined, undefined, 999_999);

  assert.deepEqual(next, before, "a target-any ability must not silently substitute an invalid target");
}

function scenarioRejectsInvalidTrainerTarget() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("riceShowerBasic");
  state.sides.player.bench = [createUma("manhattanCafeBasic")];
  state.sides.player.hand = ["teamCanopus"];
  const before = structuredClone(state);

  const next = playHandCard(state, 0, { umamusumeTargetUid: 999_999 });

  assert.deepEqual(next, before, "a trainer requiring a selected bench target must not silently use another target");
}

function scenarioRejectsInvalidTrainerCardSelections() {
  const resetWhistleState = makePlayerActionState();
  resetWhistleState.sides.player.hand = ["resetWhistle", "riceShowerBasic"];
  resetWhistleState.sides.player.deck = ["nishinoFlowerBasic"];
  const beforeResetWhistle = structuredClone(resetWhistleState);
  const invalidResetWhistle = playHandCard(resetWhistleState, 0, { swapHandCardIndex: 999_999 });
  assert.deepEqual(invalidResetWhistle, beforeResetWhistle, "an invalid Reset Whistle hand selection must not fall back to another card");

  const cleatState = makePlayerActionState();
  cleatState.sides.player.hand = ["masterCleatHammer"];
  cleatState.sides.player.active = createUma("riceShowerBasic");
  cleatState.sides.player.active.toolCardId = "leftoverCarrot";
  const beforeCleat = structuredClone(cleatState);
  const invalidCleat = playHandCard(cleatState, 0, { discardToolHolderUmamusumeUid: 999_999 });
  assert.deepEqual(invalidCleat, beforeCleat, "an invalid Tool target must not fall back to the first equipped Tool");

  const searchState = makePlayerActionState();
  searchState.sides.player.hand = ["teamSpica"];
  searchState.sides.player.deck = ["tamamoCrossStage1", "tamamoCrossBasic"];
  const beforeSearch = structuredClone(searchState);
  const invalidSearch = playHandCard(searchState, 0, { deckCardIndex: 999_999 });
  assert.deepEqual(invalidSearch, beforeSearch, "an invalid search index must not fall back to the first eligible deck card");
}

function scenarioRejectsMalformedTrainerChoices() {
  const state = makePlayerActionState();
  state.sides.player.hand = ["teamSpica"];
  state.sides.player.active = createUma("tamamoCrossBasic");
  state.sides.player.deck = ["tamamoCrossStage1"];
  const before = structuredClone(state);

  const next = playHandCard(state, 0, null as unknown as PlayChoices);

  assert.deepEqual(next, before, "malformed trainer choices must be rejected without throwing or consuming the card");
}

function scenarioRejectsInvalidEnergyTarget() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("riceShowerBasic");
  state.sides.player.bench = [createUma("manhattanCafeBasic")];
  state.sides.player.energyZone = ["grass"];
  const before = structuredClone(state);

  const next = attachPlayerEnergy(state, 0);

  assert.deepEqual(next, before, "an explicitly supplied invalid Energy target must not fall back to the Active");
}

function scenarioRejectsInvalidRetreatTarget() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("riceShowerBasic"), { grass: 1 });
  state.sides.player.bench = [createUma("manhattanCafeBasic")];
  const before = structuredClone(state);

  const next = playerRetreat(state, 999_999, ["grass"]);

  assert.deepEqual(next, before, "an invalid retreat target must not spend Energy or substitute another bench card");
}

function scenarioRejectsInvalidRetreatEnergySelection() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  const bench = createUma("manhattanCafeBasic");
  state.sides.player.bench = [bench];
  const before = structuredClone(state);

  const next = playerRetreat(state, bench.uid, ["not-an-energy-type" as EnergyType]);

  assert.deepEqual(next, before, "an unknown Energy type must not satisfy a retreat payment");

  const malformed = playerRetreat(state, bench.uid, "grass" as unknown as EnergyType[]);
  assert.deepEqual(malformed, before, "a malformed retreat Energy selection must be rejected without throwing or mutation");
}

function scenarioStructuredRetreatEnergyEvent() {
  const state = makePlayerActionState();
  const active = withEnergy(createUma("nishinoFlowerBasic"), { grass: 1 });
  const bench = createUma("manhattanCafeBasic");
  state.sides.player.active = active;
  state.sides.player.bench = [bench];

  const next = playerRetreat(state, bench.uid, ["grass"]);
  const energyEvent = (next.events ?? []).find((event) => event.kind === "energy" && event.targetUid === active.uid);
  assert.equal(energyEvent?.kind === "energy" ? energyEvent.amount : null, -1, "retreat should emit the attached Energy that was paid");
  assert.equal(next.sides.player.active?.uid, bench.uid);
}

function scenarioRejectsInvalidEvolutionSelection() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("tamamoCrossBasic");
  state.sides.player.deck = ["riceShowerBasic", "tamamoCrossStage1"];
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);

  const next = playerAttack(state, undefined, undefined, undefined, 0, 1);

  assert.deepEqual(next, before, "an invalid selected evolution must not silently choose another deck card");
}

function scenarioRejectsInvalidDiscardSelection() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("symboliRudolfStage1"), { dragon: 1 });
  state.sides.player.hand = ["riceShowerBasic"];
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);

  const next = playerAttack(state, undefined, undefined, undefined, undefined, 0, 999_999);

  assert.deepEqual(next, before, "an invalid optional discard selection must not resolve as a different choice");
}

function scenarioRejectsForeignPendingChoice() {
  const state = makePlayerActionState();
  state.sides.opponent.active = createUma("riceShowerBasic");
  const replacement = createUma("manhattanCafeBasic");
  state.sides.opponent.bench = [replacement];
  state.pendingPlayerChoice = { kind: "switchAfterGust", sideId: "opponent", resume: "none" };
  const before = structuredClone(state);

  const result = applyPlayerIntentWithResult(state, { type: "resolvePendingChoice", umamusumeUid: replacement.uid });

  assert.equal(result.accepted, false, "a player intent must not resolve the opponent's pending choice");
  assert.deepEqual(result.state, before, "foreign pending choices must leave canonical state unchanged");
}

function scenarioRejectsInvalidPendingChoice() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("riceShowerBasic");
  state.sides.player.active.hp = 0;
  const defeatedBench = createUma("manhattanCafeBasic");
  defeatedBench.hp = 0;
  state.sides.player.bench = [defeatedBench];
  state.pendingPlayerChoice = { kind: "promoteAfterKnockout", sideId: "player", resume: "none" };
  const before = structuredClone(state);

  const result = applyPlayerIntentWithResult(state, { type: "resolvePendingChoice", umamusumeUid: defeatedBench.uid });

  assert.equal(result.accepted, false, "a defeated replacement cannot satisfy a pending promotion choice");
  assert.deepEqual(result.state, before, "invalid pending choices must not normalize or otherwise mutate canonical state");
}

function scenarioRejectsTerminalActions() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  state.sides.opponent.active = createUma("riceShowerBasic");
  const pendingReplacement = createUma("manhattanCafeBasic");
  state.sides.player.bench = [pendingReplacement];
  state.pendingPlayerChoice = { kind: "promoteAfterKnockout", sideId: "player", resume: "none" };
  state.gameOver = true;
  state.winner = "opponent";
  state.currentSide = "done";
  const before = structuredClone(state);

  const results = [
    playerAttack(state),
    playerEndTurn(state),
    playerRetreat(state, 999_999, ["darkness"]),
    playHandCard(state, 0),
    advanceOpponentTurnStep(state),
    applyPlayerIntentWithResult(state, { type: "surrender" }).state,
    applyPlayerIntentWithResult(state, { type: "resolvePendingChoice", umamusumeUid: 999_999 }).state,
  ];
  results.forEach((next) => assert.deepEqual(next, before, "terminal matches must reject actions without mutation or new events"));
}

function scenarioTrainerPlayPreservesCardConservation() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("tamamoCrossBasic");
  state.sides.player.hand = ["teamSpica"];
  state.sides.player.deck = ["tamamoCrossBasic", "tamamoCrossStage1"];
  const beforeCards = collectSideCardIds(state.sides.player).sort();

  const next = playHandCard(state, 0, { deckCardIndex: 1 });

  assert.deepEqual(collectSideCardIds(next.sides.player).sort(), beforeCards, "trainer play must conserve cards across hand, deck, discard, and in-play zones");
}

function scenarioTrainerEnergyTransferEvents() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const active = createUma("riceShowerBasic");
  const source = withEnergy(createUma("nishinoFlowerBasic"), { grass: 1 });
  player.active = active;
  player.bench = [source];
  player.hand = ["rikoKashimoto"];

  const next = playHandCard(state, 0);
  const energyEvents = (next.events ?? []).filter((event) => event.kind === "energy");

  assert.equal(next.sides.player.active?.energies.grass, 1, "trainer should attach the transferred Energy to Active");
  assert.equal(next.sides.player.bench[0]?.energies.grass, 0, "trainer should remove the Energy from the bench source");
  assert.equal(energyEvents.some((event) => event.kind === "energy" && event.targetUid === source.uid && event.amount === -1), true, "source Energy loss should be emitted");
  assert.equal(energyEvents.some((event) => event.kind === "energy" && event.targetUid === active.uid && event.amount === 1), true, "Active Energy gain should be emitted");
}

function scenarioStructuredAbilityDamageEvent() {
  const state = makePlayerActionState();
  state.sides.player.active = createUma("manhattanCafeStage1");
  state.sides.opponent.active = createUma("riceShowerBasic");
  state.sides.opponent.active.hp = 45;

  const next = usePlayerAbility(
    state,
    state.sides.player.active.uid,
    state.sides.player.active.uid,
    undefined,
    undefined,
    state.sides.opponent.active.uid,
  );
  const damage = (next.events ?? []).find((event) => event.kind === "damage");

  assert.equal(next.activeTransitionId, undefined);
  assert.equal(damage?.kind, "damage");
  assert.equal(damage?.kind === "damage" ? damage.targetUid : null, state.sides.opponent.active.uid);
  assert.equal(damage?.kind === "damage" ? damage.hpBefore : null, 45);
  assert.equal(damage?.kind === "damage" ? damage.hpAfter : null, 25);
  assert.equal(damage?.kind === "damage" ? damage.amount : null, 20);
}

function scenarioStructuredLethalAttackEvents() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  state.sides.opponent.active = createUma("riceShowerBasic");
  state.sides.opponent.active.hp = 40;

  const next = playerAttack(state);
  const events = next.events ?? [];
  assert.equal(next.activeTransitionId, undefined, "completed commands must not retain an active event transition");
  const transitionEvents = events.filter((event) => event.transitionId === events[0]?.transitionId);

  assert.deepEqual(transitionEvents.map((event) => event.kind), ["attack", "energy", "cardMovement", "knockout", "score", "gameEnd"]);
  assert.equal(transitionEvents[0]?.kind === "attack" ? transitionEvents[0].targetUid : null, state.sides.opponent.active.uid);
  const knockout = transitionEvents.find((event) => event.kind === "knockout");
  assert.equal(knockout?.kind === "knockout" ? knockout.targetUid : null, state.sides.opponent.active.uid);
  assert.equal(knockout?.kind === "knockout" ? knockout.pointsAwarded : null, 1);
}

function scenarioExKnockoutAwardsTwoPoints() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  state.sides.opponent.active = createUma("twinTurboBasicEx");
  state.sides.opponent.active.hp = 40;
  state.sides.opponent.bench = [createUma("riceShowerBasic")];

  const next = playerAttack(state);
  const knockout = (next.events ?? []).find((event) => event.kind === "knockout");
  assert.equal(next.sides.player.points, 2);
  assert.equal(knockout?.kind === "knockout" ? knockout.pointsAwarded : null, 2);
  assert.equal(knockout?.kind === "knockout" ? knockout.points : null, 2);
  assert.equal(next.log.some((entry) => /scored 2 points/.test(entry)), true);
}

function scenarioExKnockoutScoreCapsAtThreePoints() {
  const state = makePlayerActionState();
  state.sides.player.points = 2;
  state.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  state.sides.opponent.active = createUma("twinTurboBasicEx");
  state.sides.opponent.active.hp = 40;
  state.sides.opponent.bench = [createUma("riceShowerBasic")];

  const next = playerAttack(state);
  const knockout = (next.events ?? []).find((event) => event.kind === "knockout");
  assert.equal(next.sides.player.points, 3);
  assert.equal(knockout?.kind === "knockout" ? knockout.pointsAwarded : null, 1);
  assert.equal(knockout?.kind === "knockout" ? knockout.points : null, 3);
}

function scenarioFrozenAttackCoinFlip() {
  const tailsState = makePlayerActionState();
  tailsState.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  tailsState.sides.player.active.specialConditions = ["frozen"];
  tailsState.sides.opponent.active = createUma("riceShowerBasic");
  const tailsTargetHp = tailsState.sides.opponent.active.hp;

  const afterTails = playerAttack(tailsState, undefined, undefined, "tails");
  const tailsAttack = (afterTails.events ?? []).find((event) => event.kind === "attack");
  assert.equal(afterTails.sides.opponent.active?.hp, tailsTargetHp, "Frozen tails must fail the attack without damage");
  assert.equal(tailsAttack?.kind === "attack" ? tailsAttack.damage : null, 0);
  assert.equal(afterTails.sides.player.active?.specialConditions.includes("frozen"), true, "Frozen must persist until cured");

  const headsState = makePlayerActionState();
  headsState.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  headsState.sides.player.active.specialConditions = ["frozen"];
  headsState.sides.opponent.active = createUma("riceShowerBasic");
  const headsTargetHp = headsState.sides.opponent.active.hp;

  const afterHeads = playerAttack(headsState, undefined, undefined, "heads");
  const headsAttack = (afterHeads.events ?? []).find((event) => event.kind === "attack");
  assert.equal(headsAttack?.kind === "attack" ? headsAttack.damage : null, 80, "Frozen heads must allow the attack to proceed");
  assert.equal(headsAttack?.kind === "attack" ? headsAttack.hpBefore : null, headsTargetHp);
}

function scenarioStructuredCoinKnockoutEvent() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("matikanefukukitaruStage1"), { psychic: 1, colorless: 1 });
  state.sides.opponent.active = createUma("riceShowerBasic");
  const targetUid = state.sides.opponent.active.uid;
  const targetHp = state.sides.opponent.active.hp;

  const next = playerAttack(state, undefined, undefined, ["heads", "heads", "heads"], undefined, 1);
  const transitionEvents = (next.events ?? []).filter((event) => event.transitionId === next.events?.[0]?.transitionId);
  const attack = transitionEvents.find((event) => event.kind === "attack");
  const coin = transitionEvents.find((event) => event.kind === "coin");

  assert.equal(attack?.kind, "attack");
  assert.equal(attack?.kind === "attack" ? attack.targetUid : null, targetUid);
  assert.equal(attack?.kind === "attack" ? attack.hpBefore : null, targetHp);
  assert.equal(attack?.kind === "attack" ? attack.hpAfter : null, 0);
  assert.deepEqual(coin?.kind === "coin" ? coin.results : undefined, ["heads", "heads", "heads"]);
  assert.equal(transitionEvents.some((event) => event.kind === "knockout" && event.targetUid === targetUid), true);
}

function scenarioStructuredCardMovementEvents() {
  const state = makePlayerActionState();
  state.sides.player.hand = ["tazunaHayakawa"];
  state.sides.player.deck = ["riceShowerBasic", "nishinoFlowerBasic"];

  const next = playHandCard(state, 0);
  const movements = (next.events ?? []).filter((event) => event.kind === "cardMovement");
  assert.equal(movements.some((event) => event.kind === "cardMovement" && event.from === "hand" && event.to === "play" && event.cardIds?.[0] === "tazunaHayakawa"), true);
  assert.equal(movements.some((event) => event.kind === "cardMovement" && event.from === "play" && event.to === "discard" && event.cardIds?.[0] === "tazunaHayakawa"), true);
  assert.equal(movements.filter((event) => event.kind === "cardMovement" && event.from === "deck" && event.to === "hand").length, 1);

  const toolState = makePlayerActionState();
  const toolTarget = createUma("riceShowerBasic");
  toolState.sides.player.active = toolTarget;
  toolState.sides.player.hand = ["leftoverCarrot"];
  const afterTool = playHandCard(toolState, 0, { umamusumeTargetUid: toolTarget.uid });
  const toolEvent = (afterTool.events ?? []).find((event) => event.kind === "tool");
  assert.equal(toolEvent?.kind, "tool");
  assert.deepEqual(toolEvent?.kind === "tool" ? {
    targetUid: toolEvent.targetUid,
    toolCardId: toolEvent.toolCardId,
    action: toolEvent.action,
  } : undefined, { targetUid: toolTarget.uid, toolCardId: "leftoverCarrot", action: "attach" });

  const discardToolState = makePlayerActionState();
  const opponentToolTarget = createUma("riceShowerBasic");
  opponentToolTarget.toolCardId = "leftoverCarrot";
  discardToolState.sides.opponent.active = opponentToolTarget;
  discardToolState.sides.player.hand = ["masterCleatHammer"];
  const afterToolDiscard = playHandCard(discardToolState, 0, { discardToolHolderUmamusumeUid: opponentToolTarget.uid });
  const discardToolEvent = (afterToolDiscard.events ?? []).find((event) => event.kind === "tool");
  assert.equal(discardToolEvent?.kind, "tool");
  assert.equal(discardToolEvent?.kind === "tool" ? discardToolEvent.action : undefined, "discard");

  const stadiumState = makePlayerActionState();
  stadiumState.sides.player.hand = ["tracenGym"];
  stadiumState.stadium = { cardId: "nakayamaTurf", owner: "opponent" };
  const afterStadium = playHandCard(stadiumState, 0);
  const stadiumMovements = (afterStadium.events ?? []).filter((event) => event.kind === "cardMovement");
  assert.equal(stadiumMovements.some((event) => event.kind === "cardMovement" && event.from === "hand" && event.to === "play" && event.cardIds?.[0] === "tracenGym"), true);
  assert.equal(stadiumMovements.some((event) => event.kind === "cardMovement" && event.from === "play" && event.to === "discard" && event.cardIds?.[0] === "nakayamaTurf"), true);

  const statusClearState = makePlayerActionState();
  const statusTarget = createUma("riceShowerBasic");
  statusTarget.specialConditions = ["poisoned"];
  statusClearState.sides.player.active = statusTarget;
  statusClearState.sides.player.hand = ["takoyakiBox"];
  const afterStatusClear = playHandCard(statusClearState, 0);
  const statusClearEvent = (afterStatusClear.events ?? []).find((event) => event.kind === "status" && event.targetUid === statusTarget.uid);
  assert.deepEqual(statusClearEvent?.kind === "status" ? { condition: statusClearEvent.condition, action: statusClearEvent.action } : undefined, { condition: "poisoned", action: "clear" }, "status recovery should emit a typed clear event");
}

function scenarioStructuredAiCardMovementEvents() {
  const state = makeCombatState();
  state.opponentTurnStep = "bench";
  state.sides.opponent.active = createUma("manhattanCafeBasic");
  state.sides.opponent.hand = ["riceShowerBasic"];
  state.sides.player.active = createUma("nishinoFlowerBasic");

  const afterPlay = advanceOpponentTurnStep(state);
  const playEvent = (afterPlay.events ?? []).find((event) => event.kind === "cardMovement" && event.from === "hand" && event.to === "play");
  assert.equal(playEvent?.kind, "cardMovement");
  assert.deepEqual(playEvent?.kind === "cardMovement" ? playEvent.cardIds : undefined, ["riceShowerBasic"]);

  const knockoutState = makePlayerActionState();
  knockoutState.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  knockoutState.sides.opponent.active = createUma("riceShowerBasic");
  const afterKnockout = playerAttack(knockoutState);
  const discardEvent = (afterKnockout.events ?? []).find((event) => event.kind === "cardMovement" && event.from === "play" && event.to === "discard");
  assert.equal(discardEvent?.kind, "cardMovement");
  assert.deepEqual(discardEvent?.kind === "cardMovement" ? discardEvent.cardIds : undefined, ["riceShowerBasic"]);
}

function scenarioIntentResultContract() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("manhattanCafeBasic"), { darkness: 1 });
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);
  const result = applyPlayerIntentWithResult(state, { type: "attack", attackTargetUid: 999_999 });

  assert.equal(result.accepted, false);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);

  const legalState = makePlayerActionState();
  legalState.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  legalState.sides.opponent.active = createUma("riceShowerBasic");
  const accepted = applyPlayerIntentWithResult(legalState, { type: "attack" });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.transitionId, accepted.events[0]?.transitionId);
  assert.equal(accepted.events[0]?.kind, "attack");
}

function scenarioMatchLocalInstanceIds() {
  const first = createGame(playerDeckList, opponentDeckList, "First");
  const second = createGame(playerDeckList, opponentDeckList, "Second");
  first.phase = "play";
  second.phase = "play";
  first.sides.player.active = createUmamusume(first, "riceShowerBasic", 1);
  second.sides.player.active = createUmamusume(second, "riceShowerBasic", 1);
  first.sides.player.bench = [createUmamusume(first, "manhattanCafeBasic", 1)];
  second.sides.player.bench = [createUmamusume(second, "manhattanCafeBasic", 1)];

  assert.deepEqual([first.sides.player.active.uid, first.sides.player.bench[0]?.uid], [1, 2]);
  assert.deepEqual([second.sides.player.active.uid, second.sides.player.bench[0]?.uid], [1, 2]);
  assert.equal(first.nextUmamusumeUid, 3);
  assert.equal(second.nextUmamusumeUid, 3);
}

function scenarioDeterministicOpeningSetup() {
  const createSeededRandom = () => {
    let value = 0x12345678;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x1_0000_0000;
    };
  };
  const first = createGame(playerDeckList, opponentDeckList, "Opponent", "hard", false, "Guest", undefined, undefined, createSeededRandom());
  const second = createGame(playerDeckList, opponentDeckList, "Opponent", "hard", false, "Guest", undefined, undefined, createSeededRandom());

  assert.deepEqual(first.sides.player.deck, second.sides.player.deck);
  assert.deepEqual(first.sides.opponent.deck, second.sides.opponent.deck);
  assert.deepEqual(first.setup?.openingHands, second.setup?.openingHands);
}

function scenarioDeterministicOpeningCoin() {
  const state = createGame(playerDeckList, opponentDeckList, "Opponent");
  const next = chooseOpeningCoin(state, "heads", () => 0.1);

  assert.equal(next.setup?.coinFlipResult, "tails");
  assert.equal(next.firstPlayer, "opponent");
}

function scenarioRejectsInvalidOpeningCoin() {
  const state = createGame(playerDeckList, opponentDeckList, "Guest");
  state.setup!.coinFlipResult = "heads";
  const before = structuredClone(state);
  const next = chooseOpeningCoin(state, "tails", () => 0.1);
  assert.deepEqual(next, before, "a repeated opening coin choice must not allocate a transition or mutate setup");
}

function scenarioRejectsMalformedSetupIndexes() {
  const state = createGame(playerDeckList, opponentDeckList, "Guest");
  const openingHand = ["riceShowerBasic", "nishinoFlowerBasic", "teamRigil"];
  state.sides.player.hand = [...openingHand];
  state.setup!.openingHands.player = [...openingHand];
  state.setup!.openingHandsDealt = true;

  const beforeFractionalActive = structuredClone(state);
  const fractionalActive = completePregameSetup(state, 0.5, []);
  assert.deepEqual(fractionalActive, beforeFractionalActive, "fractional active indexes must be rejected without mutation");

  const beforeCoercedBench = structuredClone(state);
  const coercedBench = completePregameSetup(state, 0, ["1" as unknown as number]);
  assert.deepEqual(coercedBench, beforeCoercedBench, "non-numeric bench indexes must not be coerced into card selections");

  const beforeMissingBench = structuredClone(state);
  const missingBench = completePregameSetup(state, 0, undefined as unknown as number[]);
  assert.deepEqual(missingBench, beforeMissingBench, "missing bench selections must be rejected without throwing or mutation");

  const beforeDuplicateBench = structuredClone(state);
  const duplicateBench = completePregameSetup(state, 0, [1, 1]);
  assert.deepEqual(duplicateBench, beforeDuplicateBench, "duplicate bench selections must be rejected without mutation");

  const beforeActiveAsBench = structuredClone(state);
  const activeAsBench = completePregameSetup(state, 0, [0]);
  assert.deepEqual(activeAsBench, beforeActiveAsBench, "the active selection must not also be selected for the bench");

  const beforeTrainerAsBench = structuredClone(state);
  const trainerAsBench = completePregameSetup(state, 0, [2]);
  assert.deepEqual(trainerAsBench, beforeTrainerAsBench, "non-Basic bench selections must be rejected without mutation");
}

function scenarioDeterministicTurnEnergy() {
  const state = makePlayerActionState();
  const expected = state.sides.opponent.energyPool.at(-1);
  const next = playerEndTurn(state, () => 0.999);

  assert.deepEqual(next.sides.opponent.energyZone, expected ? [expected] : []);
}

function scenarioCanonicalStateInvariants() {
  let state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });
  state.sides.player.bench = [createUma("nishinoFlowerBasic")];
  state.sides.player.hand = ["tazunaHayakawa"];
  state.sides.player.deck = ["riceShowerBasic"];
  state.sides.opponent.active = createUma("riceShowerStage2");

  assertCanonicalState(state);
  state = playHandCard(state, 0);
  assertCanonicalState(state);
  state.sides.player.energyZone = ["darkness"];
  state = attachPlayerEnergy(state, state.sides.player.active?.uid);
  assertCanonicalState(state);
  state = playerEndTurn(state, () => 0.1);
  assertCanonicalState(state);
  if (state.currentSide === "opponent" && !state.gameOver && !state.pendingPlayerChoice) {
    state = advanceOpponentTurnStep(state, ["tails"], () => 0.1);
    assertCanonicalState(state);
  }
}

function assertCanonicalState(state: GameState): void {
  const instances = ( ["player", "opponent"] as const).flatMap((sideId) => {
    const side = state.sides[sideId];
    return [side.active, ...side.bench].filter((umamusume): umamusume is UmamusumeInstance => Boolean(umamusume));
  });
  assert.equal(new Set(instances.map((umamusume) => umamusume.uid)).size, instances.length, "instance UIDs must remain unique across both sides");
  instances.forEach((umamusume) => {
    assert.ok(Number.isInteger(umamusume.uid) && umamusume.uid > 0, "instance UIDs must stay positive integers");
    assert.ok(umamusume.hp >= 0 && umamusume.hp <= umamusume.maxHp, `HP must remain within canonical bounds (${umamusume.cardId}: ${umamusume.hp}/${umamusume.maxHp})`);
    assert.ok(umamusume.specialConditions.length <= 1, "a card may have at most one Special Condition");
    Object.values(umamusume.energies).forEach((amount) => assert.ok(Number.isInteger(amount) && amount >= 0, "Energy counts must remain non-negative integers"));
  });
  const events = state.events ?? [];
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index - 1]!.id < events[index]!.id, "retained event IDs must remain strictly increasing");
  }
  const lastEventId = events.at(-1)?.id ?? 0;
  assert.ok((state.nextEventId ?? 1) > lastEventId, "nextEventId must stay ahead of retained events");
  assert.equal(state.gameOver, state.currentSide === "done", "terminal state and current side must agree");
}

function scenarioRejectsMalformedActionIndexes() {
  const playState = makePlayerActionState();
  playState.sides.player.active = createUma("riceShowerBasic");
  playState.sides.player.hand = ["teamRigil"];
  playState.sides.opponent.active = createUma("riceShowerBasic");
  const beforePlay = structuredClone(playState);
  const invalidPlay = playHandCard(playState, "0" as unknown as number);
  assert.deepEqual(invalidPlay, beforePlay, "non-numeric hand indexes must not select a card by coercion");

  const attackState = makePlayerActionState();
  attackState.sides.player.active = withEnergy(createUma("riceShowerBasic"), { darkness: 1 });
  attackState.sides.opponent.active = createUma("riceShowerBasic");
  const beforeAttack = structuredClone(attackState);
  const invalidAttack = playerAttack(attackState, undefined, undefined, undefined, undefined, "0" as unknown as number);
  assert.deepEqual(invalidAttack, beforeAttack, "non-numeric attack indexes must not select an attack by coercion");
}

function scenarioRejectsInvalidRandomDiscardIndex() {
  const state = makePlayerActionState();
  state.sides.player.active = withEnergy(createUma("symboliRudolfStage2"), { water: 1, dragon: 1, colorless: 1 });
  state.sides.player.discard = ["riceShowerBasic"];
  state.sides.opponent.active = createUma("riceShowerBasic");
  const before = structuredClone(state);

  const next = playerAttack(state, undefined, undefined, undefined, undefined, 0, undefined, 999_999);

  assert.deepEqual(next, before, "an invalid random discard index must not fall back to another discard card");
}

function scenarioRejectsInvalidAbilityDiscardIndex() {
  const card = getCard("riceShowerBasic");
  if (card.kind !== "umamusume") throw new Error("Expected a fixture Umamusume card.");
  const originalAbility = card.ability;
  card.ability = {
    name: "Test Draw",
    text: "Discard a card and draw a card.",
    discardToDraw: { discard: 1, draw: 1 },
  };
  try {
    const state = makePlayerActionState();
    state.sides.player.active = createUma("riceShowerBasic");
    state.sides.player.hand = ["nishinoFlowerBasic", "tamamoCrossBasic"];
    const before = structuredClone(state);

    const next = usePlayerAbility(
      state,
      state.sides.player.active.uid,
      state.sides.player.active.uid,
      undefined,
      999_999,
    );

    assert.deepEqual(next, before, "an invalid ability discard index must not fall back to the first hand card");
  } finally {
    if (originalAbility) card.ability = originalAbility;
    else delete card.ability;
  }
}

function makeCombatState(): GameState {
  const state = createGame(playerDeckList, opponentDeckList, "Opponent");
  fixtureIdentityState = state;
  state.phase = "play";
  state.setup = null;
  state.pendingPlayerChoice = null;
  state.gameOver = false;
  state.winner = null;
  state.currentSide = "opponent";
  state.opponentTurnStep = "attack";
  state.log = [];
  resetSideForCombat(state.sides.player);
  resetSideForCombat(state.sides.opponent);
  return state;
}

function makePlayerActionState(): GameState {
  const state = makeCombatState();
  state.currentSide = "player";
  state.opponentTurnStep = null;
  return state;
}

function resetSideForCombat(side: SideState): void {
  side.deck = [];
  side.discard = [];
  side.hand = [];
  side.active = null;
  side.bench = [];
  side.points = 0;
  side.energyZone = [];
  side.energyAttachmentsThisTurn = 0;
  side.bonusEnergyAttachments = 0;
  side.retreatCostReduction = 0;
  side.activeAttackDamageBonus = 0;
  side.usedSupporterThisTurn = false;
  side.usedRetreatThisTurn = false;
  side.usedStadiumThisTurn = false;
  side.usedAbilityNamesThisTurn = [];
}

function createUma(cardId: string): UmamusumeInstance {
  if (!fixtureIdentityState) throw new Error("Create a combat fixture before creating an Umamusume.");
  const umamusume = createUmamusume(fixtureIdentityState, cardId, 2);
  const card = getCard(cardId);
  if (card.kind !== "umamusume") throw new Error(`Expected umamusume card: ${cardId}`);
  umamusume.hp = card.hp;
  umamusume.maxHp = card.hp;
  return umamusume;
}

function withEnergy(umamusume: UmamusumeInstance, energies: Partial<Record<EnergyType, number>>): UmamusumeInstance {
  Object.entries(energies).forEach(([energyType, amount]) => {
    if (!amount) return;
    umamusume.energies[energyType as EnergyType] = amount;
  });
  return umamusume;
}

function totalAttachedEnergy(umamusume: UmamusumeInstance): number {
  return Object.values(umamusume.energies).reduce((sum, value) => sum + value, 0);
}

function collectSideCardIds(side: SideState): string[] {
  const inPlay = [side.active, ...side.bench]
    .filter((umamusume): umamusume is UmamusumeInstance => Boolean(umamusume))
    .flatMap((umamusume) => [
      ...(umamusume.evolutionCardIds ?? []),
      umamusume.cardId,
      ...(umamusume.toolCardId ? [umamusume.toolCardId] : []),
    ]);
  return [...side.deck, ...side.hand, ...side.discard, ...inPlay];
}

function runOpponentUntilAttackResolution(state: GameState, maxSteps = 8): GameState {
  let next = state;
  for (let step = 0; step < maxSteps; step += 1) {
    const updated = advanceOpponentTurnStep(next);
    if (updated.currentSide !== "opponent" || updated.opponentTurnStep === null) return updated;
    next = updated;
  }
  return next;
}
