import assert from "node:assert/strict";
import { isCloudDevFallbackEnabled, readCloudDevUnlocksEnabled } from "../config";

const previousNodeEnv = process.env.NODE_ENV;
const previousFallback = process.env.ENABLE_CLOUD_DEV_FALLBACK;
const previousUnlocks = process.env.ENABLE_DEV_UNLOCKS;
const previousViteUnlocks = process.env.VITE_ENABLE_DEV_UNLOCKS;

try {
  delete process.env.NODE_ENV;
  delete process.env.ENABLE_CLOUD_DEV_FALLBACK;
  delete process.env.ENABLE_DEV_UNLOCKS;
  delete process.env.VITE_ENABLE_DEV_UNLOCKS;
  assert.equal(isCloudDevFallbackEnabled(), false, "unset environments must not expose cloud fallback");
  assert.equal(readCloudDevUnlocksEnabled(), false, "unset environments must not enable backend unlocks");

  process.env.NODE_ENV = "development";
  assert.equal(isCloudDevFallbackEnabled(), false, "development mode still requires explicit fallback opt-in");
  process.env.ENABLE_CLOUD_DEV_FALLBACK = "false";
  assert.equal(isCloudDevFallbackEnabled(), false, "fallback can be explicitly disabled during development");
  process.env.ENABLE_CLOUD_DEV_FALLBACK = "true";
  process.env.ENABLE_DEV_UNLOCKS = "true";
  assert.equal(isCloudDevFallbackEnabled(), true);
  assert.equal(readCloudDevUnlocksEnabled(), true);

  process.env.NODE_ENV = "production";
  assert.equal(isCloudDevFallbackEnabled(), false, "production must reject unauthenticated fallback even with an opt-in flag");
  assert.equal(readCloudDevUnlocksEnabled(), false, "production must keep backend unlocks disabled");
  console.log("PASS: backend persistence defaults require explicit development opt-in and stay disabled in production");
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousFallback === undefined) delete process.env.ENABLE_CLOUD_DEV_FALLBACK;
  else process.env.ENABLE_CLOUD_DEV_FALLBACK = previousFallback;
  if (previousUnlocks === undefined) delete process.env.ENABLE_DEV_UNLOCKS;
  else process.env.ENABLE_DEV_UNLOCKS = previousUnlocks;
  if (previousViteUnlocks === undefined) delete process.env.VITE_ENABLE_DEV_UNLOCKS;
  else process.env.VITE_ENABLE_DEV_UNLOCKS = previousViteUnlocks;
}
