import express from "express";
import cors from "cors";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CollectionReference } from "firebase-admin/firestore";
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured, readFirebaseProjectId } from "./firebase";
import {
  aiPremadeDecks,
  cards,
  buildLocalDeck,
  createDeckIdFromName,
  DECK_CARD_COUNT,
  gameData,
  LOCAL_DECK_FORMAT_VERSION,
  MAX_BENCH,
  MAX_HAND,
  MAX_POINTS,
  OPENING_HAND,
  ownedStarterCardIds,
  premadeDecks,
  type LocalDeck,
  type LocalDeckInput,
  normalizeDeckId,
  validateLocalDeck,
} from "../../shared/src";

const app = express();
const port = Number(process.env.PORT || 8787);
const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
const localDecksDir = path.join(repoRoot, "local-data", "decks");
const cloudFallbackDir = path.join(repoRoot, "local-data", "cloud-fallback");
const frontendDistDir = path.join(repoRoot, "frontend", "dist");
const PVP_SESSION_TTL_MS = 15 * 60 * 1000;
const PVP_SIGNAL_MAX_LENGTH = 64_000;
const localDeckApiEnabled = process.env.ENABLE_LOCAL_DECK_API === "true";
const cloudDevUnlocksEnabled = readCloudDevUnlocksEnabled();
const pvpSessions = new Map<string, PvpSession>();
const pvpIceServers = readPvpIceServersFromEnv();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/firebase/health", async (_request, response) => {
  if (!isFirebaseConfigured()) {
    response.status(503).json({ ok: false, configured: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured." });
    return;
  }

  try {
    const db = getFirebaseDb();
    await db.listCollections();
    response.json({ ok: true, configured: true, projectId: readFirebaseProjectId() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase health check failed.";
    response.status(500).json({ ok: false, configured: true, error: message });
  }
});

app.get("/api/pvp/ice-servers", (_request, response) => {
  response.json({ iceServers: pvpIceServers, iceTransportPolicy: readPvpIceTransportPolicyFromEnv() });
});

app.post("/api/pvp/sessions", (request, response) => {
  pruneExpiredPvpSessions();
  const offer = typeof request.body?.offer === "string" ? request.body.offer.trim() : "";
  if (!offer) {
    response.status(400).json({ error: "Offer is required." });
    return;
  }
  if (offer.length > PVP_SIGNAL_MAX_LENGTH) {
    response.status(413).json({ error: "Offer is too large." });
    return;
  }
  const code = createPvpCode();
  const now = Date.now();
  const expiresAt = new Date(now + PVP_SESSION_TTL_MS).toISOString();
  pvpSessions.set(code, { code, offer, answer: null, createdAt: now, expiresAt });
  response.status(201).json({ code, expiresAt });
});

app.get("/api/pvp/sessions/:code/offer", (request, response) => {
  pruneExpiredPvpSessions();
  const session = readPvpSession(request.params.code);
  if (!session) {
    response.status(404).json({ error: "Session not found or expired." });
    return;
  }
  response.json({ offer: session.offer, expiresAt: session.expiresAt });
});

app.post("/api/pvp/sessions/:code/answer", (request, response) => {
  pruneExpiredPvpSessions();
  const session = readPvpSession(request.params.code);
  if (!session) {
    response.status(404).json({ error: "Session not found or expired." });
    return;
  }
  const answer = typeof request.body?.answer === "string" ? request.body.answer.trim() : "";
  if (!answer) {
    response.status(400).json({ error: "Answer is required." });
    return;
  }
  if (answer.length > PVP_SIGNAL_MAX_LENGTH) {
    response.status(413).json({ error: "Answer is too large." });
    return;
  }
  if (session.answer) {
    response.status(409).json({ error: "Answer has already been submitted." });
    return;
  }
  session.answer = answer;
  response.json({ answer, expiresAt: session.expiresAt });
});

app.get("/api/pvp/sessions/:code/answer", (request, response) => {
  pruneExpiredPvpSessions();
  const session = readPvpSession(request.params.code);
  if (!session) {
    response.status(404).json({ error: "Session not found or expired." });
    return;
  }
  if (!session.answer) {
    response.status(202).json({ pending: true, expiresAt: session.expiresAt });
    return;
  }
  response.json({ answer: session.answer, expiresAt: session.expiresAt });
});

app.get("/api/game-data", (_request, response) => {
  response.json({
    ...gameData,
    rules: {
      maxBench: MAX_BENCH,
      maxHand: MAX_HAND,
      maxPoints: MAX_POINTS,
      openingHand: OPENING_HAND,
      weaknessBonus: 20,
      noDeckOutLoss: true,
      firstPlayerSkipsDrawAndEnergy: true,
      supporterLimitPerTurn: 1,
      unlimitedTrainerTypes: ["item", "stadium"],
    },
  });
});

if (localDeckApiEnabled) {
  app.get("/api/local-decks", async (_request, response) => {
    const decks = await readLocalDecks();
    response.json({ decks });
  });

  app.get("/api/local-decks/:deckId", async (request, response) => {
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    const deck = await readLocalDeckById(deckId);
    if (!deck) {
      response.status(404).json({ error: "Deck not found." });
      return;
    }
    response.json({ deck });
  });

  app.put("/api/local-decks/:deckId", async (request, response) => {
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

    const existing = await readLocalDeckById(deckId);
    const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString(), existing ?? undefined);
    const validity = validateLocalDeck(nextDeck, cards);
    if (!validity.ok) {
      response.status(400).json({ error: validity.reason });
      return;
    }

    await writeLocalDeck(nextDeck);
    response.json({ deck: nextDeck });
  });

  app.post("/api/local-decks/import", async (request, response) => {
    const input = request.body as LocalDeckInput;
    const parseError = validateLocalDeckInput(input);
    if (parseError) {
      response.status(400).json({ error: parseError });
      return;
    }

    const baseDeckId = createDeckIdFromName(input.name);
    const deckId = await getUniqueDeckId(baseDeckId);
    const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString());
    const validity = validateLocalDeck(nextDeck, cards);
    if (!validity.ok) {
      response.status(400).json({ error: validity.reason });
      return;
    }

    await writeLocalDeck(nextDeck);
    response.status(201).json({ deck: nextDeck });
  });

  app.delete("/api/local-decks/:deckId", async (request, response) => {
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    const deckPath = deckFilePath(deckId);
    try {
      await fs.unlink(deckPath);
      response.status(204).send();
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        response.status(404).json({ error: "Deck not found." });
        return;
      }
      throw error;
    }
  });
} else {
  app.all(["/api/local-decks", "/api/local-decks/*"], (_request, response) => {
    response.status(404).json({ error: "Local deck API is disabled." });
  });
}

