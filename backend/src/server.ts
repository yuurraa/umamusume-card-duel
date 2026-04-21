import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cards,
  buildLocalDeck,
  createDeckIdFromName,
  gameData,
  MAX_BENCH,
  MAX_HAND,
  MAX_POINTS,
  OPENING_HAND,
  type LocalDeck,
  type LocalDeckInput,
  normalizeDeckId,
  validateLocalDeck,
} from "../../shared/src";

const app = express();
const port = Number(process.env.PORT || 8787);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localDecksDir = path.join(repoRoot, "local-data", "decks");

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
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

app.listen(port, () => {
  console.log(`Umamusume Card Duel backend listening on http://127.0.0.1:${port}`);
});

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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
