import { lazy, Suspense } from "react";
import type { AppScreen, MatchMode } from "../types/ui";
import { MainMenuScreen } from "../screens/MainMenuScreen";
import type { PvpRole } from "../screens/PvpLobbyScreen";
import type { PremadeDeck } from "../types/ui";
import type { CustomisationSettings } from "../utils/customisation";
import type { FirebaseAccountSnapshot } from "../utils/firebaseAuth";
import { getAccountPlayerName } from "../utils/playerNames";
import { getSelectablePremadeDecks } from "../utils/deck";
import { appStyle, screenFadeOverlayStyle } from "./styles";

const MatchModeScreen = lazy(() => import("../screens/MatchModeScreen").then((module) => ({
  default: module.MatchModeScreen,
})));
const DeckBrowserScreen = lazy(() => import("../screens/DeckBrowserScreen").then((module) => ({
  default: module.DeckBrowserScreen,
})));
const CardBrowserScreen = lazy(() => import("../screens/CardBrowserScreen").then((module) => ({
  default: module.CardBrowserScreen,
})));
const CustomisationScreen = lazy(() => import("../screens/CustomisationScreen").then((module) => ({
  default: module.CustomisationScreen,
})));
const PvpLobbyScreen = lazy(() => import("../screens/PvpLobbyScreen").then((module) => ({
  default: module.PvpLobbyScreen,
})));

type NonMatchScreenProps = {
  screen: AppScreen;
  selectedPlaymatImage: string | null;
  uiTextTone: "light" | "dark";
  screenFadeOverlayOpacity: number;
  equippedDeck: PremadeDeck;
  account: FirebaseAccountSnapshot;
  accountBusy: boolean;
  customisation: CustomisationSettings;
  navigateToScreen: (screen: AppScreen) => void;
  setEquippedDeckId: (deckId: string) => void;
  setCustomisation: (settings: CustomisationSettings) => void;
  startWithMode: (mode: MatchMode) => void;
  playEquippedDeck: () => void;
  linkGoogleAccount: () => void;
  logoutAccount: () => void;
  quitApp: () => void;
  pvpRole: PvpRole | null;
  pvpStatusDetail: string;
  pvpLocalSignal: string;
  pvpRemoteSignal: string;
  pvpConnected: boolean;
  onPvpSetRole: (role: PvpRole) => void;
  onPvpCreateOffer: () => void;
  onPvpJoinWithOffer: (codeOverride?: string) => void;
  onPvpRemoteSignalChange: (value: string) => void;
  onPvpCopyLocalSignal: () => void;
  onPvpClear: () => void;
};

export function renderNonMatchScreen(props: NonMatchScreenProps): JSX.Element | null {
  const selectablePremadeDecks = getSelectablePremadeDecks();

  const {
    screen,
    selectedPlaymatImage,
    uiTextTone,
    screenFadeOverlayOpacity,
    equippedDeck,
    account,
    accountBusy,
    customisation,
    navigateToScreen,
    setEquippedDeckId,
    setCustomisation,
    startWithMode,
    playEquippedDeck,
    linkGoogleAccount,
    logoutAccount,
    quitApp,
    pvpRole,
    pvpStatusDetail,
    pvpLocalSignal,
    pvpRemoteSignal,
    pvpConnected,
    onPvpSetRole,
    onPvpCreateOffer,
    onPvpJoinWithOffer,
    onPvpRemoteSignalChange,
    onPvpCopyLocalSignal,
    onPvpClear,
  } = props;

  const lazyFallback = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        color: "var(--ui-text-color)",
        textShadow: "var(--ui-text-shadow)",
        fontSize: "0.85rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      Loading...
    </div>
  );

  if (screen === "mainMenu") {
    return (
      <main style={appStyle(true, selectedPlaymatImage, uiTextTone)}>
        <MainMenuScreen
          equippedDeck={equippedDeck}
          accountLabel={getAccountPlayerName(account)}
          accountDetail={account.localId ? `Guest ${account.localId.slice(0, 8)}` : "Guest"}
          accountPhotoUrl={account.photoUrl}
          accountBusy={accountBusy}
          cloudAvailable={account.configured}
          isGoogleLinked={account.isGoogleLinked}
          onPlay={playEquippedDeck}
          onOpenDecks={() => navigateToScreen("decks")}
          onOpenCards={() => navigateToScreen("cards")}
          onOpenCustomisation={() => navigateToScreen("customisation")}
          onLinkGoogleAccount={linkGoogleAccount}
          onLogoutAccount={logoutAccount}
          onQuit={quitApp}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "modeSelect") {
    return (
      <main style={appStyle(true, selectedPlaymatImage, uiTextTone)}>
        <Suspense fallback={lazyFallback}>
          <MatchModeScreen
            onBack={() => navigateToScreen("mainMenu")}
            onChooseMode={startWithMode}
          />
        </Suspense>
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "pvpLobby") {
    return (
      <main style={appStyle(true, selectedPlaymatImage, uiTextTone)}>
        <Suspense fallback={lazyFallback}>
          <PvpLobbyScreen
            role={pvpRole}
            statusDetail={pvpStatusDetail}
            localSignal={pvpLocalSignal}
            remoteSignal={pvpRemoteSignal}
            connected={pvpConnected}
            onBack={() => {
              if (pvpRole) {
                onPvpClear();
                return;
              }
              onPvpClear();
              navigateToScreen("modeSelect");
            }}
            onSetRole={onPvpSetRole}
            onCreateOffer={onPvpCreateOffer}
            onJoinWithOffer={onPvpJoinWithOffer}
            onRemoteSignalChange={onPvpRemoteSignalChange}
            onCopyLocalSignal={onPvpCopyLocalSignal}
            onClear={onPvpClear}
          />
        </Suspense>
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "decks") {
    return (
      <main style={appStyle(false, selectedPlaymatImage, uiTextTone)}>
        <Suspense fallback={lazyFallback}>
          <DeckBrowserScreen
            decks={selectablePremadeDecks}
            equippedDeckId={equippedDeck.id}
            onEquipDeck={(deckId) => setEquippedDeckId(deckId)}
            onBack={() => navigateToScreen("mainMenu")}
          />
        </Suspense>
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "customisation") {
    return (
      <main style={appStyle(false, selectedPlaymatImage, uiTextTone)}>
        <Suspense fallback={lazyFallback}>
          <CustomisationScreen
            settings={customisation}
            onChange={setCustomisation}
            onBack={() => navigateToScreen("mainMenu")}
          />
        </Suspense>
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "cards") {
    return (
      <main style={appStyle(false, selectedPlaymatImage, uiTextTone)}>
        <Suspense fallback={lazyFallback}>
          <CardBrowserScreen onBack={() => navigateToScreen("mainMenu")} />
        </Suspense>
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  return null;
}
