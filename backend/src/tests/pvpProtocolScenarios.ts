import { strict as assert } from "node:assert";
import { parsePvpMessage } from "../../../frontend/src/pvp/protocol";
import { cards, premadeDecks } from "../../../shared/src/gameData";
import { validatePvpDeckCardIds } from "../../../shared/src/localDecks";
import { createGame } from "../../../frontend/src/game/engine";
import { createGuestSyncState, mirrorGameState, mirrorGameStateForGuest } from "../../../frontend/src/pvp/stateMirror";
import { createOrderedPvpReceiver } from "../../../frontend/src/pvp/orderedReceiver";

async function expectRejected(raw: string): Promise<void> {
  assert.equal(await parsePvpMessage(raw), null, `Expected packet to be rejected: ${raw}`);
}

async function run(): Promise<void> {
  await scenarioOrderedReceiveQueue();
  const hello = await parsePvpMessage(JSON.stringify({
    type: "hello",
    playerName: "Guest",
    deckCardIds: ["specialWeek"],
    energyTypes: ["fire"],
  }));
  assert.deepEqual(hello, {
    type: "hello",
    playerName: "Guest",
    deckCardIds: ["specialWeek"],
    energyTypes: ["fire"],
  });

  await expectRejected(JSON.stringify({ type: "hello", playerName: 4, deckCardIds: [] }));
  await expectRejected(JSON.stringify({ type: "hello", playerName: "Guest", deckCardIds: ["card"], energyTypes: ["unknown"] }));
  await expectRejected(JSON.stringify({ type: "intent", intent: { type: "completeSetup", activeHandIndex: -1, benchHandIndexes: [] } }));
  await expectRejected(JSON.stringify({ type: "intent", intent: { type: "endTurn", injected: true } }));
  await expectRejected(JSON.stringify({ type: "sync", state: {} }));

  const intent = await parsePvpMessage(JSON.stringify({ type: "intent", intent: { type: "attack", attackIndex: 1 } }));
  assert.deepEqual(intent, { type: "intent", intent: { type: "attack", attackIndex: 1 } });
  const playableDeck = premadeDecks[0];
  assert.ok(playableDeck, "Expected a premade deck fixture.");
  assert.deepEqual(validatePvpDeckCardIds(playableDeck.cardIds, playableDeck.energyTypes, cards), { ok: true });
  assert.equal(validatePvpDeckCardIds([...playableDeck.cardIds.slice(0, 19), "not-a-card"], playableDeck.energyTypes, cards).ok, false);

  const hostState = createGame(playableDeck.cardIds, playableDeck.cardIds, "Guest");
  hostState.log = ["You added specialWeek from your deck to your hand."];
  const redactedSync = createGuestSyncState(hostState);
  assert.deepEqual(redactedSync.sides.player.hand, Array.from({ length: hostState.sides.player.hand.length }, () => ""));
  assert.deepEqual(redactedSync.sides.player.deck, Array.from({ length: hostState.sides.player.deck.length }, () => ""));
  assert.equal(redactedSync.log.join(" ").includes("specialWeek"), false, "Guest packets must not expose host private card identities in logs.");
  assert.equal(mirrorGameStateForGuest(redactedSync).log.join(" ").includes("specialWeek"), false);
  const canonical = structuredClone(hostState);
  canonical.log = [];
  assert.deepEqual(mirrorGameState(mirrorGameState(canonical)), canonical, "Canonical fields should survive a double perspective mirror.");
  const sync = await parsePvpMessage(JSON.stringify({ type: "sync", sequence: 1, state: redactedSync }));
  assert.deepEqual(sync, { type: "sync", sequence: 1, state: redactedSync });
  const invalidSync = structuredClone(redactedSync);
  invalidSync.sides.opponent.discard = ["not-a-card"];
  await expectRejected(JSON.stringify({ type: "sync", sequence: 2, state: invalidSync }));
  console.log("PASS: PvP protocol rejects malformed payloads and accepts valid intents");
}

async function scenarioOrderedReceiveQueue(): Promise<void> {
  const delivered: string[] = [];
  const receiver = createOrderedPvpReceiver(
    async (raw) => {
      if (raw === "bad") throw new Error("invalid packet");
      if (raw === "first") await new Promise((resolve) => setTimeout(resolve, 15));
      return { type: "intent", intent: { type: "endTurn" } };
    },
    () => delivered.push(String(delivered.length + 1)),
  );
  receiver("first");
  receiver("second");
  receiver("bad");
  receiver("third");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(delivered, ["1", "2", "3"], "slow or malformed packets must not reorder or block later delivery");
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
