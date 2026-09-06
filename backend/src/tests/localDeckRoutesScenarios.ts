import assert from "node:assert/strict";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { premadeDecks } from "../../../shared/src/gameData";
import { createLocalDeckRouter } from "../routes/localDeckRoutes";
import { createLocalDeckStore } from "../storage/localDeckStore";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "umamusume-local-route-"));
const deck = premadeDecks[0];
assert.ok(deck, "expected a premade deck fixture");

const app = express();
app.use(express.json());
app.use("/api/local-decks", createLocalDeckRouter({
  enabled: true,
  store: createLocalDeckStore(path.join(temporaryRoot, "enabled")),
}));

const disabledApp = express();
disabledApp.use(express.json());
disabledApp.use("/api/local-decks", createLocalDeckRouter({
  enabled: false,
  store: createLocalDeckStore(path.join(temporaryRoot, "disabled")),
}));

const server = createServer(app);
const disabledServer = createServer(disabledApp);
await Promise.all([
  new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)),
  new Promise<void>((resolve) => disabledServer.listen(0, "127.0.0.1", resolve)),
]);

try {
  const address = server.address();
  const disabledAddress = disabledServer.address();
  assert.ok(address && typeof address === "object");
  assert.ok(disabledAddress && typeof disabledAddress === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api/local-decks`;
  const disabledUrl = `http://127.0.0.1:${disabledAddress.port}/api/local-decks`;

  const invalid = await fetch(`${baseUrl}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "", cardIds: [] }),
  });
  assert.equal(invalid.status, 400);

  const input = {
    name: "Route Fixture",
    cardIds: [...deck.cardIds],
    coverCardId: deck.coverCardId,
    energyTypes: [...(deck.energyTypes ?? ["psychic"])],
  };
  const imported = await fetch(`${baseUrl}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(imported.status, 201);
  const importedBody = await imported.json() as { deck?: { id?: string; name?: string } };
  assert.equal(importedBody.deck?.name, "Route Fixture");
  const deckId = importedBody.deck?.id;
  assert.ok(deckId);

  const listed = await fetch(baseUrl);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json() as { decks?: unknown[] }).decks?.length, 1);

  const updated = await fetch(`${baseUrl}/${deckId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, name: "Updated Fixture" }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json() as { deck?: { name?: string } }).deck?.name, "Updated Fixture");

  const deleted = await fetch(`${baseUrl}/${deckId}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  const missing = await fetch(`${baseUrl}/${deckId}`);
  assert.equal(missing.status, 404);

  const disabled = await fetch(disabledUrl);
  assert.equal(disabled.status, 404);
  assert.deepEqual(await disabled.json(), { error: "Local deck API is disabled." });
  console.log("PASS: local deck routes preserve validation and storage contracts");
} finally {
  await Promise.all([
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => disabledServer.close((error) => error ? reject(error) : resolve())),
  ]);
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
