import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

export function getFirebaseDb(): Firestore {
  if (cachedDb) return cachedDb;

  initializeFirebaseApp();
  cachedDb = getFirestore();
  return cachedDb;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;

  initializeFirebaseApp();
  cachedAuth = getAuth();
  return cachedAuth;
}

function initializeFirebaseApp(): void {
  const serviceAccount = readFirebaseServiceAccount();
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

export function readFirebaseProjectId(): string | null {
  if (!isFirebaseConfigured()) return null;
  return readFirebaseServiceAccount().projectId ?? null;
}

function readFirebaseServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");

  const parsed = JSON.parse(raw) as {
    project_id?: string;
    private_key?: string;
    client_email?: string;
    projectId?: string;
    privateKey?: string;
    clientEmail?: string;
  };
  const serviceAccount: ServiceAccount = {};
  const projectId = parsed.projectId ?? parsed.project_id;
  const privateKey = parsed.privateKey ?? parsed.private_key;
  const clientEmail = parsed.clientEmail ?? parsed.client_email;

  if (projectId) serviceAccount.projectId = projectId;
  if (privateKey) serviceAccount.privateKey = privateKey.replace(/\\n/g, "\n");
  if (clientEmail) serviceAccount.clientEmail = clientEmail;
  return serviceAccount;
}
