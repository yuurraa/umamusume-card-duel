import { getFirebaseAuthToken } from "./firebaseAuth";

type CardCollectionResponse = {
  cardCounts: Record<string, number>;
};

type ErrorResponse = { error: string };

export async function readCloudCardCollection(baseUrl = ""): Promise<Record<string, number>> {
  const response = await fetch(`${baseUrl}/api/cloud-card-collection`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as CardCollectionResponse;
  return sanitizeCardCounts(payload.cardCounts);
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getFirebaseAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sanitizeCardCounts(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output: Record<string, number> = {};
  for (const [cardId, count] of Object.entries(input as Record<string, unknown>)) {
    if (typeof count !== "number" || !Number.isFinite(count)) continue;
    const normalized = Math.floor(count);
    if (normalized <= 0) continue;
    output[cardId] = normalized;
  }
  return output;
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
