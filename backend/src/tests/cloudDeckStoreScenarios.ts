import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { createServer } from "node:http";
import { buildLocalDeck, playerDeckList } from "umamusume-pocket-shared";
import { createCloudDeckRouter } from "../routes/cloudDeckRoutes";
import { createCloudDeckStore } from "../storage/cloudDeckStore";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "umamusume-cloud-store-"));
try {
  const store = createCloudDeckStore({
    fallbackDir: rootDir,
    devUnlocksEnabled: true,
    firebaseConfigured: () => false,
  });
  const deck = buildLocalDeck("test-deck", {
    name: "Test Deck",
    cardIds: [...playerDeckList],
    energyTypes: ["psychic"],
  }, "2026-01-01T00:00:00.000Z");

  await store.writeDeck("fixture-user", deck);
  assert.deepEqual(await store.readDeckById("fixture-user", deck.id), deck);
  assert.deepEqual((await store.listDecks("fixture-user")).map((entry) => entry.id), [deck.id]);

  const malformedPath = path.join(rootDir, "fixture-user", "decks", "malformed.json");
  await writeFile(malformedPath, "{not-json", "utf8");
  assert.deepEqual((await store.listDecks("fixture-user")).map((entry) => entry.id), [deck.id]);
  assert.equal(await store.getUniqueDeckId("fixture-user", "test-deck"), "test-deck-2");

  const draft = {
    createDrafts: [deck],
    editDrafts: {
      [deck.id]: {
        name: deck.name,
        cardIds: [...deck.cardIds],
        selectedCoverCardId: deck.coverCardId,
        energyTypes: ["psychic"],
      },
    },
  };
  await store.writeDrafts("fixture-user", draft);
  assert.deepEqual(await store.readDrafts("fixture-user"), draft);
  assert.ok(Object.keys(await store.readCardCollection("fixture-user")).length > 0);

  const app = express();
  const previousDevUserId = process.env.FIREBASE_DEV_USER_ID;
  const previousCloudFallback = process.env.ENABLE_CLOUD_DEV_FALLBACK;
  process.env.FIREBASE_DEV_USER_ID = "fixture-user";
  process.env.ENABLE_CLOUD_DEV_FALLBACK = "true";
  app.use(express.json());
  app.use("/api", createCloudDeckRouter({ store }));
  const failingStore = {
    ...store,
    listDecks: async () => {
      throw new Error("simulated cloud outage");
    },
  };
  let accessedAfterAuthFailure = false;
  const authFailureStore = {
    ...store,
    listDecks: async () => {
      accessedAfterAuthFailure = true;
      return [];
    },
  };
  const firebaseFailureStore = createCloudDeckStore({
    fallbackDir: rootDir,
    devUnlocksEnabled: true,
    firebaseConfigured: () => true,
    firebaseDb: () => {
      throw new Error("simulated Firebase outage");
    },
  });
  const invalidTokenAuth = {
    verifyIdToken: async () => {
      throw new Error("simulated invalid token");
    },
  } as unknown as Auth;
  const profileStorageFailureDb = {
    collection: () => {
      throw new Error("simulated profile storage outage");
    },
  } as unknown as Firestore;
  app.use("/api/failing", createCloudDeckRouter({
    store: failingStore,
    resolveUserId: async () => "fixture-user",
  }));
  app.use("/api/auth-failing", createCloudDeckRouter({
    store: authFailureStore,
    resolveUserId: async (_request, response) => {
      response.status(401).json({ error: "Fixture token rejected." });
      return null;
    },
  }));
  app.use("/api/firebase-failing", createCloudDeckRouter({
    store: firebaseFailureStore,
    resolveUserId: async () => "fixture-user",
  }));
  app.use("/api/auth-invalid", createCloudDeckRouter({
    store,
    firebaseConfigured: () => true,
    firebaseAuth: () => invalidTokenAuth,
  }));
  app.use("/api/profile-failing", createCloudDeckRouter({
    store,
    firebaseConfigured: () => true,
    firebaseAuth: () => ({
      verifyIdToken: async () => ({
        uid: "fixture-user",
        firebase: { sign_in_provider: "custom" },
      }),
    } as unknown as Auth),
    firebaseDb: () => profileStorageFailureDb,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const listResponse = await fetch(`${baseUrl}/api/cloud-decks`);
    assert.equal(listResponse.status, 200);
    assert.deepEqual((await listResponse.json() as { decks: Array<{ id: string }> }).decks.map((entry) => entry.id), [deck.id]);

    const failureResponse = await fetch(`${baseUrl}/api/failing/cloud-decks`);
    assert.equal(failureResponse.status, 503);
    assert.deepEqual(await failureResponse.json(), { error: "Cloud deck storage is unavailable." });

    const authFailureResponse = await fetch(`${baseUrl}/api/auth-failing/cloud-decks`);
    assert.equal(authFailureResponse.status, 401);
    assert.deepEqual(await authFailureResponse.json(), { error: "Fixture token rejected." });
    assert.equal(accessedAfterAuthFailure, false, "rejected cloud auth must not access persistence");

    await assert.rejects(
      () => firebaseFailureStore.listDecks("fixture-user"),
      /simulated Firebase outage/,
      "configured Firebase failures must be injectable without production credentials",
    );
    const firebaseFailureResponse = await fetch(`${baseUrl}/api/firebase-failing/cloud-decks`);
    assert.equal(firebaseFailureResponse.status, 503);
    assert.deepEqual(await firebaseFailureResponse.json(), { error: "Cloud deck storage is unavailable." });

    const invalidTokenResponse = await fetch(`${baseUrl}/api/auth-invalid/cloud-decks`, {
      headers: { authorization: "Bearer invalid-token" },
    });
    assert.equal(invalidTokenResponse.status, 401);
    assert.deepEqual(await invalidTokenResponse.json(), { error: "Firebase auth token is invalid or expired." });

    const profileFailureResponse = await fetch(`${baseUrl}/api/profile-failing/cloud-decks`, {
      headers: { authorization: "Bearer valid-token" },
    });
    assert.equal(profileFailureResponse.status, 503);
    assert.deepEqual(await profileFailureResponse.json(), { error: "Cloud user profile storage is unavailable." });

    const invalidResponse = await fetch(`${baseUrl}/api/cloud-decks/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "bad", cardIds: [] }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousDevUserId === undefined) delete process.env.FIREBASE_DEV_USER_ID;
    else process.env.FIREBASE_DEV_USER_ID = previousDevUserId;
    if (previousCloudFallback === undefined) delete process.env.ENABLE_CLOUD_DEV_FALLBACK;
    else process.env.ENABLE_CLOUD_DEV_FALLBACK = previousCloudFallback;
  }

  await store.deleteDeck("fixture-user", deck.id);
  assert.equal(await store.readDeckById("fixture-user", deck.id), null);
  assert.match(await readFile(malformedPath, "utf8"), /not-json/);
  console.log("PASS: cloud deck store and fallback routes isolate malformed persistence and preserve API contracts");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
