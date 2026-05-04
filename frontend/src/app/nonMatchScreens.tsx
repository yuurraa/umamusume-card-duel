import type { AppScreen, MatchMode } from "../types/ui";
import { MainMenuScreen } from "../screens/MainMenuScreen";
import { MatchModeScreen } from "../screens/MatchModeScreen";
import { DeckBrowserScreen } from "../screens/DeckBrowserScreen";
import { CardBrowserScreen } from "../screens/CardBrowserScreen";
import { CustomisationScreen } from "../screens/CustomisationScreen";
import { type PvpRole, PvpLobbyScreen } from "../screens/PvpLobbyScreen";
import type { PremadeDeck } from "../types/ui";
import type { CustomisationSettings } from "../utils/customisation";
import type { FirebaseAccountSnapshot } from "../utils/firebaseAuth";
import { getAccountPlayerName } from "../utils/playerNames";
import { getSelectablePremadeDecks } from "../utils/deck";
import { appStyle, screenFadeOverlayStyle } from "./styles";

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
        <MatchModeScreen
          onBack={() => navigateToScreen("mainMenu")}
          onChooseMode={startWithMode}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "pvpLobby") {
    return (
      <main style={appStyle(true, selectedPlaymatImage, uiTextTone)}>
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
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "decks") {
    return (
      <main style={appStyle(false, selectedPlaymatImage, uiTextTone)}>
        <DeckBrowserScreen
          decks={selectablePremadeDecks}
          equippedDeckId={equippedDeck.id}
          onEquipDeck={(deckId) => setEquippedDeckId(deckId)}
          onBack={() => navigateToScreen("mainMenu")}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "customisation") {
    return (
      <main style={appStyle(false, selectedPlaymatImage, uiTextTone)}>
        <CustomisationScreen
          settings={customisation}
          onChange={setCustomisation}
          onBack={() => navigateToScreen("mainMenu")}
        />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  if (screen === "cards") {
    return (
      <main style={appStyle(false, selectedPlaymatImage, uiTextTone)}>
        <CardBrowserScreen onBack={() => navigateToScreen("mainMenu")} />
        <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      </main>
    );
  }

  return null;
}
