import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { InspectTarget } from "../../inspect";
import type { AppScreen, PendingSelection } from "../../types/ui";

type UseEscapeHotkeyArgs = {
  screen: AppScreen;
  gameOver: boolean;
  hasPendingPlayerChoice: boolean;
  isTurnFlowBlocked: boolean;
  endTurnWarningActions: string[] | null;
  previewTarget: InspectTarget | null;
  discardOpen: boolean;
  pendingSelection: PendingSelection | null;
  actionNotice: string | null;
  menuOpen: boolean;
  navigateToScreen: (nextScreen: AppScreen) => void;
  onEscapeFromPvpLobby: () => void;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setDiscardOpen: Dispatch<SetStateAction<boolean>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  isBottomActionNotice: (notice: string) => boolean;
};

export function useEscapeHotkey({
  screen,
  gameOver,
  hasPendingPlayerChoice,
  isTurnFlowBlocked,
  endTurnWarningActions,
  previewTarget,
  discardOpen,
  pendingSelection,
  actionNotice,
  menuOpen,
  navigateToScreen,
  onEscapeFromPvpLobby,
  setEndTurnWarningActions,
  setPreviewTarget,
  setDiscardOpen,
  setPendingSelection,
  setActionNotice,
  setMenuOpen,
  isBottomActionNotice,
}: UseEscapeHotkeyArgs): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (screen === "pvpLobby") {
        event.preventDefault();
        onEscapeFromPvpLobby();
        return;
      }
      if (screen === "decks" || screen === "customisation" || screen === "modeSelect") {
        event.preventDefault();
        navigateToScreen("mainMenu");
        return;
      }
      if (screen !== "match" || gameOver) return;

      event.preventDefault();
      if (isTurnFlowBlocked) return;
      if (endTurnWarningActions) {
        setEndTurnWarningActions(null);
        return;
      }
      if (previewTarget) {
        setPreviewTarget(null);
        return;
      }
      if (discardOpen) {
        setDiscardOpen(false);
        return;
      }
      if (pendingSelection?.kind === "discardForScout") {
        setPendingSelection(null);
        return;
      }
      if (pendingSelection?.kind === "deckForScout") {
        setPendingSelection({ kind: "discardForScout", handIndex: pendingSelection.handIndex });
        return;
      }
      if (actionNotice && isBottomActionNotice(actionNotice)) {
        setActionNotice(null);
        return;
      }
      if (pendingSelection && !hasPendingPlayerChoice) {
        setPendingSelection(null);
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      setMenuOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    screen,
    gameOver,
    hasPendingPlayerChoice,
    isTurnFlowBlocked,
    endTurnWarningActions,
    previewTarget,
    discardOpen,
    pendingSelection,
    actionNotice,
    menuOpen,
    navigateToScreen,
    onEscapeFromPvpLobby,
    setEndTurnWarningActions,
    setPreviewTarget,
    setDiscardOpen,
    setPendingSelection,
    setActionNotice,
    setMenuOpen,
    isBottomActionNotice,
  ]);
}
