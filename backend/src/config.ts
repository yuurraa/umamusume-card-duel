function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isCloudDevFallbackEnabled(): boolean {
  // Never allow the unauthenticated filesystem fallback in a production process,
  // even if a stale development flag is present in the environment.
  if (process.env.NODE_ENV === "production") return false;
  return parseBooleanEnv(process.env.ENABLE_CLOUD_DEV_FALLBACK) ?? false;
}

export function readCloudDevUnlocksEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return parseBooleanEnv(process.env.ENABLE_DEV_UNLOCKS)
    ?? parseBooleanEnv(process.env.VITE_ENABLE_DEV_UNLOCKS)
    ?? false;
}
