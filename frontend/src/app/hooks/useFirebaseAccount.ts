import { useEffect, useState } from "react";
import { EMPTY_FIREBASE_ACCOUNT } from "../constants";
import {
  getFirebaseAccountSnapshot,
  linkFirebaseAccountWithGoogle,
  signOutFirebaseAccount,
  type FirebaseAccountSnapshot,
} from "../../utils/firebaseAuth";

export function useFirebaseAccount(setActionNotice: (notice: string | null) => void): {
  firebaseAccount: FirebaseAccountSnapshot;
  accountBusy: boolean;
  linkGoogleAccount: () => Promise<void>;
  logoutAccount: () => Promise<void>;
} {
  const [firebaseAccount, setFirebaseAccount] = useState<FirebaseAccountSnapshot>(EMPTY_FIREBASE_ACCOUNT);
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getFirebaseAccountSnapshot()
      .then((snapshot) => {
        if (active) setFirebaseAccount(snapshot);
      })
      .catch(() => {
        if (active) setFirebaseAccount(EMPTY_FIREBASE_ACCOUNT);
      });
    return () => {
      active = false;
    };
  }, []);

  const linkGoogleAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      setFirebaseAccount(await linkFirebaseAccountWithGoogle());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Failed to link Google account.");
    } finally {
      setAccountBusy(false);
    }
  };

  const logoutAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      setFirebaseAccount(await signOutFirebaseAccount());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Failed to log out.");
    } finally {
      setAccountBusy(false);
    }
  };

  return {
    firebaseAccount,
    accountBusy,
    linkGoogleAccount,
    logoutAccount,
  };
}
