import express from "express";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from "../firebase";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildLocalDeck,
  cards,
  createDeckIdFromName,
  normalizeDeckId,
  validateLocalDeck,
  type LocalDeckInput,
} from "umamusume-pocket-shared";
import { DECK_CARD_COUNT } from "umamusume-pocket-shared/localDecks";
import type { CloudDeckStore, DeckEditorDraftPayload, CloudDeckDraftsPayload } from "../storage/cloudDeckStore";
import { validateLocalDeckInput } from "./localDeckRoutes";
import { isCloudDevFallbackEnabled } from "../config";

type CloudUserResolver = (request: express.Request, response: express.Response) => Promise<string | null>;

type CloudAuthDependencies = {
  firebaseConfigured?: () => boolean;
  firebaseAuth?: () => Auth;
  firebaseDb?: () => Firestore;
};

export function createCloudDeckRouter({
  store,
  resolveUserId,
  ...authDependencies
}: { store: CloudDeckStore; resolveUserId?: CloudUserResolver } & CloudAuthDependencies): express.Router {
  const router = express.Router();
  const resolveUser = resolveUserId ?? ((request: express.Request, response: express.Response) => resolveCloudUserId(request, response, authDependencies));

  router.get("/cloud-decks", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    response.json({ decks: await store.listDecks(userId) });
  }));

  router.get("/cloud-decks/:deckId", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    const deck = await store.readDeckById(userId, deckId);
    if (!deck) {
      response.status(404).json({ error: "Deck not found." });
      return;
    }
    response.json({ deck });
  }));

  router.put("/cloud-decks/:deckId", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    const input = request.body as LocalDeckInput;
    const parseError = validateLocalDeckInput(input);
    if (parseError) {
      response.status(400).json({ error: parseError });
      return;
    }
    const existing = await store.readDeckById(userId, deckId);
    const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString(), existing ?? undefined);
    const validity = validateLocalDeck(nextDeck, cards);
    if (!validity.ok) {
      response.status(400).json({ error: validity.reason });
      return;
    }
    await store.writeDeck(userId, nextDeck);
    response.json({ deck: nextDeck });
  }));

  router.post("/cloud-decks/import", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    const input = request.body as LocalDeckInput;
    const parseError = validateLocalDeckInput(input);
    if (parseError) {
      response.status(400).json({ error: parseError });
      return;
    }
    const deckId = await store.getUniqueDeckId(userId, createDeckIdFromName(input.name));
    const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString());
    const validity = validateLocalDeck(nextDeck, cards);
    if (!validity.ok) {
      response.status(400).json({ error: validity.reason });
      return;
    }
    await store.writeDeck(userId, nextDeck);
    response.status(201).json({ deck: nextDeck });
  }));

  router.delete("/cloud-decks/:deckId", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    if (!(await store.readDeckById(userId, deckId))) {
      response.status(404).json({ error: "Deck not found." });
      return;
    }
    await store.deleteDeck(userId, deckId);
    response.status(204).send();
  }));

  router.get("/cloud-deck-drafts", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    response.json(await store.readDrafts(userId));
  }));

  router.put("/cloud-deck-drafts", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    const payload = request.body as CloudDeckDraftsPayload;
    const createDrafts = Array.isArray(payload?.createDrafts) ? payload.createDrafts.filter(isValidCreateDraft) : [];
    const editDrafts = isRecord(payload?.editDrafts) ? filterEditDrafts(payload.editDrafts) : {};
    const drafts = { createDrafts, editDrafts };
    await store.writeDrafts(userId, drafts);
    response.json(drafts);
  }));

  router.get("/cloud-card-collection", asyncHandler(async (request, response) => {
    const userId = await resolveUser(request, response);
    if (!userId) return;
    response.json({ cardCounts: await store.readCardCollection(userId) });
  }));

  return router;
}

async function resolveCloudUserId(request: express.Request, response: express.Response, dependencies: CloudAuthDependencies = {}): Promise<string | null> {
  const configured = dependencies.firebaseConfigured ?? isFirebaseConfigured;
  if (!configured() && isCloudDevFallbackEnabled()) {
    return process.env.FIREBASE_DEV_USER_ID?.trim() || "local-dev-user";
  }
  const token = request.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    if (!configured()) {
      response.status(503).json({ error: "Firebase is not configured." });
    } else {
      response.status(401).json({ error: "Firebase auth token is required." });
    }
    return null;
  }
  if (!configured()) {
    response.status(503).json({ error: "Firebase is not configured." });
    return null;
  }
  let decoded: Awaited<ReturnType<Auth["verifyIdToken"]>>;
  try {
    decoded = await (dependencies.firebaseAuth ?? getFirebaseAuth)().verifyIdToken(token);
  } catch {
    response.status(401).json({ error: "Firebase auth token is invalid or expired." });
    return null;
  }
  try {
    await (dependencies.firebaseDb ?? getFirebaseDb)().collection("users").doc(decoded.uid).set({
      displayName: typeof decoded.name === "string" ? decoded.name : null,
      email: typeof decoded.email === "string" ? decoded.email : null,
      photoUrl: typeof decoded.picture === "string" ? decoded.picture : null,
      isAnonymous: decoded.firebase.sign_in_provider === "anonymous",
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return decoded.uid;
  } catch {
    response.status(503).json({ error: "Cloud user profile storage is unavailable." });
    return null;
  }
}

function isValidCreateDraft(value: unknown): value is NonNullable<CloudDeckDraftsPayload["createDrafts"]>[number] {
  if (!isRecord(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.name === "string"
    && candidate.name.length > 0
    && typeof candidate.coverCardId === "string"
    && Array.isArray(candidate.cardIds)
    && candidate.cardIds.every((cardId) => typeof cardId === "string")
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string";
}

function filterEditDrafts(input: Record<string, unknown>): Record<string, DeckEditorDraftPayload> {
  const output: Record<string, DeckEditorDraftPayload> = {};
  Object.entries(input).forEach(([deckId, value]) => {
    if (!isValidEditDraft(value)) return;
    output[normalizeDeckId(deckId) || deckId] = value;
  });
  return output;
}

function isValidEditDraft(value: unknown): value is DeckEditorDraftPayload {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DeckEditorDraftPayload>;
  return typeof candidate.name === "string"
    && Array.isArray(candidate.cardIds)
    && candidate.cardIds.length === DECK_CARD_COUNT
    && candidate.cardIds.every((cardId) => cardId === null || typeof cardId === "string")
    && (candidate.selectedCoverCardId === null || typeof candidate.selectedCoverCardId === "string")
    && (candidate.energyTypes === undefined || isValidEnergyTypeArray(candidate.energyTypes));
}

function isValidEnergyTypeArray(value: unknown): boolean {
  const allowed = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "dragon"]);
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 3
    && value.every((energyType) => typeof energyType === "string" && allowed.has(energyType))
    && new Set(value).size === value.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asyncHandler(handler: (request: express.Request, response: express.Response) => Promise<void>): express.RequestHandler {
  return (request, response, next) => handler(request, response).catch((error: unknown) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    response.status(503).json({ error: "Cloud deck storage is unavailable." });
  });
}
