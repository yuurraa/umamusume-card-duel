import type { LocalDeck, LocalDeckInput } from "../../../shared/src/localDecks";

type DeckListResponse = { decks: LocalDeck[] };
type DeckResponse = { deck: LocalDeck };
type ErrorResponse = { error: string };

export async function listLocalDecks(baseUrl = ""): Promise<LocalDeck[]> {
  const response = await fetch(`${baseUrl}/api/cloud-decks`);
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckListResponse;
  return payload.decks;
}

export async function getLocalDeck(deckId: string, baseUrl = ""): Promise<LocalDeck> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/${encodeURIComponent(deckId)}`);
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckResponse;
  return payload.deck;
}

export async function saveLocalDeck(deckId: string, input: LocalDeckInput, baseUrl = ""): Promise<LocalDeck> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/${encodeURIComponent(deckId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckResponse;
  return payload.deck;
}

export async function importLocalDeck(input: LocalDeckInput, baseUrl = ""): Promise<LocalDeck> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckResponse;
  return payload.deck;
}

export async function deleteLocalDeck(deckId: string, baseUrl = ""): Promise<void> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/${encodeURIComponent(deckId)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await parseError(response);
}

async function parseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as ErrorResponse;
    if (payload.error) return new Error(payload.error);
  } catch {
    // ignore parse failures and fall back to status text
  }
  return new Error(`Request failed (${response.status}): ${response.statusText}`);
}
