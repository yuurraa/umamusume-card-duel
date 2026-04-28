function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

const rawDevUnlocksEnv = (import.meta.env as Record<string, unknown>).VITE_ENABLE_DEV_UNLOCKS;
const envOverride = parseBoolean(typeof rawDevUnlocksEnv === "string" ? rawDevUnlocksEnv : undefined);
const rawForcedUnownedCardIds = (import.meta.env as Record<string, unknown>).VITE_DEV_FORCE_UNOWNED_CARD_IDS;

function parseCsv(raw: unknown): Set<string> {
  if (typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

export const devUnlocksEnabled = envOverride ?? import.meta.env.DEV;
export const devForcedUnownedCardIds = parseCsv(rawForcedUnownedCardIds);

export function isDevForcedUnowned(cardId: string): boolean {
  return devForcedUnownedCardIds.has(cardId);
}
