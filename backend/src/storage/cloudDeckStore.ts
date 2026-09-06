import { promises as fs } from "node:fs";
import path from "node:path";
import type { CollectionReference } from "firebase-admin/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "../firebase";
import {
  aiPremadeDecks,
  cards,
  LOCAL_DECK_FORMAT_VERSION,
  ownedStarterCardIds,
  premadeDecks,
  normalizeDeckId,
  type EnergyType,
  type LocalDeck,
  type PremadeDeck,
} from "../../../shared/src";
import { DECK_CARD_COUNT, validateLocalDeck } from "../../../shared/src/localDecks";

export type CloudDeckDraft = {
  id: string;
  kind: "create" | "edit";
  deck?: LocalDeck;
  sourceDeckId?: string;
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
  energyTypes?: string[];
  updatedAt: string;
};

export type CloudDeckDoc = LocalDeck & { seedKind?: "premade" };

export type CloudCardCollectionDoc = {
  cardCounts: Record<string, number>;
  seededAt?: string;
  updatedAt?: string;
};

export type CloudDeckDraftsPayload = {
  createDrafts?: LocalDeck[];
  editDrafts?: Record<string, DeckEditorDraftPayload>;
};

export type DeckEditorDraftPayload = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
  energyTypes?: string[];
};

export type CloudDeckStore = {
  listDecks(userId: string): Promise<LocalDeck[]>;
  readDeckById(userId: string, deckId: string): Promise<LocalDeck | null>;
  writeDeck(userId: string, deck: LocalDeck): Promise<void>;
  deleteDeck(userId: string, deckId: string): Promise<void>;
  getUniqueDeckId(userId: string, baseDeckId: string): Promise<string>;
  readDrafts(userId: string): Promise<Required<CloudDeckDraftsPayload>>;
  writeDrafts(userId: string, drafts: Required<CloudDeckDraftsPayload>): Promise<void>;
  readCardCollection(userId: string): Promise<Record<string, number>>;
};

export function createCloudDeckStore(options: {
  fallbackDir: string;
  devUnlocksEnabled: boolean;
  firebaseConfigured?: () => boolean;
}): CloudDeckStore {
  const firebaseConfigured = options.firebaseConfigured ?? isFirebaseConfigured;

  return {
    listDecks: (userId) => listDecks(userId, options, firebaseConfigured),
    readDeckById: (userId, deckId) => readDeckById(userId, deckId, options, firebaseConfigured),
    writeDeck: (userId, deck) => writeDeck(userId, deck, options, firebaseConfigured),
    deleteDeck: (userId, deckId) => deleteDeck(userId, deckId, options, firebaseConfigured),
    getUniqueDeckId: (userId, baseDeckId) => getUniqueDeckId(userId, baseDeckId, options, firebaseConfigured),
    readDrafts: (userId) => readDrafts(userId, options, firebaseConfigured),
    writeDrafts: (userId, drafts) => writeDrafts(userId, drafts, options, firebaseConfigured),
    readCardCollection: (userId) => readCardCollection(userId, options, firebaseConfigured),
  };
}

