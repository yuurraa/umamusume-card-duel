import assert from "node:assert/strict";
import { opponentDeckList, playerDeckList } from "../../../shared/src/gameData";
import type { EnergyType, GameState, SideState, UmamusumeInstance } from "../../../shared/src/types";
import { advanceOpponentTurnStep, createGame, getCard } from "../../../frontend/src/game/engine";
import { createUmamusume, resetUmamusumeIdCounter } from "../../../frontend/src/game/engine/flow/setup";

type Scenario = {
  name: string;
  run: () => void;
};

const scenarios: Scenario[] = [
  { name: "hard takes lethal KO over non-lethal target", run: scenarioLethalTargeting },
  { name: "hard prefers highest-value target when no lethal exists", run: scenarioTargetValueTieBreaker },
  { name: "hard chooses a meaningful heal target on heal-any attack", run: scenarioHealTargeting },
  { name: "hard retreats when immediate KO threat exists and attack line remains", run: scenarioThreatRetreat },
  { name: "hard does not retreat when attacking now is clearly better", run: scenarioNoUnneededRetreat },
  { name: "hard uses Haru-style move-energy ability when it improves active damage", run: scenarioUsefulMoveEnergyAbility },
  { name: "hard skips Haru-style move-energy ability when value is poor", run: scenarioSkipsUselessMoveEnergyAbility },
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
  const healedBench = next.sides.opponent.bench.find((umamusume) => umamusume.uid === hurtBench.uid);
  assert.ok(healedBench, "bench target should still exist");
  assert.equal(healedBench.hp, 30, "AI should heal the most damaged own target");
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
  assert.equal(movedToActive, 1, "AI should move darkness energy to active when it increases attack output");
  assert.equal(movedFromSource, 0, "AI should remove energy from selected bench source");
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
