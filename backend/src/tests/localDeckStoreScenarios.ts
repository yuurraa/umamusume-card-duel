import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildLocalDeck, premadeDecks } from "../../../shared/src";
import { createLocalDeckStore } from "../storage/localDeckStore";

const seedDeck = premadeDecks[0];
assert.ok(seedDeck, "Expected a premade deck fixture.");
const now = "2026-09-06T00:00:00.000Z";

const directory = await mkdtemp(path.join(os.tmpdir(), "umamusume-local-deck-store-"));
try {
  const store = createLocalDeckStore(directory);
  const deck = buildLocalDeck("fixture", {
    name: seedDeck.name,
    coverCardId: seedDeck.coverCardId,
    cardIds: seedDeck.cardIds,
    ...(seedDeck.energyTypes ? { energyTypes: seedDeck.energyTypes } : {}),
  }, now);

  assert.equal(await store.readById(deck.id), null);
  await store.write(deck);
  assert.deepEqual(await store.readById(deck.id), deck);
  assert.deepEqual((await store.list()).map((entry) => entry.id), [deck.id]);
  assert.equal(await store.getUniqueId(deck.id), "fixture-2");

  await writeFile(path.join(directory, "broken.json"), "not-json", "utf8");
  assert.equal(await store.readById("broken"), null, "Malformed direct reads must be isolated from route callers.");
  assert.deepEqual((await store.list()).map((entry) => entry.id), [deck.id], "Malformed files must not hide valid decks.");
  console.log("PASS: local deck storage validates and isolates malformed files");
} finally {
  await rm(directory, { recursive: true, force: true });
}
