import assert from "node:assert/strict";
import { cards } from "umamusume-pocket-shared";
import { createGame, getCard } from "umamusume-pocket-frontend/engine";
import { PVP_PROTOCOL_VERSION } from "umamusume-pocket-frontend/pvp/protocol";
import { createGuestSyncState } from "umamusume-pocket-frontend/pvp/stateMirror";

const firstCardId = Object.keys(cards)[0];
assert.ok(firstCardId, "shared workspace export should resolve card data at runtime");
const game = createGame();
assert.equal(game.phase, "setup");
assert.equal(getCard(firstCardId).id, firstCardId);
assert.equal(PVP_PROTOCOL_VERSION, 2);
assert.equal(typeof createGuestSyncState, "function");
console.log("PASS: workspace shared, engine, and PvP package exports resolve through public runtime entry points");
