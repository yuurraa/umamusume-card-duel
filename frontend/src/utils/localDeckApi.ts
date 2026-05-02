import type { LocalDeck, LocalDeckInput } from "../../../shared/src/localDecks";
import type { EnergyType } from "../../../shared/src/types";
import { getFirebaseAuthToken } from "./firebaseAuth";

type DeckListResponse = { decks: LocalDeck[] };
type DeckResponse = { deck: LocalDeck };
export type CloudDeckDraft = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
  energyTypes: EnergyType[];
};
type CloudDeckDraftsResponse = {
  createDrafts: LocalDeck[];
  editDrafts: Record<string, CloudDeckDraft>;
};
type ErrorResponse = { error: string };

export async function listLocalDecks(baseUrl = ""): Promise<LocalDeck[]> {
  const response = await fetch(`${baseUrl}/api/cloud-decks`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckListResponse;
  return payload.decks;
}

export async function getLocalDeck(deckId: string, baseUrl = ""): Promise<LocalDeck> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/${encodeURIComponent(deckId)}`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckResponse;
  return payload.deck;
}

export async function saveLocalDeck(deckId: string, input: LocalDeckInput, baseUrl = ""): Promise<LocalDeck> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/${encodeURIComponent(deckId)}`, {
    method: "PUT",
    headers: await jsonAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckResponse;
  return payload.deck;
}

export async function importLocalDeck(input: LocalDeckInput, baseUrl = ""): Promise<LocalDeck> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/import`, {
    method: "POST",
    headers: await jsonAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as DeckResponse;
  return payload.deck;
}

export async function deleteLocalDeck(deckId: string, baseUrl = ""): Promise<void> {
  const response = await fetch(`${baseUrl}/api/cloud-decks/${encodeURIComponent(deckId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!response.ok) throw await parseError(response);
}

export async function listCloudDeckDrafts(baseUrl = ""): Promise<CloudDeckDraftsResponse> {
  const response = await fetch(`${baseUrl}/api/cloud-deck-drafts`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as CloudDeckDraftsResponse;
}

export async function saveCloudDeckDrafts(createDrafts: LocalDeck[], editDrafts: Record<string, CloudDeckDraft>, baseUrl = ""): Promise<void> {
  const response = await fetch(`${baseUrl}/api/cloud-deck-drafts`, {
    method: "PUT",
    headers: await jsonAuthHeaders(),
    body: JSON.stringify({ createDrafts, editDrafts }),
  });
  if (!response.ok) throw await parseError(response);
}

async function jsonAuthHeaders(): Promise<HeadersInit> {
  return { "Content-Type": "application/json", ...(await authHeaders()) };
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getFirebaseAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