app.get("/api/cloud-decks", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const decks = await readCloudDecks(userId);
  response.json({ decks });
}));

app.get("/api/cloud-decks/:deckId", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const deckId = normalizeDeckId(request.params.deckId ?? "");
  if (!deckId) {
    response.status(400).json({ error: "Deck id is invalid." });
    return;
  }
  const deck = await readCloudDeckById(userId, deckId);
  if (!deck) {
    response.status(404).json({ error: "Deck not found." });
    return;
  }
  response.json({ deck });
}));

app.put("/api/cloud-decks/:deckId", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
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

  const existing = await readCloudDeckById(userId, deckId);
  const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString(), existing ?? undefined);
  const validity = validateLocalDeck(nextDeck, cards);
  if (!validity.ok) {
    response.status(400).json({ error: validity.reason });
    return;
  }

  await writeCloudDeck(userId, nextDeck);
  response.json({ deck: nextDeck });
}));

app.post("/api/cloud-decks/import", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const input = request.body as LocalDeckInput;
  const parseError = validateLocalDeckInput(input);
  if (parseError) {
    response.status(400).json({ error: parseError });
    return;
  }

  const baseDeckId = createDeckIdFromName(input.name);
  const deckId = await getUniqueCloudDeckId(userId, baseDeckId);
  const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString());
  const validity = validateLocalDeck(nextDeck, cards);
  if (!validity.ok) {
    response.status(400).json({ error: validity.reason });
    return;
  }

  await writeCloudDeck(userId, nextDeck);
  response.status(201).json({ deck: nextDeck });
}));

