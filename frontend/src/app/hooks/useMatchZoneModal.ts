import { useCallback, useState } from "react";
import type { SideId } from "../../../../shared/src/types";

export type PileModalState =
  | { kind: "discard"; side: SideId }
  | { kind: "revealedOpponentHand"; cardIds: string[] }
  | null;

/** Owns mutually exclusive pile/zone modals so a reset cannot retain one. */
export function useMatchZoneModal() {
  const [pileModal, setPileModal] = useState<PileModalState>(null);
  const [opponentZonesOpen, setOpponentZonesOpen] = useState(false);

  const openDiscard = useCallback((side: SideId) => {
    setOpponentZonesOpen(false);
    setPileModal({ kind: "discard", side });
  }, []);
  const openRevealedOpponentHand = useCallback((cardIds: string[]) => {
    setOpponentZonesOpen(false);
    setPileModal({ kind: "revealedOpponentHand", cardIds });
  }, []);
  const closePile = useCallback(() => setPileModal(null), []);
  const openOpponentZones = useCallback(() => {
    setPileModal(null);
    setOpponentZonesOpen(true);
  }, []);
  const closeOpponentZones = useCallback(() => setOpponentZonesOpen(false), []);
  const resetZoneModals = useCallback(() => {
    setPileModal(null);
    setOpponentZonesOpen(false);
  }, []);

  return {
    pileModal,
    opponentZonesOpen,
    openDiscard,
    openRevealedOpponentHand,
    closePile,
    openOpponentZones,
    closeOpponentZones,
    resetZoneModals,
  };
}
