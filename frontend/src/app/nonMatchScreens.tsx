import { premadeDecks } from "../../../shared/src/gameData";
import type { AppScreen, MatchMode } from "../types/ui";
import { MainMenuScreen } from "../screens/MainMenuScreen";
import { MatchModeScreen } from "../screens/MatchModeScreen";
import { DeckBrowserScreen } from "../screens/DeckBrowserScreen";
import { CardBrowserScreen } from "../screens/CardBrowserScreen";
import { CustomisationScreen } from "../screens/CustomisationScreen";
import { type PvpRole, PvpLobbyScreen } from "../screens/PvpLobbyScreen";
import type { PremadeDeck } from "../types/ui";
import type { CustomisationSettings } from "../utils/customisation";
import { appStyle, screenFadeOverlayStyle } from "./styles";

type NonMatchScreenProps = {
  screen: AppScreen;
  selectedPlaymatImage: string | null;
  uiTextTone: "light" | "dark";
  screenFadeOverlayOpacity: number;
  equippedDeck: PremadeDeck;
  customisation: CustomisationSettings;
  navigateToScreen: (screen: AppScreen) => void;
  setEquippedDeckId: (deckId: string) => void;
  setCustomisation: (settings: CustomisationSettings) => void;
  startWithMode: (mode: MatchMode) => void;
  playEquippedDeck: () => void;
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
  const {
    screen,
    selectedPlaymatImage,
    uiTextTone,
    screenFadeOverlayOpacity,
    equippedDeck,
    customisation,
    navigateToScreen,
    setEquippedDeckId,
    setCustomisation,
    startWithMode,
    playEquippedDeck,
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
          onPlay={playEquippedDeck}
          onOpenDecks={() => navigateToScreen("decks")}
          onOpenCards={() => navigateToScreen("cards")}
          onOpenCustomisation={() => navigateToScreen("customisation")}
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
          decks={premadeDecks}
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
