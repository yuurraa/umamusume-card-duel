import { promises as fs } from "node:fs";
import path from "node:path";
import { cards, normalizeDeckId, validateLocalDeck, type LocalDeck } from "../../../shared/src";

export type LocalDeckStore = {
  pathFor: (deckId: string) => string;
  readById: (deckId: string) => Promise<LocalDeck | null>;
  write: (deck: LocalDeck) => Promise<void>;
  list: () => Promise<LocalDeck[]>;
  getUniqueId: (baseDeckId: string) => Promise<string>;
};

export function createLocalDeckStore(directory: string): LocalDeckStore {
  const ensureDirectory = async (): Promise<void> => {
    await fs.mkdir(directory, { recursive: true });
  };

  const pathFor = (deckId: string): string => path.join(directory, `${deckId}.json`);

  const readById = async (deckId: string): Promise<LocalDeck | null> => {
    await ensureDirectory();
    try {
      const content = await fs.readFile(pathFor(deckId), "utf8");
      const parsed = JSON.parse(content) as LocalDeck;
      const validity = validateLocalDeck(parsed, cards);
      return validity.ok ? parsed : null;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  };

  const write = async (deck: LocalDeck): Promise<void> => {
    await ensureDirectory();
    const targetPath = pathFor(deck.id);
    const tempPath = `${targetPath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, targetPath);
  };

  const list = async (): Promise<LocalDeck[]> => {
    await ensureDirectory();
    const files = await fs.readdir(directory);
    const decks: LocalDeck[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(directory, file), "utf8");
        const parsed = JSON.parse(content) as LocalDeck;
        const validity = validateLocalDeck(parsed, cards);
        if (validity.ok) decks.push(parsed);
      } catch {
        // A malformed individual file should not hide otherwise valid decks.
      }
    }
    decks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return decks;
  };

  const getUniqueId = async (baseDeckId: string): Promise<string> => {
    let candidate = normalizeDeckId(baseDeckId);
    if (!candidate) candidate = "deck";
    let suffix = 1;
    while (await readById(candidate)) {
      suffix += 1;
      candidate = `${baseDeckId}-${suffix}`;
    }
    return normalizeDeckId(candidate);
  };

  return { pathFor, readById, write, list, getUniqueId };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
