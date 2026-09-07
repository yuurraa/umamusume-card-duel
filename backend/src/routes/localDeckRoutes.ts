import express from "express";
import { promises as fs } from "node:fs";
import {
  buildLocalDeck,
  cards,
  createDeckIdFromName,
  normalizeDeckId,
  validateLocalDeck,
  type LocalDeckInput,
} from "umamusume-pocket-shared";
import type { LocalDeckStore } from "../storage/localDeckStore";

type LocalDeckRouterOptions = {
  enabled: boolean;
  store: LocalDeckStore;
};

export function createLocalDeckRouter({ enabled, store }: LocalDeckRouterOptions): express.Router {
  const router = express.Router();

  if (!enabled) {
    router.all(["/", "/*"], (_request, response) => {
      response.status(404).json({ error: "Local deck API is disabled." });
    });
    return router;
  }

  router.get("/", asyncHandler(async (_request, response) => {
    const decks = await store.list();
    response.json({ decks });
  }));

  router.get("/:deckId", asyncHandler(async (request, response) => {
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    const deck = await store.readById(deckId);
    if (!deck) {
      response.status(404).json({ error: "Deck not found." });
      return;
    }
    response.json({ deck });
  }));

  router.put("/:deckId", asyncHandler(async (request, response) => {
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

    const existing = await store.readById(deckId);
    const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString(), existing ?? undefined);
    const validity = validateLocalDeck(nextDeck, cards);
    if (!validity.ok) {
      response.status(400).json({ error: validity.reason });
      return;
    }

    await store.write(nextDeck);
    response.json({ deck: nextDeck });
  }));

  router.post("/import", asyncHandler(async (request, response) => {
    const input = request.body as LocalDeckInput;
    const parseError = validateLocalDeckInput(input);
    if (parseError) {
      response.status(400).json({ error: parseError });
      return;
    }

    const baseDeckId = createDeckIdFromName(input.name);
    const deckId = await store.getUniqueId(baseDeckId);
    const nextDeck = buildLocalDeck(deckId, input, new Date().toISOString());
    const validity = validateLocalDeck(nextDeck, cards);
    if (!validity.ok) {
      response.status(400).json({ error: validity.reason });
      return;
    }

    await store.write(nextDeck);
    response.status(201).json({ deck: nextDeck });
  }));

  router.delete("/:deckId", asyncHandler(async (request, response) => {
    const deckId = normalizeDeckId(request.params.deckId ?? "");
    if (!deckId) {
      response.status(400).json({ error: "Deck id is invalid." });
      return;
    }
    try {
      await fs.unlink(store.pathFor(deckId));
      response.status(204).send();
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        response.status(404).json({ error: "Deck not found." });
        return;
      }
      throw error;
    }
  }));

  return router;
}

export function validateLocalDeckInput(input: LocalDeckInput | undefined): string | null {
  if (!input || typeof input !== "object") return "Deck payload is required.";
  if (typeof input.name !== "string" || input.name.trim().length === 0) return "Deck name is required.";
  if (!Array.isArray(input.cardIds)) return "Deck cardIds must be an array.";
  if (input.cardIds.some((cardId) => typeof cardId !== "string" || cardId.length === 0)) return "Deck cardIds must contain card id strings.";
  if (input.coverCardId !== undefined && (typeof input.coverCardId !== "string" || input.coverCardId.length === 0)) return "Deck coverCardId must be a non-empty string.";
  if (input.energyTypes !== undefined) {
    if (!Array.isArray(input.energyTypes)) return "Deck energyTypes must be an array.";
    if (input.energyTypes.length < 1 || input.energyTypes.length > 3) return "Deck must select 1 to 3 Energy types.";
    if (new Set(input.energyTypes).size !== input.energyTypes.length) return "Deck Energy types must be unique.";
    if (input.energyTypes.some((energyType) => !VALID_GENERATED_ENERGY_TYPES.has(energyType))) return "Deck energyTypes contains an Energy type that cannot be generated.";
  }
  return null;
}

export const VALID_GENERATED_ENERGY_TYPES = new Set([
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "steel",
  "dragon",
]);

function asyncHandler(
  handler: (request: express.Request, response: express.Response) => Promise<void>,
): express.RequestHandler {
  return (request, response, next) => {
    handler(request, response).catch((error: unknown) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      response.status(503).json({ error: "Local deck storage is unavailable." });
    });
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
