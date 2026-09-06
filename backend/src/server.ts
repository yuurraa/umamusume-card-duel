import express from "express";
import cors from "cors";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFirebaseDb, isFirebaseConfigured, readFirebaseProjectId } from "./firebase";
import { createPvpRouter } from "./pvpRoutes";
import { createLocalDeckRouter } from "./routes/localDeckRoutes";
import { createCloudDeckRouter } from "./routes/cloudDeckRoutes";
import { createLocalDeckStore, type LocalDeckStore } from "./storage/localDeckStore";
import { createCloudDeckStore, type CloudDeckStore } from "./storage/cloudDeckStore";
import { readCloudDevUnlocksEnabled } from "./config";
import {
  gameData,
  MAX_BENCH,
  MAX_HAND,
  MAX_POINTS,
  OPENING_HAND,
} from "../../shared/src";

export type FirebaseHealthDependencies = {
  isConfigured: () => boolean;
  check: () => Promise<string | null>;
};

export type AppDependencies = {
  repoRoot?: string;
  localDeckStore?: LocalDeckStore;
  cloudDeckStore?: CloudDeckStore;
  localDeckApiEnabled?: boolean;
  firebaseHealth?: FirebaseHealthDependencies;
};

function defaultFirebaseHealthDependencies(): FirebaseHealthDependencies {
  return {
    isConfigured: isFirebaseConfigured,
    check: async () => {
      const db = getFirebaseDb();
      await db.listCollections();
      return readFirebaseProjectId();
    },
  };
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const repoRoot = dependencies.repoRoot ?? findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  const localDeckStore = dependencies.localDeckStore ?? createLocalDeckStore(path.join(repoRoot, "local-data", "decks"));
  const cloudDeckStore = dependencies.cloudDeckStore ?? createCloudDeckStore({
    fallbackDir: path.join(repoRoot, "local-data", "cloud-fallback"),
    devUnlocksEnabled: readCloudDevUnlocksEnabled(),
  });
  const localDeckApiEnabled = dependencies.localDeckApiEnabled ?? process.env.ENABLE_LOCAL_DECK_API === "true";
  const firebaseHealth = dependencies.firebaseHealth ?? defaultFirebaseHealthDependencies();
  const frontendDistDir = path.join(repoRoot, "frontend", "dist");

  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/firebase/health", async (_request, response) => {
    if (!firebaseHealth.isConfigured()) {
      response.status(503).json({ ok: false, configured: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured." });
      return;
    }

    try {
      response.json({ ok: true, configured: true, projectId: await firebaseHealth.check() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firebase health check failed.";
      response.status(500).json({ ok: false, configured: true, error: message });
    }
  });

  app.use("/api/pvp", createPvpRouter());

  app.get("/api/game-data", (_request, response) => {
    response.json({
      ...gameData,
      rules: {
        maxBench: MAX_BENCH,
        maxHand: MAX_HAND,
        maxPoints: MAX_POINTS,
        openingHand: OPENING_HAND,
        weaknessBonus: 20,
        noDeckOutLoss: true,
        firstPlayerSkipsDrawAndEnergy: true,
        supporterLimitPerTurn: 1,
        unlimitedTrainerTypes: ["item", "stadium"],
      },
    });
  });

  app.use("/api/local-decks", createLocalDeckRouter({ enabled: localDeckApiEnabled, store: localDeckStore }));
  app.use("/api", createCloudDeckRouter({ store: cloudDeckStore }));

  if (existsSync(path.join(frontendDistDir, "index.html"))) {
    app.use(express.static(frontendDistDir));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(path.join(frontendDistDir, "index.html"));
    });
  }

  return app;
}

export const app = createApp();

export function startServer(listenPort = Number(process.env.PORT || 8787), application = app) {
  return application.listen(listenPort, () => {
    console.log(`Umamusume Card Duel listening on port ${listenPort}`);
  });
}

function findRepoRoot(startDir: string): string {
  let currentDir = startDir;
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { workspaces?: unknown };
        if (Array.isArray(packageJson.workspaces)) return currentDir;
      } catch {
        // Keep walking upward if this package.json is not the repo root.
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return startDir;
    currentDir = parentDir;
  }
}