async function listDecks(userId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<LocalDeck[]> {
  if (!firebaseConfigured()) return readFallbackDecks(userId, options);
  await ensureSeedDecks(userId, options);
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

async function readDeckById(userId: string, deckId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<LocalDeck | null> {
  if (!firebaseConfigured()) return readFallbackDeckById(userId, deckId, options);
  await ensureSeedDecks(userId, options);
  const snapshot = await cloudDecksCollection(userId).doc(deckId).get();
  if (!snapshot.exists) return null;
  const deck = snapshot.data();
  if (!deck || isSeedDeckDoc(deck)) return null;
  return validateLocalDeck(deck, cards).ok ? deck : null;
}

async function writeDeck(userId: string, deck: LocalDeck, options: StoreOptions, firebaseConfigured: () => boolean): Promise<void> {
  if (!firebaseConfigured()) {
    await writeFallbackDeck(userId, deck, options);
    return;
  }
  await cloudDecksCollection(userId).doc(deck.id).set(deck);
}

async function deleteDeck(userId: string, deckId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<void> {
  if (!firebaseConfigured()) {
    await fs.unlink(fallbackDeckPath(options.fallbackDir, userId, deckId));
    return;
  }
  await cloudDecksCollection(userId).doc(deckId).delete();
}

async function getUniqueDeckId(userId: string, baseDeckId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<string> {
  const normalizedBase = normalizeDeckId(baseDeckId) || "deck";
  let candidate = normalizedBase;
  let suffix = 1;
  while (await deckDocumentExists(userId, candidate, options, firebaseConfigured)) {
    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }
  return candidate;
}

async function deckDocumentExists(userId: string, deckId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<boolean> {
  if (!firebaseConfigured()) return Boolean(await readFallbackDeckById(userId, deckId, options));
  await ensureSeedDecks(userId, options);
  const snapshot = await cloudDecksCollection(userId).doc(deckId).get();
  return snapshot.exists;
}

async function readDrafts(userId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<Required<CloudDeckDraftsPayload>> {
  if (!firebaseConfigured()) return readFallbackDrafts(userId, options);
  const snapshot = await cloudDeckDraftsCollection(userId).orderBy("updatedAt", "desc").get();
  return draftsFromDocuments(snapshot.docs.map((doc) => doc.data()));
}

async function writeDrafts(userId: string, drafts: Required<CloudDeckDraftsPayload>, options: StoreOptions, firebaseConfigured: () => boolean): Promise<void> {
  if (!firebaseConfigured()) {
    await writeFallbackDrafts(userId, drafts, options);
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
    batch.set(collection.doc(deck.id), {
      id: deck.id,
      kind: "create",
      deck,
      name: editDraft.name,
      cardIds: editDraft.cardIds,
      selectedCoverCardId: editDraft.selectedCoverCardId,
      energyTypes: editDraft.energyTypes ?? ["psychic"],
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
      energyTypes: editDraft.energyTypes ?? ["psychic"],
      updatedAt: nowIso,
    } satisfies CloudDeckDraft);
  }
  await batch.commit();
}

async function readCardCollection(userId: string, options: StoreOptions, firebaseConfigured: () => boolean): Promise<Record<string, number>> {
  const seededCounts = buildDefaultCardCollection(options.devUnlocksEnabled);
  if (!firebaseConfigured()) return seededCounts;
  const document = cloudCardCollectionDoc(userId);
  const snapshot = await document.get();
  if (!snapshot.exists) {
    const nowIso = new Date().toISOString();
    await document.set({ cardCounts: seededCounts, seededAt: nowIso, updatedAt: nowIso } satisfies CloudCardCollectionDoc);
    return seededCounts;
  }
  const payload = snapshot.data() as CloudCardCollectionDoc | undefined;
  const cardCounts = sanitizeCardCollectionCounts(payload?.cardCounts);
  if (Object.keys(cardCounts).length > 0) return cardCounts;
  await document.set({ cardCounts: seededCounts, updatedAt: new Date().toISOString() }, { merge: true });
  return seededCounts;
}

async function ensureSeedDecks(userId: string, options: StoreOptions): Promise<void> {
  const seedDecks = options.devUnlocksEnabled ? aiPremadeDecks : premadeDecks;
  if (seedDecks.length === 0) return;
  const collection = cloudDecksCollection(userId);
  const snapshot = await collection.get();
  const byId = new Map(seedDecks.map((deck) => [deck.id, deck]));
  const batch = getFirebaseDb().batch();
  let hasWrites = false;
  for (const doc of snapshot.docs) {
    if (isSeedDeckDoc(doc.data()) && !byId.has(doc.id)) {
      batch.delete(doc.ref);
      hasWrites = true;
    }
  }
  const nowIso = new Date().toISOString();
  for (const deck of seedDecks) {
    const existing = snapshot.docs.find((doc) => doc.id === deck.id)?.data();
    if (existing && !isSeedDeckDoc(existing)) continue;
    if (existing && isMatchingSeedDeckDoc(existing, deck)) continue;
    batch.set(collection.doc(deck.id), {
      id: deck.id,
      name: deck.name,
      coverCardId: deck.coverCardId,
      cardIds: [...deck.cardIds],
      ...(deck.energyTypes ? { energyTypes: [...deck.energyTypes] } : {}),
      formatVersion: LOCAL_DECK_FORMAT_VERSION,
      createdAt: nowIso,
      updatedAt: nowIso,
      seedKind: "premade",
    } satisfies CloudDeckDoc);
    hasWrites = true;
  }
  if (hasWrites) await batch.commit();
}

type StoreOptions = { fallbackDir: string; devUnlocksEnabled: boolean };

function cloudDecksCollection(userId: string): CollectionReference<CloudDeckDoc> {
  return getFirebaseDb().collection("users").doc(userId).collection("decks") as CollectionReference<CloudDeckDoc>;
}

function cloudDeckDraftsCollection(userId: string): CollectionReference<CloudDeckDraft> {
  return getFirebaseDb().collection("users").doc(userId).collection("deckDrafts") as CollectionReference<CloudDeckDraft>;
}

function cloudCardCollectionDoc(userId: string) {
  return getFirebaseDb().collection("users").doc(userId).collection("inventory").doc("cards");
}

async function readFallbackDeckById(userId: string, deckId: string, options: StoreOptions): Promise<LocalDeck | null> {
  await ensureFallbackDecksDir(options.fallbackDir, userId);
  try {
    const parsed = JSON.parse(await fs.readFile(fallbackDeckPath(options.fallbackDir, userId, deckId), "utf8")) as LocalDeck;
    return validateLocalDeck(parsed, cards).ok ? parsed : null;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

async function readFallbackDecks(userId: string, options: StoreOptions): Promise<LocalDeck[]> {
  await ensureFallbackDecksDir(options.fallbackDir, userId);
  const decks: LocalDeck[] = [];
  for (const file of await fs.readdir(fallbackDecksDir(options.fallbackDir, userId))) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(fallbackDecksDir(options.fallbackDir, userId), file), "utf8")) as LocalDeck;
      if (validateLocalDeck(parsed, cards).ok) decks.push(parsed);
    } catch {
      // Ignore one malformed fallback document without hiding other decks.
    }
  }
  return decks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function writeFallbackDeck(userId: string, deck: LocalDeck, options: StoreOptions): Promise<void> {
  await ensureFallbackDecksDir(options.fallbackDir, userId);
  const targetPath = fallbackDeckPath(options.fallbackDir, userId, deck.id);
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

async function readFallbackDrafts(userId: string, options: StoreOptions): Promise<Required<CloudDeckDraftsPayload>> {
  await ensureFallbackUserDir(options.fallbackDir, userId);
  try {
    const parsed = JSON.parse(await fs.readFile(fallbackDraftsPath(options.fallbackDir, userId), "utf8")) as CloudDeckDraftsPayload;
    return draftsFromPayload(parsed);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { createDrafts: [], editDrafts: {} };
    throw error;
  }
}

async function writeFallbackDrafts(userId: string, drafts: Required<CloudDeckDraftsPayload>, options: StoreOptions): Promise<void> {
  await ensureFallbackUserDir(options.fallbackDir, userId);
  const targetPath = fallbackDraftsPath(options.fallbackDir, userId);
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(drafts, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, targetPath);
}

function draftsFromDocuments(documents: CloudDeckDraft[]): Required<CloudDeckDraftsPayload> {
  const createDrafts: LocalDeck[] = [];
  const editDrafts: Record<string, DeckEditorDraftPayload> = {};
  documents.forEach((draft) => {
    if (draft.kind === "create" && draft.deck && isValidCreateDeckDraft(draft.deck)) {
      createDrafts.push(draft.deck);
      editDrafts[draft.id] = {
        name: draft.name,
        cardIds: draft.cardIds,
        selectedCoverCardId: draft.selectedCoverCardId,
        energyTypes: draft.energyTypes ?? ["psychic"],
      };
    }
    if (draft.kind === "edit" && draft.sourceDeckId && isValidEditDeckDraft(draft)) {
      editDrafts[draft.sourceDeckId] = {
        name: draft.name,
        cardIds: draft.cardIds,
        selectedCoverCardId: draft.selectedCoverCardId,
        energyTypes: draft.energyTypes ?? ["psychic"],
      };
    }
  });
  return { createDrafts, editDrafts };
}

function draftsFromPayload(payload: CloudDeckDraftsPayload | undefined): Required<CloudDeckDraftsPayload> {
  const createDrafts = Array.isArray(payload?.createDrafts) ? payload.createDrafts.filter(isValidCreateDeckDraft) : [];
  const editDrafts = isRecord(payload?.editDrafts) ? filterEditDrafts(payload.editDrafts) : {};
  return { createDrafts, editDrafts };
}

function buildDefaultCardCollection(devUnlocksEnabled: boolean): Record<string, number> {
  const ids = devUnlocksEnabled ? Object.keys(cards) : [...ownedStarterCardIds];
  return ids.reduce<Record<string, number>>((counts, cardId) => {
    if (cards[cardId]) counts[cardId] = 2;
    return counts;
  }, {});
}

function sanitizeCardCollectionCounts(input: unknown): Record<string, number> {
  if (!isRecord(input)) return {};
  const output: Record<string, number> = {};
  for (const [cardId, count] of Object.entries(input)) {
    if (!cards[cardId] || typeof count !== "number" || !Number.isFinite(count)) continue;
    const normalized = Math.floor(count);
    if (normalized > 0) output[cardId] = normalized;
  }
  return output;
}

function isValidCreateDeckDraft(deck: unknown): deck is LocalDeck {
  if (!isRecord(deck)) return false;
  const candidate = deck as Partial<LocalDeck>;
  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.name === "string"
    && candidate.name.length > 0
    && typeof candidate.coverCardId === "string"
    && candidate.coverCardId.length > 0
    && Array.isArray(candidate.cardIds)
    && candidate.cardIds.every((cardId) => typeof cardId === "string")
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
    && (candidate.energyTypes === undefined || isValidEnergyTypeArray(candidate.energyTypes));
}

function filterEditDrafts(input: Record<string, unknown>): Record<string, DeckEditorDraftPayload> {
  const output: Record<string, DeckEditorDraftPayload> = {};
  for (const [deckId, draft] of Object.entries(input)) {
    if (isValidEditDeckDraft(draft)) output[deckId] = draft;
  }
  return output;
}

function isValidEditDeckDraft(draft: unknown): draft is DeckEditorDraftPayload {
  if (!isRecord(draft)) return false;
  const candidate = draft as Partial<DeckEditorDraftPayload>;
  return typeof candidate.name === "string"
    && Array.isArray(candidate.cardIds)
    && candidate.cardIds.length === DECK_CARD_COUNT
    && candidate.cardIds.every((cardId) => cardId === null || typeof cardId === "string")
    && (candidate.selectedCoverCardId === null || typeof candidate.selectedCoverCardId === "string")
    && (candidate.energyTypes === undefined || isValidEnergyTypeArray(candidate.energyTypes));
}

function isValidEnergyTypeArray(value: unknown): value is EnergyType[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return false;
  return value.every((energyType) => typeof energyType === "string" && VALID_GENERATED_ENERGY_TYPES.has(energyType))
    && new Set(value).size === value.length;
}

const VALID_GENERATED_ENERGY_TYPES = new Set<string>([
  "grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "dragon",
]);

function isSeedDeckDoc(deck: CloudDeckDoc): boolean {
  return deck.seedKind === "premade";
}

function isMatchingSeedDeckDoc(deck: CloudDeckDoc, seed: PremadeDeck): boolean {
  return deck.id === seed.id
    && deck.name === seed.name
    && deck.coverCardId === seed.coverCardId
    && deck.formatVersion === LOCAL_DECK_FORMAT_VERSION
    && deck.cardIds.length === seed.cardIds.length
    && deck.cardIds.every((cardId, index) => cardId === seed.cardIds[index])
    && sameEnergyTypes(deck.energyTypes, seed.energyTypes);
}

function sameEnergyTypes(left: readonly EnergyType[] | undefined, right: readonly EnergyType[] | undefined): boolean {
  const leftTypes = left ?? [];
  const rightTypes = right ?? [];
  return leftTypes.length === rightTypes.length && leftTypes.every((value, index) => value === rightTypes[index]);
}

function fallbackUserDir(rootDir: string, userId: string): string {
  return path.join(rootDir, sanitizeUserId(userId));
}

function fallbackDecksDir(rootDir: string, userId: string): string {
  return path.join(fallbackUserDir(rootDir, userId), "decks");
}

function fallbackDeckPath(rootDir: string, userId: string, deckId: string): string {
  return path.join(fallbackDecksDir(rootDir, userId), `${deckId}.json`);
}

function fallbackDraftsPath(rootDir: string, userId: string): string {
  return path.join(fallbackUserDir(rootDir, userId), "deckDrafts.json");
}

async function ensureFallbackDecksDir(rootDir: string, userId: string): Promise<void> {
  await fs.mkdir(fallbackDecksDir(rootDir, userId), { recursive: true });
}

async function ensureFallbackUserDir(rootDir: string, userId: string): Promise<void> {
  await fs.mkdir(fallbackUserDir(rootDir, userId), { recursive: true });
}

function sanitizeUserId(userId: string): string {
  const normalized = userId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized || "local-dev-user";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
