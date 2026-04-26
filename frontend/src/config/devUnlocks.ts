function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

const rawDevUnlocksEnv = (import.meta.env as Record<string, unknown>).VITE_ENABLE_DEV_UNLOCKS;
const envOverride = parseBoolean(typeof rawDevUnlocksEnv === "string" ? rawDevUnlocksEnv : undefined);

export const devUnlocksEnabled = envOverride ?? import.meta.env.DEV;
