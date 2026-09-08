import { strict as assert } from "node:assert";
import { gzipSync } from "node:zlib";
import { parsePvpMessage, PVP_PROTOCOL_VERSION } from "umamusume-pocket-frontend/pvp/protocol";
import { cards, premadeDecks, validatePvpDeckCardIds } from "umamusume-pocket-shared";
import { createGame } from "umamusume-pocket-frontend/engine";
import { createGuestSyncState, mirrorGameState, mirrorGameStateForGuest, projectGameEventsForSide } from "umamusume-pocket-frontend/pvp/stateMirror";
import { createOrderedPvpReceiver } from "umamusume-pocket-frontend/pvp/orderedReceiver";
import { toPerspectiveGame } from "umamusume-pocket-frontend/app/matchPerspective";

async function expectRejected(raw: string): Promise<void> {
  assert.equal(await parsePvpMessage(raw), null, `Expected packet to be rejected: ${raw}`);
}

async function run(): Promise<void> {
  await scenarioOrderedReceiveQueue();
  const sessionId = "session-fixture-001";
  const hello = await parsePvpMessage(JSON.stringify({
    type: "hello",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    playerName: "Guest",
    deckCardIds: ["specialWeek"],
    energyTypes: ["fire"],
  }));
  assert.deepEqual(hello, {
    type: "hello",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    playerName: "Guest",
    deckCardIds: ["specialWeek"],
    energyTypes: ["fire"],
  });
  const helloAck = await parsePvpMessage(JSON.stringify({ type: "helloAck", version: PVP_PROTOCOL_VERSION, sessionId }));
  assert.deepEqual(helloAck, { type: "helloAck", version: PVP_PROTOCOL_VERSION, sessionId });

  await expectRejected(JSON.stringify({ type: "hello", version: PVP_PROTOCOL_VERSION, sessionId, playerName: 4, deckCardIds: [] }));
  await expectRejected(JSON.stringify({ type: "hello", version: PVP_PROTOCOL_VERSION, sessionId, playerName: "Guest", deckCardIds: ["card"], energyTypes: ["unknown"] }));
  await expectRejected(JSON.stringify({ type: "intent", version: PVP_PROTOCOL_VERSION, sessionId, intent: { type: "completeSetup", activeHandIndex: -1, benchHandIndexes: [] } }));
  await expectRejected(JSON.stringify({ type: "intent", version: PVP_PROTOCOL_VERSION, sessionId, intent: { type: "endTurn", injected: true } }));
  await expectRejected(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, state: {} }));
  await expectRejected(JSON.stringify({ type: "hello", version: PVP_PROTOCOL_VERSION + 1, sessionId, playerName: "Guest", deckCardIds: ["specialWeek"] }));
  await expectRejected(JSON.stringify({ type: "hello", version: PVP_PROTOCOL_VERSION, sessionId: "short", playerName: "Guest", deckCardIds: ["specialWeek"] }));
  const oversizedCompressed = gzipSync(Buffer.from(JSON.stringify({
    type: "hello",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    playerName: "Guest",
    deckCardIds: ["specialWeek"],
    padding: "x".repeat(600_000),
  }))).toString("base64url");
  await expectRejected(`UCDM1.${oversizedCompressed}`);
  await expectRejected("UCDM1.not-valid-gzip");

  const intent = await parsePvpMessage(JSON.stringify({ type: "intent", version: PVP_PROTOCOL_VERSION, sessionId, intent: { type: "attack", attackIndex: 1 } }));
  assert.deepEqual(intent, { type: "intent", version: PVP_PROTOCOL_VERSION, sessionId, intent: { type: "attack", attackIndex: 1 } });
  const playableDeck = premadeDecks[0];
  assert.ok(playableDeck, "Expected a premade deck fixture.");
  assert.deepEqual(validatePvpDeckCardIds(playableDeck.cardIds, playableDeck.energyTypes, cards), { ok: true });
  assert.equal(validatePvpDeckCardIds([...playableDeck.cardIds.slice(0, 19), "not-a-card"], playableDeck.energyTypes, cards).ok, false);

  const hostState = createGame(playableDeck.cardIds, playableDeck.cardIds, "Guest");
  hostState.humanBySide = { player: true, opponent: false };
  hostState.aiDeckStyleBySide = { player: "blitz", opponent: "scaleBench" };
  hostState.log = ["You added specialWeek from your deck to your hand."];
  const redactedSync = createGuestSyncState(hostState);
  assert.deepEqual(redactedSync.sides.player.hand, Array.from({ length: hostState.sides.player.hand.length }, () => ""));
  assert.deepEqual(redactedSync.sides.player.deck, Array.from({ length: hostState.sides.player.deck.length }, () => ""));
  assert.equal(redactedSync.log.join(" ").includes("specialWeek"), false, "Guest packets must not expose host private card identities in logs.");
  assert.equal(mirrorGameStateForGuest(redactedSync).log.join(" ").includes("specialWeek"), false);
  const canonical = structuredClone(hostState);
  canonical.log = [];
  hostState.events = [{
    id: 1,
    transitionId: 1,
    visibility: "public",
    kind: "attack",
    actorSide: "player",
    actorUid: 1,
    targetSide: "opponent",
    targetUid: 2,
    attackName: "Fixture",
    damage: 20,
    hpBefore: 60,
    hpAfter: 40,
  }];
  hostState.events.push(
    {
      id: 2,
      transitionId: 2,
      visibility: "actor",
      kind: "cardMovement",
      side: "player",
      from: "deck",
      to: "hand",
      count: 1,
      cardIds: [playableDeck.cardIds[0]!],
    },
    {
      id: 3,
      transitionId: 3,
      visibility: "actor",
      kind: "cardMovement",
      side: "opponent",
      from: "deck",
      to: "hand",
      count: 1,
      cardIds: [playableDeck.cardIds[1]!],
    },
    {
      id: 4,
      transitionId: 4,
      visibility: "private",
      kind: "turn",
      side: "opponent",
      turnNumber: 1,
    },
  );
  const guestEvents = projectGameEventsForSide(hostState, "opponent");
  assert.deepEqual(guestEvents.map((event) => event.id), [1, 3], "Guest event projection must omit host and private events.");
  assert.deepEqual(projectGameEventsForSide(hostState, "opponent", 1).map((event) => event.id), [3], "Event cursors must replay only recipient-visible events after the acknowledged ID.");
  assert.deepEqual(projectGameEventsForSide(hostState, "opponent", 3), [], "An up-to-date event cursor must not replay duplicate events.");
  const projectedGuestDraw = guestEvents.find((event) => event.id === 3);
  assert.deepEqual(projectedGuestDraw?.kind === "cardMovement" ? projectedGuestDraw.cardIds : null, [playableDeck.cardIds[1]]);
  hostState.events.push({
    id: 5,
    transitionId: 5,
    visibility: "actor",
    kind: "cardMovement",
    side: "player",
    from: "hand",
    to: "play",
    count: 1,
    cardIds: [playableDeck.cardIds[2]!],
  });
  const publicPlayedEvent = projectGameEventsForSide(hostState, "opponent").find((event) => event.id === 5);
  assert.deepEqual(publicPlayedEvent?.kind === "cardMovement" ? publicPlayedEvent.cardIds : null, [playableDeck.cardIds[2]], "Played opponent cards are public after entering play.");
  const mirroredEvent = mirrorGameState(hostState).events?.[0];
  assert.equal(mirroredEvent?.kind === "attack" ? mirroredEvent.actorSide : null, "opponent");
  assert.equal(mirroredEvent?.kind === "attack" ? mirroredEvent.targetSide : null, "player");
  const mirrored = mirrorGameState(canonical);
  assert.deepEqual(mirrored.humanBySide, { player: false, opponent: true });
  assert.deepEqual(mirrored.aiDeckStyleBySide, { player: "scaleBench", opponent: "blitz" });
  const displayMirrored = toPerspectiveGame(canonical, "opponent");
  assert.deepEqual(displayMirrored.humanBySide, { player: false, opponent: true });
  assert.deepEqual(displayMirrored.aiDeckStyleBySide, { player: "scaleBench", opponent: "blitz" });
  assert.deepEqual(mirrorGameState(mirrorGameState(canonical)), canonical, "Canonical fields should survive a double perspective mirror.");
  const sync = await parsePvpMessage(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 1, state: redactedSync, events: guestEvents, eventCursor: 4, eventHistoryStart: 1 }));
  assert.deepEqual(sync, { type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 1, state: redactedSync, events: guestEvents, eventCursor: 4, eventHistoryStart: 1 });
  const negativeEnergyEvent = {
    id: 6,
    transitionId: 6,
    visibility: "public" as const,
    kind: "energy" as const,
    side: "player" as const,
    targetUid: 1,
    energyType: "fire" as const,
    amount: -1,
  };
  const energySync = await parsePvpMessage(JSON.stringify({
    type: "sync",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    sequence: 2,
    state: redactedSync,
    events: [negativeEnergyEvent],
  }));
  assert.equal(energySync?.type, "sync", "negative Energy deltas must remain valid on the PvP wire");
  const statusClearSync = await parsePvpMessage(JSON.stringify({
    type: "sync",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    sequence: 2,
    state: redactedSync,
    events: [{
      id: 7,
      transitionId: 7,
      visibility: "public",
      kind: "status",
      side: "player",
      targetUid: 1,
      condition: "poisoned",
      action: "clear",
    }],
  }));
  assert.equal(statusClearSync?.type, "sync", "status clear events must remain valid on the PvP wire");
  const exKnockoutSync = await parsePvpMessage(JSON.stringify({
    type: "sync",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    sequence: 3,
    state: redactedSync,
    events: [{
      id: 8,
      transitionId: 8,
      visibility: "public",
      kind: "knockout",
      scoringSide: "player",
      knockedSide: "opponent",
      targetUid: 1,
      cardId: "twinTurboBasicEx",
      pointsAwarded: 2,
      points: 2,
    }],
  }));
  assert.equal(exKnockoutSync?.type, "sync", "EX knockout rewards must remain valid on the PvP wire");
  const invalidSync = structuredClone(redactedSync);
  invalidSync.sides.opponent.discard = ["not-a-card"];
  await expectRejected(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 2, state: invalidSync }));
  const invalidEventSync = structuredClone(redactedSync) as unknown as Record<string, unknown>;
  invalidEventSync.events = [{ id: 1, transitionId: 1, visibility: "public", kind: "attack", actorSide: "unknown" }];
  await expectRejected(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 3, state: invalidEventSync }));
  await expectRejected(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 4, state: redactedSync, eventCursor: -1, events: guestEvents }));
  await expectRejected(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 4, state: redactedSync, eventHistoryStart: 0 }));
  await expectRejected(JSON.stringify({ type: "sync", version: PVP_PROTOCOL_VERSION, sessionId, sequence: 5, state: redactedSync, eventCursor: 4, events: [{ id: 1, transitionId: 1, visibility: "public", kind: "message" }] }));
  await expectRejected(JSON.stringify({
    type: "sync",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    sequence: 6,
    state: redactedSync,
    events: [{ id: 1, transitionId: 1, visibility: "public", kind: "tool", side: "player", targetUid: 1, toolCardId: "not-a-card", action: "attach" }],
  }));
  await expectRejected(JSON.stringify({
    type: "sync",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    sequence: 8,
    state: redactedSync,
    events: [{ id: 1, transitionId: 1, visibility: "public", kind: "status", side: "player", targetUid: 1, condition: "poisoned" }],
  }));
  await expectRejected(JSON.stringify({
    type: "sync",
    version: PVP_PROTOCOL_VERSION,
    sessionId,
    sequence: 7,
    state: redactedSync,
    events: [guestEvents[0]!, guestEvents[0]!],
  }));
  console.log("PASS: PvP protocol rejects malformed payloads and accepts valid intents");
}

async function scenarioOrderedReceiveQueue(): Promise<void> {
  const delivered: string[] = [];
  const receiver = createOrderedPvpReceiver(
    async (raw) => {
      if (raw === "bad") throw new Error("invalid packet");
      if (raw === "first") await new Promise((resolve) => setTimeout(resolve, 15));
      return { type: "intent", version: PVP_PROTOCOL_VERSION, sessionId: "session-fixture-001", intent: { type: "endTurn" } };
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
