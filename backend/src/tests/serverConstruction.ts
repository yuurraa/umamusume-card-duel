import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalDeckStore } from "../storage/localDeckStore";
import { createCloudDeckStore } from "../storage/cloudDeckStore";

const previousFirebaseConfig = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const previousCloudFallback = process.env.ENABLE_CLOUD_DEV_FALLBACK;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
process.env.ENABLE_CLOUD_DEV_FALLBACK = "false";
const { app, createApp } = await import("../server");

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "umamusume-server-app-"));
const injectedServer = createServer(createApp({
  repoRoot: fixtureRoot,
  localDeckStore: createLocalDeckStore(path.join(fixtureRoot, "local")),
  cloudDeckStore: createCloudDeckStore({
    fallbackDir: path.join(fixtureRoot, "cloud"),
    devUnlocksEnabled: false,
    firebaseConfigured: () => false,
  }),
  firebaseHealth: {
    isConfigured: () => true,
    check: async () => "fixture-project",
  },
}));
await new Promise<void>((resolve) => injectedServer.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  assert.ok(address && typeof address === "object", "test server should expose an ephemeral address");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const localDeckResponse = await fetch(`http://127.0.0.1:${address.port}/api/local-decks`);
  assert.equal(localDeckResponse.status, 404, "local deck storage must remain disabled by default");
  const cloudDeckResponse = await fetch(`http://127.0.0.1:${address.port}/api/cloud-decks`);
  assert.equal(cloudDeckResponse.status, 503, "cloud persistence must require Firebase or explicit development fallback opt-in");
  assert.deepEqual(await cloudDeckResponse.json(), { error: "Firebase is not configured." });

  const injectedAddress = injectedServer.address();
  assert.ok(injectedAddress && typeof injectedAddress === "object", "injected app should expose an ephemeral address");
  const injectedHealthResponse = await fetch(`http://127.0.0.1:${injectedAddress.port}/api/firebase/health`);
  assert.equal(injectedHealthResponse.status, 200);
  assert.deepEqual(await injectedHealthResponse.json(), { ok: true, configured: true, projectId: "fixture-project" });
  console.log("PASS: backend app can be constructed and served without binding the production port");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => injectedServer.close((error) => error ? reject(error) : resolve()));
  await rm(fixtureRoot, { recursive: true, force: true });
  if (previousFirebaseConfig === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previousFirebaseConfig;
  if (previousCloudFallback === undefined) delete process.env.ENABLE_CLOUD_DEV_FALLBACK;
  else process.env.ENABLE_CLOUD_DEV_FALLBACK = previousCloudFallback;
}