app.delete("/api/cloud-decks/:deckId", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const deckId = normalizeDeckId(request.params.deckId ?? "");
  if (!deckId) {
    response.status(400).json({ error: "Deck id is invalid." });
    return;
  }
  const deck = await readCloudDeckById(userId, deckId);
  if (!deck) {
    response.status(404).json({ error: "Deck not found." });
    return;
  }
  if (isFirebaseConfigured()) {
    await cloudDecksCollection(userId).doc(deckId).delete();
  } else {
    await deleteFallbackCloudDeck(userId, deckId);
  }
  response.status(204).send();
}));

app.get("/api/cloud-deck-drafts", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const drafts = await readCloudDeckDrafts(userId);
  response.json(drafts);
}));

app.put("/api/cloud-deck-drafts", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const payload = request.body as CloudDeckDraftsPayload;
  const createDrafts = Array.isArray(payload?.createDrafts) ? payload.createDrafts.filter(isValidCreateDeckDraft) : [];
  const editDrafts = isRecord(payload?.editDrafts) ? filterEditDeckDrafts(payload.editDrafts) : {};
  await writeCloudDeckDrafts(userId, { createDrafts, editDrafts });
  response.json({ createDrafts, editDrafts });
}));

app.get("/api/cloud-card-collection", asyncHandler(async (request, response) => {
  const userId = await getCloudDeckUserId(request, response);
  if (!userId) return;
  const cardCounts = await readCloudCardCollection(userId);
  response.json({ cardCounts });
}));

