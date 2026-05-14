import type { FirebaseAccountSnapshot } from "../utils/firebaseAuth";

export const EMPTY_FIREBASE_ACCOUNT: FirebaseAccountSnapshot = {
  configured: false,
  localId: null,
  displayName: null,
  email: null,
  photoUrl: null,
  isGoogleLinked: false,
};

export const TURN_RELAY_UNAVAILABLE_TEXT = "TURN relay candidate was not available.";

export const KO_DISSOLVE_MS = 800;
export const KO_ACTIVE_VACANCY_MS = 100;
export const ACTIVE_PROMOTION_REVEAL_MS = 300;
export const GAME_OVER_REVEAL_DELAY_MS = 100;
