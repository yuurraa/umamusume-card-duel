const FIREBASE_AUTH_SESSION_KEY = "umamusume-firebase-anonymous-session";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;

type FirebaseAnonymousSession = {
  idToken: string;
  refreshToken: string;
  localId: string;
  expiresAtMs: number;
};

type FirebaseSignInResponse = {
  idToken: string;
  refreshToken: string;
  localId: string;
  expiresIn: string;
};

type FirebaseRefreshResponse = {
  id_token: string;
  refresh_token: string;
  user_id: string;
  expires_in: string;
};

export async function getFirebaseAuthToken(): Promise<string | null> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  if (!apiKey) return null;

  const cached = readSession();
  if (cached && cached.expiresAtMs - TOKEN_EXPIRY_SAFETY_MS > Date.now()) return cached.idToken;

  const session = cached
    ? await refreshAnonymousSession(apiKey, cached.refreshToken)
    : await createAnonymousSession(apiKey);
  writeSession(session);
  return session.idToken;
}

async function createAnonymousSession(apiKey: string): Promise<FirebaseAnonymousSession> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!response.ok) throw new Error("Failed to sign in anonymously.");
  const payload = (await response.json()) as FirebaseSignInResponse;
  return toSession(payload.idToken, payload.refreshToken, payload.localId, payload.expiresIn);
}

async function refreshAnonymousSession(apiKey: string, refreshToken: string): Promise<FirebaseAnonymousSession> {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) return createAnonymousSession(apiKey);
  const payload = (await response.json()) as FirebaseRefreshResponse;
  return toSession(payload.id_token, payload.refresh_token, payload.user_id, payload.expires_in);
}

function toSession(idToken: string, refreshToken: string, localId: string, expiresInSeconds: string): FirebaseAnonymousSession {
  return {
    idToken,
    refreshToken,
    localId,
    expiresAtMs: Date.now() + Number(expiresInSeconds) * 1000,
  };
}

function readSession(): FirebaseAnonymousSession | null {
  try {
    const raw = window.localStorage.getItem(FIREBASE_AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as FirebaseAnonymousSession;
    if (!session.idToken || !session.refreshToken || !session.localId || !session.expiresAtMs) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(session: FirebaseAnonymousSession): void {
  window.localStorage.setItem(FIREBASE_AUTH_SESSION_KEY, JSON.stringify(session));
}
