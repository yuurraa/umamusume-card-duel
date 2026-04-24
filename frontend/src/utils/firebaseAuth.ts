const FIREBASE_AUTH_SESSION_KEY = "umamusume-firebase-anonymous-session";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
const GOOGLE_SIGN_IN_TIMEOUT_MS = 20_000;
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type FirebaseAnonymousSession = {
  idToken: string;
  refreshToken: string;
  localId: string;
  expiresAtMs: number;
  displayName?: string;
  email?: string;
  photoUrl?: string;
  providerId?: string;
};

type FirebaseSignInResponse = {
  idToken: string;
  refreshToken: string;
  localId: string;
  expiresIn: string;
  displayName?: string;
  email?: string;
  photoUrl?: string;
  providerId?: string;
};

type FirebaseRefreshResponse = {
  id_token: string;
  refresh_token: string;
  user_id: string;
  expires_in: string;
};

type FirebaseLookupResponse = {
  users?: Array<{
    displayName?: string;
    email?: string;
    photoUrl?: string;
    providerUserInfo?: Array<{
      providerId?: string;
      displayName?: string;
      email?: string;
      photoUrl?: string;
    }>;
  }>;
};

type FirebaseProviderResponse = FirebaseSignInResponse;

export type FirebaseAccountSnapshot = {
  configured: boolean;
  localId: string | null;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
  isGoogleLinked: boolean;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleTokenClient = {
  requestAccessToken: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

export async function getFirebaseAuthToken(): Promise<string | null> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  if (!apiKey) return null;

  const cached = readSession();
  if (cached && cached.expiresAtMs - TOKEN_EXPIRY_SAFETY_MS > Date.now()) return cached.idToken;

  const session = cached
    ? await refreshAnonymousSession(apiKey, cached)
    : await createAnonymousSession(apiKey);
  writeSession(session);
  return session.idToken;
}

export async function getFirebaseAccountSnapshot(): Promise<FirebaseAccountSnapshot> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  if (!apiKey) return { configured: false, localId: null, displayName: null, email: null, photoUrl: null, isGoogleLinked: false };
  const idToken = await getFirebaseAuthToken();
  if (idToken) await hydrateSessionProfile(apiKey, idToken);
  const session = readSession();
  return {
    configured: true,
    localId: session?.localId ?? null,
    displayName: session?.displayName ?? null,
    email: session?.email ?? null,
    photoUrl: session?.photoUrl ?? null,
    isGoogleLinked: session?.providerId === "google.com",
  };
}

async function hydrateSessionProfile(apiKey: string, idToken: string): Promise<void> {
  const session = readSession();
  if (!session) return;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return;

  const payload = (await response.json()) as FirebaseLookupResponse;
  const user = payload.users?.[0];
  const googleProfile = user?.providerUserInfo?.find((profile) => profile.providerId === "google.com");
  if (!user && !googleProfile) return;

  const displayName = googleProfile?.displayName ?? user?.displayName;
  const email = googleProfile?.email ?? user?.email;
  const photoUrl = googleProfile?.photoUrl ?? user?.photoUrl;
  writeSession({
    ...session,
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(googleProfile ? { providerId: "google.com" } : {}),
  });
}

export async function linkFirebaseAccountWithGoogle(): Promise<FirebaseAccountSnapshot> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!apiKey) throw new Error("Firebase web API key is not configured.");
  if (!googleClientId) throw new Error("Google client id is not configured.");

  const currentIdToken = await getFirebaseAuthToken();
  if (!currentIdToken) throw new Error("Guest profile is not ready.");
  const accessToken = await requestGoogleAccessToken(googleClientId);
  const session = await signInWithGoogleProvider(apiKey, currentIdToken, accessToken);
  writeSession(session);
  return getFirebaseAccountSnapshot();
}

async function createAnonymousSession(apiKey: string): Promise<FirebaseAnonymousSession> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!response.ok) throw new Error("Failed to sign in anonymously.");
  const payload = (await response.json()) as FirebaseSignInResponse;
  return toSession(payload);
}

async function refreshAnonymousSession(apiKey: string, previousSession: FirebaseAnonymousSession): Promise<FirebaseAnonymousSession> {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: previousSession.refreshToken,
    }),
  });
  if (!response.ok) return createAnonymousSession(apiKey);
  const payload = (await response.json()) as FirebaseRefreshResponse;
  const nextPayload: FirebaseSignInResponse = {
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
    localId: payload.user_id,
    expiresIn: payload.expires_in,
  };
  if (previousSession.displayName) nextPayload.displayName = previousSession.displayName;
  if (previousSession.email) nextPayload.email = previousSession.email;
  if (previousSession.photoUrl) nextPayload.photoUrl = previousSession.photoUrl;
  if (previousSession.providerId) nextPayload.providerId = previousSession.providerId;
  return toSession(nextPayload);
}

async function signInWithGoogleProvider(apiKey: string, currentIdToken: string, googleAccessToken: string): Promise<FirebaseAnonymousSession> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: new URLSearchParams({
        access_token: googleAccessToken,
        providerId: "google.com",
      }).toString(),
      requestUri: window.location.origin,
      idToken: currentIdToken,
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  });
  if (!response.ok) throw new Error("Failed to link Google account.");
  const payload = (await response.json()) as FirebaseProviderResponse;
  return toSession({ ...payload, providerId: "google.com" });
}

function toSession(payload: FirebaseSignInResponse): FirebaseAnonymousSession {
  return {
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    localId: payload.localId,
    expiresAtMs: Date.now() + Number(payload.expiresIn) * 1000,
    ...(payload.displayName ? { displayName: payload.displayName } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.photoUrl ? { photoUrl: payload.photoUrl } : {}),
    ...(payload.providerId ? { providerId: payload.providerId } : {}),
  };
}

async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = window.setTimeout(() => {
      settle(() => reject(new Error("Google sign-in did not complete. Check the Google OAuth client URL settings.")));
    }, GOOGLE_SIGN_IN_TIMEOUT_MS);
    const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: (response) => {
        if (response.error || !response.access_token) {
          settle(() => reject(new Error(response.error ?? "Google sign-in was cancelled.")));
          return;
        }
        const accessToken = response.access_token;
        settle(() => resolve(accessToken));
      },
    });
    if (!tokenClient) {
      settle(() => reject(new Error("Google sign-in is unavailable.")));
      return;
    }
    tokenClient.requestAccessToken();
  });
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google sign-in.")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in."));
    document.head.appendChild(script);
  });
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
