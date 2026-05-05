import assert from "node:assert/strict";
import { opponentDeckList, playerDeckList } from "../../../shared/src/gameData";
import type { EnergyType, GameState, SideState, UmamusumeInstance } from "../../../shared/src/types";
import { advanceOpponentTurnStep, createGame, getCard, playHandCard, playerAttack, playerEndTurn } from "../../../frontend/src/game/engine";
import { createUmamusume, resetUmamusumeIdCounter } from "../../../frontend/src/game/engine/flow/setup";

type Scenario = {
  name: string;
  run: () => void;
};

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
  if (movedToActive === 1) assert.equal(movedFromSource, 0, "AI should remove energy from selected bench source");
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
  opponent.active = withEnergy(createUma("tamamoCrossStage1"), { lightning: 1 });
  opponent.deck = ["tamamoCrossStage2"];
  player.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = advanceOpponentTurnStep(state);
  assert.equal(next.sides.opponent.active?.cardId, "tamamoCrossStage2", "Tamamo should evolve from deck after Fast As Lightning");
  assert.equal(next.sides.opponent.deck.length, 0, "evolution card should leave the deck");
}

function scenarioPlayerTamamoAttackSelectsEvolution() {
  const state = makePlayerActionState();
  const player = state.sides.player;
  const opponent = state.sides.opponent;
  player.active = withEnergy(createUma("tamamoCrossStage1"), { lightning: 1 });
  player.deck = ["riceShowerBasic", "tamamoCrossStage2"];
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = playerAttack(state, undefined, undefined, undefined, 1);
  assert.equal(next.sides.player.active?.cardId, "tamamoCrossStage2", "Fast As Lightning should use the selected evolution from deck");
  assert.deepEqual(next.sides.player.active?.evolutionCardIds, ["tamamoCrossStage1"], "the previous stage should stay under the evolved Umamusume");
  assert.deepEqual(next.sides.player.deck, ["riceShowerBasic"], "only the selected evolution should leave the deck");
}

function scenarioThunderboltStepDamage() {
  const state = makeCombatState();
  const opponent = state.sides.opponent;
  const player = state.sides.player;
  opponent.active = withEnergy(createUma("tamamoCrossStage2"), { lightning: 1, colorless: 1 });
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
  player.active = withEnergy(createUma("tamamoCrossStage2"), { lightning: 3 });
  player.active.evolutionCardIds = ["tamamoCrossBasic", "tamamoCrossStage1"];
  player.active.toolCardId = "leftoverCarrot";
  const promoted = withEnergy(createUma("tamamoCrossBasic"), { lightning: 1 });
  player.bench = [promoted];
  opponent.active = withEnergy(createUma("riceShowerStage2"), { darkness: 2 });

  const next = playerAttack(state);
  assert.equal(next.sides.player.active?.uid, promoted.uid, "bench Umamusume should promote after White Lightning shuffles the active");
  assert.ok(next.sides.player.deck.includes("tamamoCrossStage2"), "Tamamo Cross Stage 2 should be shuffled into the deck");
  assert.ok(next.sides.player.deck.includes("tamamoCrossStage1"), "Tamamo Cross Stage 1 under Tamamo should be shuffled into the deck");
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
  assert.equal(next.sides.opponent.active?.hp, 40, "Uma Stan should do 80 damage when Burning Passion is active");
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
  const benchAttacker = withEnergy(createUma("tamamoCrossStage2"), { lightning: 1, colorless: 1 });
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
  assert.equal(next.sides.opponent.active?.hp, 30, "Tracen Gym should suppress Oguri's +30 tool damage bonus");
}

function makeCombatState(): GameState {
  resetUmamusumeIdCounter();
  const state = createGame(playerDeckList, opponentDeckList, "Opponent");
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
  const umamusume = createUmamusume(cardId, 2);
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

function runOpponentUntilAttackResolution(state: GameState, maxSteps = 8): GameState {
  let next = state;
  for (let step = 0; step < maxSteps; step += 1) {
    const updated = advanceOpponentTurnStep(next);
    if (updated.currentSide !== "opponent" || updated.opponentTurnStep === null) return updated;
    next = updated;
  }
  return next;
}
