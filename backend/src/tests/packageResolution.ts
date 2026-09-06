import assert from "node:assert/strict";
import { cards } from "umamusume-pocket-shared";
import { createGame, getCard } from "umamusume-pocket-frontend/engine";

const firstCardId = Object.keys(cards)[0];
assert.ok(firstCardId, "shared workspace export should resolve card data at runtime");
const game = createGame();
assert.equal(game.phase, "setup");
assert.equal(getCard(firstCardId).id, firstCardId);
console.log("PASS: workspace shared and engine package exports resolve through public runtime entry points");
