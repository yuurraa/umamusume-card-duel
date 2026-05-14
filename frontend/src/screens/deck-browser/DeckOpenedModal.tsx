import type { EnergyType } from "../../../../shared/src/types";
import type { DeckEntity } from "./helpers";
import { DECK_CARD_COUNT, buildDeckJson, getDeckSelectedEnergyTypes, toEditableDeckSlots } from "./helpers";
import { DeckListModal } from "./components";
import { getEditDraftKeyForDeck, getEditedPremadeDeckId } from "./model";

type DeckOpenedModalProps = Record<string, any>;

export function DeckOpenedModal({
  openedDeck,
  openedDeckDraft,
  openedDeckHasDraft,
  equippedDeckId,
  customDecksEnabled,
  editDraftByDeckId,
  onEquipDeck,
  setOpenedDeckRef,
  setJsonModalDeckRef,
  setJsonModalMode,
  setJsonModalError,
  setJsonModalText,
  setCreateName,
  setCreateCardIds,
  setCreateError,
  setPickerSlotIndex,
  setEditingDeckId,
  setEditingPremadeDeckId,
  setEditingCreateDraftId,
  setPendingValidatedDeck,
  setPendingEnergySelectionDeck,
  setEnergySelectionError,
  setSelectedCoverCardId,
  setSelectedEnergyTypes,
  setShowImportOverwriteConfirm,
  setShowClearAllConfirm,
  setShowUnsavedChangesConfirm,
  setEditorBaseline,
  setIsCreateOpen,
  setDeleteDeckRef,
  setDeckListInspectActive,
}: DeckOpenedModalProps) {
  if (!openedDeck) return null;
  return (
    <DeckListModal
      deck={openedDeck as DeckEntity}
      equipped={openedDeck.id === equippedDeckId}
      canEquip
      equipDisabled={openedDeck.source === "draft" || openedDeckHasDraft}
      canExport={!openedDeckHasDraft}
      canEdit={customDecksEnabled}
      {...(openedDeckDraft
        ? {
          displayCardIds: openedDeckDraft.cardIds,
          cardCountText: `${openedDeckDraft.cardIds.filter((cardId: string | null) => Boolean(cardId)).length}/${DECK_CARD_COUNT} cards`,
        }
        : {})}
      deckLabel={openedDeck.source === "premade" ? "Premade Deck" : openedDeck.source === "premadeEdited" ? "Premade Deck (Edited)" : openedDeckHasDraft ? "Draft Deck" : "Created Deck"}
      onClose={() => setOpenedDeckRef(null)}
      onExport={() => {
        if (openedDeckHasDraft) return;
        setJsonModalDeckRef({ id: openedDeck.id, source: openedDeck.source });
        setJsonModalMode("export");
        setJsonModalError(null);
        setJsonModalText(buildDeckJson(openedDeck));
      }}
      onImport={() => {
        if (openedDeck.source !== "local") return;
        setJsonModalDeckRef({ id: openedDeck.id, source: openedDeck.source });
        setJsonModalMode("import");
        setJsonModalError(null);
        setJsonModalText("");
      }}
      onEdit={() => {
        const draft = editDraftByDeckId[getEditDraftKeyForDeck(openedDeck)];
        const draftName = draft?.name ?? openedDeck.name;
        const draftCardIds = draft?.cardIds ?? toEditableDeckSlots(openedDeck.cardIds);
        const draftCover = draft?.selectedCoverCardId ?? openedDeck.coverCardId;
        const draftEnergyTypes: EnergyType[] = draft?.energyTypes ?? getDeckSelectedEnergyTypes(openedDeck);
        setCreateName(draftName);
        setCreateCardIds([...draftCardIds]);
        setCreateError(null);
        setPickerSlotIndex(null);
        setEditingDeckId(openedDeck.source === "local" || openedDeck.source === "premadeEdited" ? openedDeck.id : null);
        setEditingPremadeDeckId(openedDeck.source === "premade" ? openedDeck.id : null);
        setEditingCreateDraftId(openedDeck.source === "draft" ? openedDeck.id : null);
        setPendingValidatedDeck(null);
        setPendingEnergySelectionDeck(null);
        setEnergySelectionError(null);
        setSelectedCoverCardId(draftCover);
        setSelectedEnergyTypes(draftEnergyTypes);
        setShowImportOverwriteConfirm(false);
        setShowClearAllConfirm(false);
        setShowUnsavedChangesConfirm(null);
        setEditorBaseline({
          name: draftName,
          cardIds: [...draftCardIds],
          selectedCoverCardId: draftCover,
          energyTypes: draftEnergyTypes,
        });
        setOpenedDeckRef(null);
        setIsCreateOpen(true);
      }}
      onEquip={() => {
        if (openedDeckHasDraft) return;
        onEquipDeck(openedDeck.id);
        setOpenedDeckRef(null);
      }}
      onDelete={() => setDeleteDeckRef({ id: openedDeck.id, source: openedDeck.source })}
      canDelete={customDecksEnabled}
      canImport={customDecksEnabled && openedDeck.source === "local"}
      onInspectActiveChange={setDeckListInspectActive}
    />
  );
}