if (existsSync(path.join(frontendDistDir, "index.html"))) {
  app.use(express.static(frontendDistDir));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }
    response.sendFile(path.join(frontendDistDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Umamusume Card Duel listening on port ${port}`);
});

function findRepoRoot(startDir: string): string {
  let currentDir = startDir;
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { workspaces?: unknown };
        if (Array.isArray(packageJson.workspaces)) return currentDir;
      } catch {
        // Keep walking upward if this package.json is not the repo root.
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return startDir;
    currentDir = parentDir;
  }
}

function validateLocalDeckInput(input: LocalDeckInput | undefined): string | null {
  if (!input || typeof input !== "object") return "Deck payload is required.";
  if (typeof input.name !== "string" || input.name.trim().length === 0) return "Deck name is required.";
  if (!Array.isArray(input.cardIds)) return "Deck cardIds must be an array.";
  if (input.cardIds.some((cardId) => typeof cardId !== "string" || cardId.length === 0)) return "Deck cardIds must contain card id strings.";
  if (input.coverCardId !== undefined && (typeof input.coverCardId !== "string" || input.coverCardId.length === 0)) return "Deck coverCardId must be a non-empty string.";
  return null;
}

function deckFilePath(deckId: string): string {
  return path.join(localDecksDir, `${deckId}.json`);
}

async function ensureLocalDecksDir(): Promise<void> {
  await fs.mkdir(localDecksDir, { recursive: true });
}

async function readLocalDeckById(deckId: string): Promise<LocalDeck | null> {
  await ensureLocalDecksDir();
  const targetPath = deckFilePath(deckId);
  try {
    const content = await fs.readFile(targetPath, "utf8");
    return JSON.parse(content) as LocalDeck;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalDeck(deck: LocalDeck): Promise<void> {
  await ensureLocalDecksDir();
  const targetPath = deckFilePath(deck.id);
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

async function readLocalDecks(): Promise<LocalDeck[]> {
  await ensureLocalDecksDir();
  const files = await fs.readdir(localDecksDir);
  const decks: LocalDeck[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await fs.readFile(path.join(localDecksDir, file), "utf8");
      const parsed = JSON.parse(content) as LocalDeck;
      const validity = validateLocalDeck(parsed, cards);
      if (validity.ok) decks.push(parsed);
    } catch {
      continue;
    }
  }

  decks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return decks;
}

async function getUniqueDeckId(baseDeckId: string): Promise<string> {
  let candidate = normalizeDeckId(baseDeckId);
  if (!candidate) candidate = "deck";
  let suffix = 1;
  while (await readLocalDeckById(candidate)) {
    suffix += 1;
    candidate = `${baseDeckId}-${suffix}`;
  }
  return normalizeDeckId(candidate);
}

function cloudDecksCollection(userId: string): CollectionReference<CloudDeckDoc> {
  return getFirebaseDb()
    .collection("users")
    .doc(userId)
    .collection("decks") as CollectionReference<CloudDeckDoc>;
}

async function readCloudDecks(userId: string): Promise<LocalDeck[]> {
  if (!isFirebaseConfigured()) return readFallbackCloudDecks(userId);
  await ensureCloudSeedDecks(userId);
  const snapshot = await cloudDecksCollection(userId).orderBy("updatedAt", "desc").get();
  const decks: LocalDeck[] = [];

  for (const doc of snapshot.docs) {
    const deck = doc.data();
    if (isSeedDeckDoc(deck)) continue;
    const validity = validateLocalDeck(deck, cards);
    if (validity.ok) decks.push(deck);
  }

  return decks;
}

async function readCloudDeckById(userId: string, deckId: string): Promise<LocalDeck | null> {
  if (!isFirebaseConfigured()) return readFallbackCloudDeckById(userId, deckId);
  await ensureCloudSeedDecks(userId);
  const snapshot = await cloudDecksCollection(userId).doc(deckId).get();
  if (!snapshot.exists) return null;
  const deck = snapshot.data();
  if (!deck) return null;
  if (isSeedDeckDoc(deck)) return null;
  const validity = validateLocalDeck(deck, cards);
  return validity.ok ? deck : null;
}

async function writeCloudDeck(userId: string, deck: LocalDeck): Promise<void> {
  if (!isFirebaseConfigured()) {
    await writeFallbackCloudDeck(userId, deck);
    return;
  }
  await cloudDecksCollection(userId).doc(deck.id).set(deck);
}

async function getUniqueCloudDeckId(userId: string, baseDeckId: string): Promise<string> {
  let candidate = normalizeDeckId(baseDeckId);
  if (!candidate) candidate = "deck";
  let suffix = 1;
  while (await cloudDeckDocumentExists(userId, candidate)) {
    suffix += 1;
    candidate = `${baseDeckId}-${suffix}`;
  }
  return normalizeDeckId(candidate);
}

async function cloudDeckDocumentExists(userId: string, deckId: string): Promise<boolean> {
  if (!isFirebaseConfigured()) return Boolean(await readFallbackCloudDeckById(userId, deckId));
  await ensureCloudSeedDecks(userId);
  const snapshot = await cloudDecksCollection(userId).doc(deckId).get();
  return snapshot.exists;
}

function cloudDeckDraftsCollection(userId: string): CollectionReference<CloudDeckDraft> {
  return getFirebaseDb()
    .collection("users")
    .doc(userId)
    .collection("deckDrafts") as CollectionReference<CloudDeckDraft>;
}

async function readCloudDeckDrafts(userId: string): Promise<Required<CloudDeckDraftsPayload>> {
  if (!isFirebaseConfigured()) return readFallbackCloudDeckDrafts(userId);
  const snapshot = await cloudDeckDraftsCollection(userId).orderBy("updatedAt", "desc").get();
  const createDrafts: LocalDeck[] = [];
  const editDrafts: Record<string, DeckEditorDraftPayload> = {};

  for (const doc of snapshot.docs) {
    const draft = doc.data();
    if (draft.kind === "create" && draft.deck && isValidCreateDeckDraft(draft.deck)) {
      createDrafts.push(draft.deck);
      editDrafts[draft.id] = {
        name: draft.name,
        cardIds: draft.cardIds,
        selectedCoverCardId: draft.selectedCoverCardId,
      };
    }
    if (draft.kind === "edit" && draft.sourceDeckId && isValidEditDeckDraft(draft)) {
      editDrafts[draft.sourceDeckId] = {
        name: draft.name,
        cardIds: draft.cardIds,
        selectedCoverCardId: draft.selectedCoverCardId,
      };
    }
  }

  return { createDrafts, editDrafts };
}

async function writeCloudDeckDrafts(userId: string, drafts: Required<CloudDeckDraftsPayload>): Promise<void> {
  if (!isFirebaseConfigured()) {
    await writeFallbackCloudDeckDrafts(userId, drafts);
    return;
  }
  const collection = cloudDeckDraftsCollection(userId);
  const previous = await collection.listDocuments();
  const batch = getFirebaseDb().batch();
  for (const doc of previous) batch.delete(doc);

  const nowIso = new Date().toISOString();
  for (const deck of drafts.createDrafts) {
    const editDraft = drafts.editDrafts[deck.id];
    if (!editDraft || !isValidEditDeckDraft(editDraft)) continue;
    batch.set(collection.doc(`${deck.id}`), {
      id: deck.id,
      kind: "create",
      deck,
      name: editDraft.name,
      cardIds: editDraft.cardIds,
      selectedCoverCardId: editDraft.selectedCoverCardId,
      updatedAt: deck.updatedAt || nowIso,
    } satisfies CloudDeckDraft);
  }

  for (const [deckId, editDraft] of Object.entries(drafts.editDrafts)) {
    if (drafts.createDrafts.some((deck) => deck.id === deckId)) continue;
    if (!isValidEditDeckDraft(editDraft)) continue;
    batch.set(collection.doc(`edit-${deckId}`), {
      id: `edit-${deckId}`,
      kind: "edit",
      sourceDeckId: deckId,
      name: editDraft.name,
      cardIds: editDraft.cardIds,
      selectedCoverCardId: editDraft.selectedCoverCardId,
      updatedAt: nowIso,
    } satisfies CloudDeckDraft);
  }

  await batch.commit();
}

function cloudCardCollectionDoc(userId: string) {
  return getFirebaseDb()
    .collection("users")
    .doc(userId)
    .collection("inventory")
    .doc("cards");
}

async function readCloudCardCollection(userId: string): Promise<Record<string, number>> {
  const seededCounts = buildDefaultCardCollection();
  if (!isFirebaseConfigured()) return seededCounts;

  const collectionDoc = cloudCardCollectionDoc(userId);
  const snapshot = await collectionDoc.get();
  if (!snapshot.exists) {
    const nowIso = new Date().toISOString();
    await collectionDoc.set({
      cardCounts: seededCounts,
      seededAt: nowIso,
      updatedAt: nowIso,
    } satisfies CloudCardCollectionDoc);
    return seededCounts;
  }

  const payload = snapshot.data() as CloudCardCollectionDoc | undefined;
  const cardCounts = sanitizeCardCollectionCounts(payload?.cardCounts);
  if (Object.keys(cardCounts).length > 0) return cardCounts;

  const nowIso = new Date().toISOString();
  await collectionDoc.set({
    cardCounts: seededCounts,
    updatedAt: nowIso,
  } satisfies Partial<CloudCardCollectionDoc>, { merge: true });
  return seededCounts;
}

function buildDefaultCardCollection(): Record<string, number> {
  if (isLocalDevRuntime()) {
    return Object.keys(cards).reduce<Record<string, number>>((counts, cardId) => {
      counts[cardId] = 2;
      return counts;
    }, {});
  }

  return Array.from(ownedStarterCardIds).reduce<Record<string, number>>((counts, cardId) => {
    if (!cards[cardId]) return counts;
    counts[cardId] = 2;
    return counts;
  }, {});
}

function sanitizeCardCollectionCounts(input: unknown): Record<string, number> {
  if (!isRecord(input)) return {};
  const output: Record<string, number> = {};
  for (const [cardId, count] of Object.entries(input)) {
    if (!cards[cardId]) continue;
    if (typeof count !== "number" || !Number.isFinite(count)) continue;
    const normalized = Math.floor(count);
    if (normalized <= 0) continue;
    output[cardId] = normalized;
  }
  return output;
}

function isLocalDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isValidCreateDeckDraft(deck: unknown): deck is LocalDeck {
  if (!deck || typeof deck !== "object") return false;
  const candidate = deck as LocalDeck;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.coverCardId !== "string" || candidate.coverCardId.length === 0) return false;
  if (!Array.isArray(candidate.cardIds) || candidate.cardIds.some((cardId) => typeof cardId !== "string")) return false;
  return typeof candidate.createdAt === "string" && typeof candidate.updatedAt === "string";
}

function filterEditDeckDrafts(input: Record<string, unknown>): Record<string, DeckEditorDraftPayload> {
  const output: Record<string, DeckEditorDraftPayload> = {};
  for (const [deckId, draft] of Object.entries(input)) {
    if (!isValidEditDeckDraft(draft)) continue;
    output[normalizeDeckId(deckId) || deckId] = draft;
  }
  return output;
}

function isValidEditDeckDraft(draft: unknown): draft is DeckEditorDraftPayload {
  if (!draft || typeof draft !== "object") return false;
  const candidate = draft as DeckEditorDraftPayload;
  if (typeof candidate.name !== "string") return false;
  if (!Array.isArray(candidate.cardIds) || candidate.cardIds.length !== DECK_CARD_COUNT) return false;
  if (candidate.cardIds.some((cardId) => cardId !== null && typeof cardId !== "string")) return false;
  return candidate.selectedCoverCardId === null || typeof candidate.selectedCoverCardId === "string";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

async function getCloudDeckUserId(request: express.Request, response: express.Response): Promise<string | null> {
  if (!isFirebaseConfigured() && isLocalDevRuntime()) {
    return getFallbackCloudDeckUserId();
  }

  const authHeader = request.header("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    if (!isFirebaseConfigured()) return getFallbackCloudDeckUserId();
    response.status(401).json({ error: "Firebase auth token is required." });
    return null;
  }

  if (!isFirebaseConfigured()) {
    response.status(503).json({ error: "Firebase is not configured." });
    return null;
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    await getFirebaseDb().collection("users").doc(decoded.uid).set({
      displayName: typeof decoded.name === "string" ? decoded.name : null,
      email: typeof decoded.email === "string" ? decoded.email : null,
      photoUrl: typeof decoded.picture === "string" ? decoded.picture : null,
      isAnonymous: decoded.firebase.sign_in_provider === "anonymous",
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    await ensureCloudSeedDecks(decoded.uid);
    return decoded.uid;
  } catch {
    response.status(401).json({ error: "Firebase auth token is invalid or expired." });
    return null;
  }
}

async function ensureCloudSeedDecks(userId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const seedDecksById = getCloudSeedDecksById();
  if (seedDecksById.size === 0) return;

  const nowIso = new Date().toISOString();
  const batch = getFirebaseDb().batch();
  let hasWrites = false;
  const snapshot = await cloudDecksCollection(userId).get();

  for (const doc of snapshot.docs) {
    const existing = doc.data();
    if (!isSeedDeckDoc(existing)) continue;
    if (seedDecksById.has(doc.id)) continue;
    batch.delete(doc.ref);
    hasWrites = true;
  }

  for (const deck of seedDecksById.values()) {
    const existing = snapshot.docs.find((doc) => doc.id === deck.id)?.data();
    if (existing && !isSeedDeckDoc(existing)) continue;
    if (existing && isMatchingSeedDeckDoc(existing, deck)) continue;
    const docRef = cloudDecksCollection(userId).doc(deck.id);
    batch.set(docRef, {
      id: deck.id,
      name: deck.name,
      coverCardId: deck.coverCardId,
      cardIds: [...deck.cardIds],
      formatVersion: LOCAL_DECK_FORMAT_VERSION,
      createdAt: nowIso,
      updatedAt: nowIso,
      seedKind: "premade",
    } satisfies CloudDeckDoc);
    hasWrites = true;
  }

  if (!hasWrites) return;
  await batch.commit();
}

function getCloudSeedDecksById(): Map<string, { id: string; name: string; coverCardId: string; cardIds: string[] }> {
  const seedDecks = cloudDevUnlocksEnabled ? aiPremadeDecks : premadeDecks;
  return new Map(seedDecks.map((deck) => [deck.id, deck]));
}

function isSeedDeckDoc(deck: CloudDeckDoc): boolean {
  return deck.seedKind === "premade";
}

function isMatchingSeedDeckDoc(deck: CloudDeckDoc, seed: { id: string; name: string; coverCardId: string; cardIds: string[] }): boolean {
  return deck.id === seed.id
    && deck.name === seed.name
    && deck.coverCardId === seed.coverCardId
    && deck.formatVersion === LOCAL_DECK_FORMAT_VERSION
    && deck.cardIds.length === seed.cardIds.length
    && deck.cardIds.every((cardId, index) => cardId === seed.cardIds[index]);
}

function readCloudDevUnlocksEnabled(): boolean {
  return parseBooleanEnv(process.env.VITE_ENABLE_DEV_UNLOCKS)
    ?? parseBooleanEnv(process.env.ENABLE_DEV_UNLOCKS)
    ?? process.env.NODE_ENV !== "production";
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}


function getFallbackCloudDeckUserId(): string {
  return process.env.FIREBASE_DEV_USER_ID?.trim() || "local-dev-user";
}

function fallbackUserDir(userId: string): string {
  return path.join(cloudFallbackDir, sanitizeFallbackUserId(userId));
}

function fallbackDecksDir(userId: string): string {
  return path.join(fallbackUserDir(userId), "decks");
}

function fallbackDeckPath(userId: string, deckId: string): string {
  return path.join(fallbackDecksDir(userId), `${deckId}.json`);
}

function fallbackDeckDraftsPath(userId: string): string {
  return path.join(fallbackUserDir(userId), "deckDrafts.json");
}

async function ensureFallbackDecksDir(userId: string): Promise<void> {
  await fs.mkdir(fallbackDecksDir(userId), { recursive: true });
}

async function ensureFallbackUserDir(userId: string): Promise<void> {
  await fs.mkdir(fallbackUserDir(userId), { recursive: true });
}

async function readFallbackCloudDeckById(userId: string, deckId: string): Promise<LocalDeck | null> {
  await ensureFallbackDecksDir(userId);
  const targetPath = fallbackDeckPath(userId, deckId);
  try {
    const content = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(content) as LocalDeck;
    const validity = validateLocalDeck(parsed, cards);
    return validity.ok ? parsed : null;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeFallbackCloudDeck(userId: string, deck: LocalDeck): Promise<void> {
  await ensureFallbackDecksDir(userId);
  const targetPath = fallbackDeckPath(userId, deck.id);
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

async function readFallbackCloudDecks(userId: string): Promise<LocalDeck[]> {
  await ensureFallbackDecksDir(userId);
  const files = await fs.readdir(fallbackDecksDir(userId));
  const decks: LocalDeck[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await fs.readFile(path.join(fallbackDecksDir(userId), file), "utf8");
      const parsed = JSON.parse(content) as LocalDeck;
      const validity = validateLocalDeck(parsed, cards);
      if (validity.ok) decks.push(parsed);
    } catch {
      continue;
    }
  }

  decks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return decks;
}

async function deleteFallbackCloudDeck(userId: string, deckId: string): Promise<void> {
  await ensureFallbackDecksDir(userId);
  const targetPath = fallbackDeckPath(userId, deckId);
  await fs.unlink(targetPath);
}

async function readFallbackCloudDeckDrafts(userId: string): Promise<Required<CloudDeckDraftsPayload>> {
  await ensureFallbackUserDir(userId);
  const targetPath = fallbackDeckDraftsPath(userId);
  try {
    const content = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(content) as CloudDeckDraftsPayload;
    const createDrafts = Array.isArray(parsed?.createDrafts)
      ? parsed.createDrafts.filter(isValidCreateDeckDraft)
      : [];
    const editDrafts = isRecord(parsed?.editDrafts)
      ? filterEditDeckDrafts(parsed.editDrafts)
      : {};
    return { createDrafts, editDrafts };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { createDrafts: [], editDrafts: {} };
    throw error;
  }
}

async function writeFallbackCloudDeckDrafts(userId: string, drafts: Required<CloudDeckDraftsPayload>): Promise<void> {
  await ensureFallbackUserDir(userId);
  const targetPath = fallbackDeckDraftsPath(userId);
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(drafts, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

function sanitizeFallbackUserId(userId: string): string {
  const trimmed = userId.trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized.length > 0 ? normalized : "local-dev-user";
}

function asyncHandler(
  handler: (request: express.Request, response: express.Response) => Promise<void>,
): express.RequestHandler {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

type PvpSession = {
  code: string;
  offer: string;
  answer: string | null;
  createdAt: number;
  expiresAt: string;
};

type PublicIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};
type PublicIceTransportPolicy = "all" | "relay";

type CloudDeckDraft = {
  id: string;
  kind: "create" | "edit";
  deck?: LocalDeck;
  sourceDeckId?: string;
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
  updatedAt: string;
};

type CloudDeckDoc = LocalDeck & {
  seedKind?: "premade";
};

type CloudCardCollectionDoc = {
  cardCounts: Record<string, number>;
  seededAt?: string;
  updatedAt: string;
};

type CloudDeckDraftsPayload = {
  createDrafts?: LocalDeck[];
  editDrafts?: Record<string, DeckEditorDraftPayload>;
};

type DeckEditorDraftPayload = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
};

function readPvpIceServersFromEnv(): PublicIceServer[] {
  const iceServers: PublicIceServer[] = [];
  const stunUrls = readCsvEnv("PVP_STUN_URLS");
  iceServers.push({ urls: stunUrls.length > 0 ? stunUrls : "stun:stun.l.google.com:19302" });

  const turnUrls = readCsvEnv("PVP_TURN_URLS");
  if (turnUrls.length === 0) return iceServers;

  const username = process.env.PVP_TURN_USERNAME?.trim();
  const credential = process.env.PVP_TURN_CREDENTIAL?.trim();
  if (!username || !credential) {
    console.warn("PVP_TURN_URLS is set, but PVP_TURN_USERNAME or PVP_TURN_CREDENTIAL is missing. TURN will not be advertised.");
    return iceServers;
  }

  iceServers.push({ urls: turnUrls, username, credential });
  return iceServers;
}

function readCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readPvpIceTransportPolicyFromEnv(): PublicIceTransportPolicy | undefined {
  const policy = process.env.PVP_ICE_TRANSPORT_POLICY?.trim().toLowerCase();
  return policy === "relay" || policy === "all" ? policy : undefined;
}

function createPvpCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempts = 0; attempts < 32; attempts += 1) {
    let code = "";
    for (let index = 0; index < length; index += 1) {
      const randomIndex = randomInt(alphabet.length);
      code += alphabet[randomIndex] ?? "A";
    }
    if (!pvpSessions.has(code)) return code;
  }
  throw new Error("Unable to allocate a PvP code. Please try again.");
}

function readPvpSession(rawCode: string | undefined): PvpSession | null {
  const code = normalizePvpCode(rawCode);
  if (!code) return null;
  const session = pvpSessions.get(code);
  return session ?? null;
}

function normalizePvpCode(code: string | undefined): string {
  return (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function pruneExpiredPvpSessions(): void {
  const now = Date.now();
  for (const [code, session] of pvpSessions.entries()) {
    if (session.createdAt + PVP_SESSION_TTL_MS > now) continue;
    pvpSessions.delete(code);
  }
}
