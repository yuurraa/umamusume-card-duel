import { useEffect, useMemo, useState } from "react";
import { createDeckIdFromName, LOCAL_DECK_FORMAT_VERSION, type LocalDeck } from "../../../shared/src/localDecks";
import type { EnergyType } from "../../../shared/src/types";
import { getCard } from "../game/engine";
import { NeutralButton } from "../components/buttons/NeutralButton";
import type { PremadeDeck } from "../types/ui";
import { getDeckEnergyTypes, readHiddenPremadeDeckIds, writeHiddenPremadeDeckIds } from "../utils/deck";
import { deleteLocalDeck, importLocalDeck, listCloudDeckDrafts, listLocalDecks, saveCloudDeckDrafts, saveLocalDeck } from "../utils/localDeckApi";
import {
  DeckClearAllConfirmModal,
  CreateDeckModal,
  DeckImportOverwriteConfirmModal,
  DeckUnsavedChangesModal,
  DeckCardSelectorModal,
  DeckDeleteConfirmModal,
  DeckEnergySelectionModal,
  DeckJsonModal,
  DeckSummaryCard,
} from "./deck-browser/components";
import {
  DECK_CARD_COUNT,
  getDuplicateOverflowCardName,
  getSearchText,
  parseDeckJson,
  sortDeckCardIds,
  toggleSetValue,
  toEditableDeckSlots,
  writeLocalDeckCache,
} from "./deck-browser/helpers";
import {
  deckBrowserBackButtonStyle,
  deckBrowserHeaderStyle,
  deckBrowserShellStyle,
  deckBrowserSubtitleStyle,
  deckBrowserTitleStyle,
  localDeckPersistenceNoticeStyle,
  menuKickerStyle,
} from "./deck-browser/styles";
import { DeckBrowserFilters } from "./deck-browser/DeckBrowserFilters";
import { DeckBrowserDeckGrid } from "./deck-browser/DeckBrowserDeckGrid";
import { DeckOpenedModal } from "./deck-browser/DeckOpenedModal";
import {
  buildCreateDraftDeckId,
  getDeckSearchText,
  getEditDraftKeyForDeck,
  getEditedPremadeDeckId,
  getPremadeDeckIdFromEditedDeckId,
  isEditedPremadeDeckId,
  normalizeDeckNameForCompare,
  normalizeEditDraftEnergyTypes,
  readCreateDraftDecks,
  readEditDeckDrafts,
  readFavoriteDeckKeys,
  resolveDraftCoverCardId,
  sameEnergyTypes,
  sortDeckBrowserDecks,
  toDeckFavoriteKey,
  writeCreateDraftDecks,
  writeEditDeckDrafts,
  writeFavoriteDeckKeys,
  type DeckEditorDraft,
  type DeckEditorSnapshot,
  type DeckListFilter,
  type DeckListSortKey,
  type DeckRef,
} from "./deck-browser/model";
export { DeckSummaryCard } from "./deck-browser/components";
export function DeckBrowserScreen({
  decks,
  equippedDeckId,
  onEquipDeck,
  onBack,
}: {
  decks: PremadeDeck[];
  equippedDeckId: string;
  onEquipDeck: (deckId: string) => void;
  onBack: () => void;
}) {
  const customDecksEnabled = true;
  const [openedDeckRef, setOpenedDeckRef] = useState<DeckRef | null>(null);
  const [deckListInspectActive, setDeckListInspectActive] = useState(false);
  const [coverInspectActive, setCoverInspectActive] = useState(false);
  const [localDecks, setLocalDecks] = useState<LocalDeck[]>([]);
  const [, setLocalDeckError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("New Deck");
  const [createCardIds, setCreateCardIds] = useState<Array<string | null>>(() => Array.from({ length: DECK_CARD_COUNT }, () => null));
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  const [pickerInspectActive, setPickerInspectActive] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSavingCreateDeck, setIsSavingCreateDeck] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editingPremadeDeckId, setEditingPremadeDeckId] = useState<string | null>(null);
  const [editingCreateDraftId, setEditingCreateDraftId] = useState<string | null>(null);
  const [jsonModalMode, setJsonModalMode] = useState<"export" | "import" | null>(null);
  const [jsonModalDeckRef, setJsonModalDeckRef] = useState<DeckRef | null>(null);
  const [jsonModalText, setJsonModalText] = useState("");
  const [jsonModalError, setJsonModalError] = useState<string | null>(null);
  const [jsonModalBusy] = useState(false);
  const [deleteDeckRef, setDeleteDeckRef] = useState<DeckRef | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [createDraftDecks, setCreateDraftDecks] = useState<LocalDeck[]>(() => readCreateDraftDecks());
  const [editDraftByDeckId, setEditDraftByDeckId] = useState<Record<string, DeckEditorDraft>>(() => readEditDeckDrafts());
  const [cloudDraftsLoaded, setCloudDraftsLoaded] = useState(false);
  const [showImportOverwriteConfirm, setShowImportOverwriteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showUnsavedChangesConfirm, setShowUnsavedChangesConfirm] = useState<"create" | "edit" | null>(null);
  const [pendingValidatedDeck, setPendingValidatedDeck] = useState<{
    name: string;
    cardIds: string[];
    deckId: string | null;
    energyTypes: EnergyType[];
  } | null>(null);
  const [pendingEnergySelectionDeck, setPendingEnergySelectionDeck] = useState<{
    name: string;
    cardIds: string[];
    deckId: string | null;
    initialCoverCardId: string;
  } | null>(null);
  const [energySelectionError, setEnergySelectionError] = useState<string | null>(null);
  const [selectedCoverCardId, setSelectedCoverCardId] = useState<string | null>(null);
  const [selectedEnergyTypes, setSelectedEnergyTypes] = useState<EnergyType[]>(["psychic"]);
  const [editorBaseline, setEditorBaseline] = useState<DeckEditorSnapshot | null>(null);
  const [hiddenPremadeDeckIds, setHiddenPremadeDeckIds] = useState<Set<string>>(() => readHiddenPremadeDeckIds());
  const [favoriteDeckKeys, setFavoriteDeckKeys] = useState<Set<string>>(() => readFavoriteDeckKeys());
  const [deckQuery, setDeckQuery] = useState("");
  const [deckFilter, setDeckFilter] = useState<DeckListFilter | null>(null);
  const [deckSortKey, setDeckSortKey] = useState<DeckListSortKey>("recommended");
  const [deckSortDirection, setDeckSortDirection] = useState<"asc" | "desc">("asc");
  const [deckFiltersOpen, setDeckFiltersOpen] = useState(false);
  const [deckEnergyFiltersSelected, setDeckEnergyFiltersSelected] = useState<Set<EnergyType>>(new Set());
  const allDecks = useMemo(
    () => [
      ...decks.filter((deck) => !hiddenPremadeDeckIds.has(deck.id)).map((deck) => {
        const editedDeck = localDecks.find((localDeck) => localDeck.id === getEditedPremadeDeckId(deck.id));
        return editedDeck
          ? { ...editedDeck, name: deck.name, source: "premadeEdited" as const }
          : { ...deck, source: "premade" as const };
      }),
      ...(customDecksEnabled ? localDecks
        .filter((deck) => !isEditedPremadeDeckId(deck.id, decks))
        .map((deck) => ({ ...deck, source: "local" as const })) : []),
      ...(customDecksEnabled ? createDraftDecks.map((deck) => ({ ...deck, source: "draft" as const })) : []),
    ],
    [createDraftDecks, customDecksEnabled, decks, hiddenPremadeDeckIds, localDecks],
  );
  const normalizedDeckQuery = deckQuery.trim().toLowerCase();
  const activeDeckFilterCount = (deckFilter ? 1 : 0) + deckEnergyFiltersSelected.size;
  const visibleDecks = useMemo(
    () => sortDeckBrowserDecks(
      allDecks.filter((deck) => {
        const favorite = favoriteDeckKeys.has(toDeckFavoriteKey(deck));
        if (deckFilter === "favorites" && !favorite) return false;
        if (deckFilter === "premade" && deck.source !== "premade" && deck.source !== "premadeEdited") return false;
        if (deckFilter === "created" && deck.source !== "local") return false;
        if (deckFilter === "drafts" && deck.source !== "draft") return false;
        if (deckEnergyFiltersSelected.size > 0 && !getDeckEnergyTypes(deck).some((type) => deckEnergyFiltersSelected.has(type))) return false;
        if (normalizedDeckQuery && !getDeckSearchText(deck).includes(normalizedDeckQuery)) return false;
        return true;
      }),
      favoriteDeckKeys,
      deckSortKey,
      deckSortDirection,
    ),
    [allDecks, deckEnergyFiltersSelected, deckFilter, deckSortDirection, deckSortKey, favoriteDeckKeys, normalizedDeckQuery],
  );
  const openedDeck = openedDeckRef
    ? allDecks.find((deck) => deck.id === openedDeckRef.id && deck.source === openedDeckRef.source) ?? null
    : null;
  const jsonModalDeck = jsonModalDeckRef
    ? allDecks.find((deck) => deck.id === jsonModalDeckRef.id && deck.source === jsonModalDeckRef.source) ?? null
    : null;
  const isCreateImportTarget = jsonModalDeckRef?.id === "__create__";
  const deleteDeck = deleteDeckRef
    ? allDecks.find((deck) => deck.id === deleteDeckRef.id && deck.source === deleteDeckRef.source) ?? null
    : null;
  const openedDeckHasDraft = Boolean(
    openedDeck
    && (openedDeck.source === "draft" || editDraftByDeckId[getEditDraftKeyForDeck(openedDeck)]),
  );
  const openedDeckDraft = openedDeck ? editDraftByDeckId[getEditDraftKeyForDeck(openedDeck)] : undefined;
  useEffect(() => {
    writeCreateDraftDecks(createDraftDecks);
    if (!cloudDraftsLoaded) return;
    void saveCloudDeckDrafts(createDraftDecks, editDraftByDeckId).catch((error) => {
      setLocalDeckError(error instanceof Error ? error.message : "Failed to save deck drafts.");
    });
  }, [cloudDraftsLoaded, createDraftDecks, editDraftByDeckId]);
  useEffect(() => {
    writeEditDeckDrafts(editDraftByDeckId);
  }, [editDraftByDeckId]);
  useEffect(() => {
    writeHiddenPremadeDeckIds(hiddenPremadeDeckIds);
  }, [hiddenPremadeDeckIds]);
  useEffect(() => {
    writeFavoriteDeckKeys(favoriteDeckKeys);
  }, [favoriteDeckKeys]);
  const setEditDraft = (deckId: string, draft: DeckEditorDraft) => {
    setEditDraftByDeckId((current) => ({ ...current, [deckId]: draft }));
  };
  const persistDrafts = async (nextCreateDrafts = createDraftDecks, nextEditDrafts = editDraftByDeckId): Promise<void> => {
    writeCreateDraftDecks(nextCreateDrafts);
    writeEditDeckDrafts(nextEditDrafts);
    if (!cloudDraftsLoaded) return;
    await saveCloudDeckDrafts(nextCreateDrafts, nextEditDrafts);
  };
  const clearEditDraft = (deckId: string) => {
    setEditDraftByDeckId((current) => {
      if (!(deckId in current)) return current;
      const next = { ...current };
      delete next[deckId];
      return next;
    });
  };
  const hasUnsavedEditorChanges = (): boolean => {
    if (pendingValidatedDeck || pendingEnergySelectionDeck) return true;
    if (!editorBaseline) return false;
    if (editorBaseline.name !== createName) return true;
    if (editorBaseline.selectedCoverCardId !== selectedCoverCardId) return true;
    if (!sameEnergyTypes(editorBaseline.energyTypes, selectedEnergyTypes)) return true;
    if (editorBaseline.cardIds.length !== createCardIds.length) return true;
    for (let index = 0; index < editorBaseline.cardIds.length; index += 1) {
      if (editorBaseline.cardIds[index] !== createCardIds[index]) return true;
    }
    return false;
  };
  const validateDeckNameAvailability = (name: string, currentDeckId: string | null = null): string | null => {
    const nextDeckId = createDeckIdFromName(name);
    const normalizedName = normalizeDeckNameForCompare(name);
    const currentId = currentDeckId ?? "";
    for (const deck of [...decks, ...localDecks, ...createDraftDecks]) {
      if (deck.id === currentId) continue;
      if (deck.id === nextDeckId || normalizeDeckNameForCompare(deck.name) === normalizedName) {
        return `A deck named ${deck.name} already exists.`;
      }
    }
    if (Object.keys(editDraftByDeckId).some((deckId) => deckId !== currentId && deckId === nextDeckId)) {
      return "A draft with this deck name already exists.";
    }
    return null;
  };
  const closeCreateEditorImmediately = () => {
    setPickerSlotIndex(null);
    setEditingDeckId(null);
    setEditingPremadeDeckId(null);
    setEditingCreateDraftId(null);
    setPendingValidatedDeck(null);
    setPendingEnergySelectionDeck(null);
    setEnergySelectionError(null);
    setSelectedCoverCardId(null);
    setSelectedEnergyTypes(["psychic"]);
    setShowImportOverwriteConfirm(false);
    setShowClearAllConfirm(false);
    setShowUnsavedChangesConfirm(null);
    setEditorBaseline(null);
    setIsCreateOpen(false);
  };
  const requestCloseCreateEditor = () => {
    if (hasUnsavedEditorChanges()) {
      setShowUnsavedChangesConfirm(editingDeckId || editingPremadeDeckId || editingCreateDraftId ? "edit" : "create");
      return;
    }
    closeCreateEditorImmediately();
  };
  useEffect(() => {
    if (!customDecksEnabled) {
      setLocalDecks([]);
      setCreateDraftDecks([]);
      setEditDraftByDeckId({});
      setCloudDraftsLoaded(true);
      setLocalDeckError(null);
      return;
    }
    let active = true;
    Promise.all([listLocalDecks(), listCloudDeckDrafts()])
      .then(([nextDecks, nextDrafts]) => {
        if (!active) return;
        setLocalDecks(nextDecks);
        writeLocalDeckCache(nextDecks);
        setCreateDraftDecks(nextDrafts.createDrafts);
        setEditDraftByDeckId(normalizeEditDraftEnergyTypes(nextDrafts.editDrafts));
        setCloudDraftsLoaded(true);
        setLocalDeckError(null);
      })
      .catch((error) => {
        if (!active) return;
        setCloudDraftsLoaded(true);
        setLocalDeckError(error instanceof Error ? error.message : "Failed to load created decks.");
      });
    return () => {
      active = false;
    };
  }, [customDecksEnabled]);
  useEffect(() => {
    const onDeckEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        !deckListInspectActive
        && pickerSlotIndex === null
        && !jsonModalMode
        && !deleteDeckRef
        && !showImportOverwriteConfirm
        && !showClearAllConfirm
        && !showUnsavedChangesConfirm
        && !pendingEnergySelectionDeck
        && !isCreateOpen
        && !openedDeckRef
      ) return;
      if (coverInspectActive) {
        return;
      }
      if (pickerInspectActive) {
        return;
      }
      if (deckListInspectActive) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (jsonModalMode) {
        setJsonModalMode(null);
        return;
      }
      if (showImportOverwriteConfirm) {
        setShowImportOverwriteConfirm(false);
        return;
      }
      if (showClearAllConfirm) {
        setShowClearAllConfirm(false);
        return;
      }
      if (showUnsavedChangesConfirm) {
        setShowUnsavedChangesConfirm(null);
        return;
      }
      if (deleteDeckRef) {
        setDeleteDeckRef(null);
        return;
      }
      if (pickerSlotIndex !== null) {
        setPickerSlotIndex(null);
        return;
      }
      if (pendingEnergySelectionDeck) {
        setEnergySelectionError(null);
        setPendingEnergySelectionDeck(null);
        return;
      }
      if (isCreateOpen) {
        requestCloseCreateEditor();
        return;
      }
      setOpenedDeckRef(null);
    };

    window.addEventListener("keydown", onDeckEscape, { capture: true });
    return () => window.removeEventListener("keydown", onDeckEscape, { capture: true });
  }, [coverInspectActive, deckListInspectActive, deleteDeckRef, openedDeckRef, isCreateOpen, jsonModalMode, pendingEnergySelectionDeck, pickerInspectActive, pickerSlotIndex, requestCloseCreateEditor, showClearAllConfirm, showImportOverwriteConfirm, showUnsavedChangesConfirm]);

  useEffect(() => {
    if (pickerSlotIndex === null) {
      setPickerInspectActive(false);
    }
  }, [pickerSlotIndex]);

  useEffect(() => {
    if (!isCreateOpen) {
      setCreateError(null);
      setEditingDeckId(null);
      setEditingPremadeDeckId(null);
      setEditingCreateDraftId(null);
      setPendingValidatedDeck(null);
      setPendingEnergySelectionDeck(null);
      setEnergySelectionError(null);
      setSelectedCoverCardId(null);
      setSelectedEnergyTypes(["psychic"]);
      setShowImportOverwriteConfirm(false);
      setShowClearAllConfirm(false);
      setShowUnsavedChangesConfirm(null);
      setEditorBaseline(null);
    }
  }, [isCreateOpen]);

  const refreshLocalDecks = async () => {
    if (!customDecksEnabled) {
      setLocalDecks([]);
      writeLocalDeckCache([]);
      return;
    }
    const nextDecks = await listLocalDecks();
    setLocalDecks(nextDecks);
    writeLocalDeckCache(nextDecks);
  };
  const openImportDeckJsonModal = () => {
    if (editingDeckId) {
      setJsonModalDeckRef({ id: editingDeckId, source: "local" });
    } else {
      setJsonModalDeckRef({ id: "__create__", source: "premade" });
    }
    setJsonModalMode("import");
    setJsonModalError(null);
    setJsonModalText("");
    setPendingValidatedDeck(null);
    setPendingEnergySelectionDeck(null);
    setEnergySelectionError(null);
    setShowImportOverwriteConfirm(false);
    setShowClearAllConfirm(false);
    setShowUnsavedChangesConfirm(null);
  };
  return (
    <section style={deckBrowserShellStyle}>
      <div style={deckBrowserHeaderStyle}>
        <div>
          <div style={menuKickerStyle}>Decks</div>
          <h1 style={deckBrowserTitleStyle}>Choose your deck</h1>
          <p style={deckBrowserSubtitleStyle}>Select a deck and equip it for the next match.</p>
        </div>
        <NeutralButton
          style={deckBrowserBackButtonStyle}
          onClick={() => {
            setShowImportOverwriteConfirm(false);
            setShowClearAllConfirm(false);
            setShowUnsavedChangesConfirm(null);
            onBack();
          }}
        >
          Back
        </NeutralButton>
      </div>
      {/* <div style={localDeckPersistenceNoticeStyle}>
Created decks are saved to cloud storage for this test profile. Export still gives you a portable JSON backup.
      </div> */}
      <DeckBrowserFilters
        deckQuery={deckQuery}
        setDeckQuery={setDeckQuery}
        deckSortKey={deckSortKey}
        setDeckSortKey={setDeckSortKey}
        deckSortDirection={deckSortDirection}
        setDeckSortDirection={setDeckSortDirection}
        deckFiltersOpen={deckFiltersOpen}
        setDeckFiltersOpen={setDeckFiltersOpen}
        activeDeckFilterCount={activeDeckFilterCount}
        deckFilter={deckFilter}
        setDeckFilter={setDeckFilter}
        deckEnergyFiltersSelected={deckEnergyFiltersSelected}
        setDeckEnergyFiltersSelected={setDeckEnergyFiltersSelected}
      />
      <DeckBrowserDeckGrid
        visibleDecks={visibleDecks}
        equippedDeckId={equippedDeckId}
        editDraftByDeckId={editDraftByDeckId}
        favoriteDeckKeys={favoriteDeckKeys}
        setFavoriteDeckKeys={setFavoriteDeckKeys}
        setOpenedDeckRef={setOpenedDeckRef}
        customDecksEnabled={customDecksEnabled}
        onCreate={(blankCardIds: Array<string | null>) => {
          setCreateName("New Deck");
          setCreateCardIds(blankCardIds);
          setCreateError(null);
          setPickerSlotIndex(null);
          setEditingDeckId(null);
          setEditingCreateDraftId(null);
          setPendingValidatedDeck(null);
          setPendingEnergySelectionDeck(null);
          setEnergySelectionError(null);
          setSelectedCoverCardId(null);
          setSelectedEnergyTypes(["psychic"]);
          setShowImportOverwriteConfirm(false);
          setShowClearAllConfirm(false);
          setShowUnsavedChangesConfirm(null);
          setEditorBaseline({
            name: "New Deck",
            cardIds: blankCardIds,
            selectedCoverCardId: null,
            energyTypes: ["psychic"],
          });
          setIsCreateOpen(true);
        }}
      />
      <DeckOpenedModal {...{
        openedDeck, openedDeckDraft, openedDeckHasDraft, equippedDeckId, customDecksEnabled, editDraftByDeckId, onEquipDeck,
        setOpenedDeckRef, setJsonModalDeckRef, setJsonModalMode, setJsonModalError, setJsonModalText,
        setCreateName, setCreateCardIds, setCreateError, setPickerSlotIndex, setEditingDeckId, setEditingPremadeDeckId, setEditingCreateDraftId,
        setPendingValidatedDeck, setPendingEnergySelectionDeck, setEnergySelectionError, setSelectedCoverCardId, setSelectedEnergyTypes,
        setShowImportOverwriteConfirm, setShowClearAllConfirm, setShowUnsavedChangesConfirm, setEditorBaseline, setIsCreateOpen, setDeleteDeckRef, setDeckListInspectActive,
      }} />
      {customDecksEnabled && isCreateOpen && (
        <CreateDeckModal
          title={editingDeckId || editingPremadeDeckId || editingCreateDraftId ? "Edit Deck" : "Create Deck"}
          name={createName}
          cardIds={createCardIds}
          canRemoveCards={Boolean(editingDeckId || editingPremadeDeckId || editingCreateDraftId) && !pendingValidatedDeck}
          canManageDeck={Boolean(editingDeckId || editingPremadeDeckId || editingCreateDraftId)}
          canImportDeck
          selectingCoverCard={Boolean(pendingValidatedDeck)}
          selectedCoverCardId={selectedCoverCardId}
          infoNotice={pendingValidatedDeck ? "Validation successful. Select a card from your deck as the cover, then press Save Deck." : null}
          saving={isSavingCreateDeck}
          error={createError}
          onClearError={() => setCreateError(null)}
          onClose={requestCloseCreateEditor}
          onNameChange={(nextName) => {
            setCreateName(nextName);
            setCreateError(null);
            setPendingValidatedDeck(null);
            setPendingEnergySelectionDeck(null);
            setEnergySelectionError(null);
          }}
          onEditFilledSlot={(slotIndex) => {
            setCreateCardIds((current) => {
              const next = [...current];
              next[slotIndex] = null;
              return next;
            });
            setCreateError(null);
            setPendingValidatedDeck(null);
            setPendingEnergySelectionDeck(null);
            setEnergySelectionError(null);
            setPickerSlotIndex(slotIndex);
          }}
          onSelectCoverCard={(cardId) => {
            setSelectedCoverCardId(cardId);
          }}
          onImportDeck={() => {
            if (createCardIds.some((cardId) => Boolean(cardId))) {
              setShowImportOverwriteConfirm(true);
              return;
            }
            openImportDeckJsonModal();
          }}
          onClearAll={() => setShowClearAllConfirm(true)}
          canClearAll={createCardIds.some((cardId) => Boolean(cardId))}
          onDeleteDeck={() => {
            if (editingDeckId) {
              setDeleteDeckRef({ id: editingDeckId, source: "local" });
              return;
            }
            if (editingPremadeDeckId) {
              setDeleteDeckRef({ id: editingPremadeDeckId, source: "premade" });
              return;
            }
            if (editingCreateDraftId) {
              setDeleteDeckRef({ id: editingCreateDraftId, source: "draft" });
            }
          }}
          onPickSlot={(slotIndex) => {
            setPendingValidatedDeck(null);
            setPendingEnergySelectionDeck(null);
            setEnergySelectionError(null);
            setPickerSlotIndex(slotIndex);
          }}
          onValidate={async () => {
            if (isSavingCreateDeck) return;
            if (pendingValidatedDeck) {
              const currentEditorDeckId = pendingValidatedDeck.deckId ?? (editingPremadeDeckId ? getEditedPremadeDeckId(editingPremadeDeckId) : editingCreateDraftId);
              const deckNameError = validateDeckNameAvailability(pendingValidatedDeck.name, currentEditorDeckId);
              if (deckNameError) {
                setCreateError(deckNameError);
                return;
              }
              const coverCardId = selectedCoverCardId ?? pendingValidatedDeck.cardIds[0];
              if (!coverCardId) {
                setCreateError("Select a cover card before saving.");
                return;
              }
              setIsSavingCreateDeck(true);
              setCreateError(null);
              try {
                const sortedCardIds = sortDeckCardIds(pendingValidatedDeck.cardIds);
                const payload = {
                  name: pendingValidatedDeck.name,
                  cardIds: sortedCardIds,
                  coverCardId,
                  energyTypes: pendingValidatedDeck.energyTypes,
                };
                const deckIdToSave = pendingValidatedDeck.deckId ?? (editingPremadeDeckId ? getEditedPremadeDeckId(editingPremadeDeckId) : null);
                const deck = deckIdToSave
                  ? await saveLocalDeck(deckIdToSave, payload)
                  : await importLocalDeck(payload);
                await refreshLocalDecks();
                setPendingValidatedDeck(null);
                setSelectedCoverCardId(null);
                if (!deckIdToSave) {
                  if (editingCreateDraftId) {
                    const nextCreateDrafts = createDraftDecks.filter((draftDeck) => draftDeck.id !== editingCreateDraftId);
                    const nextEditDrafts = { ...editDraftByDeckId };
                    delete nextEditDrafts[editingCreateDraftId];
                    setCreateDraftDecks(nextCreateDrafts);
                    setEditDraftByDeckId(nextEditDrafts);
                    await persistDrafts(nextCreateDrafts, nextEditDrafts);
                  }
                } else {
                  const nextEditDrafts = { ...editDraftByDeckId };
                  delete nextEditDrafts[deckIdToSave];
                  setEditDraftByDeckId(nextEditDrafts);
                  await persistDrafts(createDraftDecks, nextEditDrafts);
                }
                setIsCreateOpen(false);
                setOpenedDeckRef({ id: deck.id, source: "local" });
              } catch (error) {
                setCreateError(error instanceof Error ? error.message : "Failed to save deck.");
              } finally {
                setIsSavingCreateDeck(false);
              }
              return;
            }
            const resolvedCardIds = createCardIds.filter((cardId): cardId is string => Boolean(cardId));
            if (resolvedCardIds.length !== DECK_CARD_COUNT) {
              setCreateError(`Deck must contain exactly ${DECK_CARD_COUNT} cards.`);
              return;
            }
            if (createName.trim().length === 0) {
              setCreateError("Deck name is required.");
              return;
            }
            if (selectedEnergyTypes.length < 1 || selectedEnergyTypes.length > 3) {
              setCreateError("Select 1 to 3 Energy types.");
              return;
            }
            const resolvedDeckName = createName.trim();
            const currentEditorDeckId = editingDeckId ?? (editingPremadeDeckId ? getEditedPremadeDeckId(editingPremadeDeckId) : editingCreateDraftId);
            const deckNameError = validateDeckNameAvailability(resolvedDeckName, currentEditorDeckId);
            if (deckNameError) {
              setCreateError(deckNameError);
              return;
            }
            setCreateError(null);
            try {
              if (!resolvedCardIds.some((cardId) => {
                const card = getCard(cardId);
                return card.kind === "umamusume" && card.stage === 0;
              })) {
                setCreateError("Deck must contain at least 1 Basic Umamusume.");
                return;
              }
              const duplicateCardName = getDuplicateOverflowCardName(resolvedCardIds);
              if (duplicateCardName) {
                setCreateError(`Deck cannot contain more than 2 copies of ${duplicateCardName}.`);
                return;
              }
              const existingCoverCardId = selectedCoverCardId && resolvedCardIds.includes(selectedCoverCardId)
                ? selectedCoverCardId
                : null;
              const initialCoverCardId = existingCoverCardId ?? resolvedCardIds[0];
              if (!initialCoverCardId) {
                setCreateError("Deck must contain at least 1 card.");
                return;
              }
              setPendingEnergySelectionDeck({
                name: resolvedDeckName,
                cardIds: resolvedCardIds,
                deckId: editingDeckId ?? (editingPremadeDeckId ? getEditedPremadeDeckId(editingPremadeDeckId) : null),
                initialCoverCardId,
              });
            } catch (error) {
              setCreateError(error instanceof Error ? error.message : "Failed to save deck.");
            }
          }}
          onCoverInspectActiveChange={setCoverInspectActive}
        />
      )}
      {customDecksEnabled && pendingEnergySelectionDeck && (
        <DeckEnergySelectionModal
          selectedEnergyTypes={selectedEnergyTypes}
          error={energySelectionError}
          onToggleEnergyType={(energyType) => {
            setSelectedEnergyTypes((current) => {
              if (current.includes(energyType)) return current.filter((type) => type !== energyType);
              if (current.length >= 3) return current;
              return [...current, energyType];
            });
            setEnergySelectionError(null);
          }}
          onClearError={() => setEnergySelectionError(null)}
          onClose={() => {
            setEnergySelectionError(null);
            setPendingEnergySelectionDeck(null);
          }}
          onConfirm={() => {
            if (selectedEnergyTypes.length < 1 || selectedEnergyTypes.length > 3) {
              setEnergySelectionError("Select at least 1 Energy type.");
              return;
            }
            setPendingValidatedDeck({
              name: pendingEnergySelectionDeck.name,
              cardIds: pendingEnergySelectionDeck.cardIds,
              deckId: pendingEnergySelectionDeck.deckId,
              energyTypes: selectedEnergyTypes,
            });
            setSelectedCoverCardId(pendingEnergySelectionDeck.initialCoverCardId);
            setEnergySelectionError(null);
            setPendingEnergySelectionDeck(null);
          }}
        />
      )}
      {customDecksEnabled && pickerSlotIndex !== null && (
        <DeckCardSelectorModal
          slotIndex={pickerSlotIndex}
          currentCardIds={createCardIds}
          onClose={() => {
            setPickerInspectActive(false);
            setPickerSlotIndex(null);
          }}
          onInspectActiveChange={setPickerInspectActive}
          onSelectCard={(cardId) => {
            setCreateCardIds((current) => {
              const next = [...current];
              next[pickerSlotIndex] = cardId;
              return next;
            });
            setCreateError(null);
            setPickerInspectActive(false);
            setPickerSlotIndex(null);
          }}
        />
      )}
      {jsonModalMode && (jsonModalDeck || isCreateImportTarget) && (
        <DeckJsonModal
          mode={jsonModalMode}
          value={jsonModalText}
          error={jsonModalError}
          busy={jsonModalBusy}
          onClearError={() => setJsonModalError(null)}
          onClose={() => {
            if (jsonModalBusy) return;
            setJsonModalMode(null);
            setJsonModalDeckRef(null);
            setJsonModalError(null);
          }}
          onChange={(value) => {
            setJsonModalText(value);
            setJsonModalError(null);
          }}
          onCopy={() => {
            if (typeof navigator === "undefined" || !navigator.clipboard) {
              setJsonModalError("Clipboard is unavailable in this environment.");
              return Promise.resolve(false);
            }
            return navigator.clipboard.writeText(jsonModalText).then(() => true).catch(() => {
              setJsonModalError("Failed to copy JSON to clipboard.");
              return false;
            });
          }}
          onConfirm={async () => {
            if (jsonModalMode !== "import") return;
            const parsed = parseDeckJson(jsonModalText);
            if (!parsed.ok) {
              setJsonModalError(parsed.error);
              return;
            }
            if (!jsonModalDeck && !isCreateImportTarget) {
              setJsonModalError("Unable to resolve import target deck.");
              return;
            }
            if (!isCreateImportTarget && jsonModalDeck?.source !== "local") {
              setJsonModalError("Import is only available for created decks.");
              return;
            }
            setJsonModalError(null);
            setCreateName(parsed.payload.name);
            setCreateCardIds(toEditableDeckSlots(parsed.payload.cardIds));
            setCreateError(null);
            setPickerSlotIndex(null);
            setEditingDeckId(isCreateImportTarget ? null : jsonModalDeck!.id);
            setPendingValidatedDeck(null);
            setPendingEnergySelectionDeck(null);
            setEnergySelectionError(null);
            setSelectedCoverCardId(parsed.payload.coverCardId);
            setSelectedEnergyTypes(parsed.payload.energyTypes);
            setEditorBaseline({
              name: parsed.payload.name,
              cardIds: toEditableDeckSlots(parsed.payload.cardIds),
              selectedCoverCardId: parsed.payload.coverCardId,
              energyTypes: parsed.payload.energyTypes,
            });
            setIsCreateOpen(true);
            setOpenedDeckRef(null);
            setJsonModalMode(null);
            setJsonModalDeckRef(null);
            setShowImportOverwriteConfirm(false);
            setShowClearAllConfirm(false);
            setShowUnsavedChangesConfirm(null);
          }}
        />
      )}
      {showImportOverwriteConfirm && (
        <DeckImportOverwriteConfirmModal
          onClose={() => setShowImportOverwriteConfirm(false)}
          onConfirm={openImportDeckJsonModal}
        />
      )}
      {showClearAllConfirm && (
        <DeckClearAllConfirmModal
          onClose={() => setShowClearAllConfirm(false)}
          onConfirm={() => {
            const cleared = Array.from({ length: DECK_CARD_COUNT }, () => null as string | null);
            setCreateCardIds(cleared);
            setPendingValidatedDeck(null);
            setPendingEnergySelectionDeck(null);
            setSelectedCoverCardId(null);
            setSelectedEnergyTypes(["psychic"]);
            setCreateError(null);
            setPickerSlotIndex(null);
            setShowClearAllConfirm(false);
          }}
        />
      )}
      {showUnsavedChangesConfirm && (
        <DeckUnsavedChangesModal
          mode={showUnsavedChangesConfirm}
          onCancel={() => setShowUnsavedChangesConfirm(null)}
          onSaveDraft={async () => {
            const resolvedDraftName = createName;
            const draft: DeckEditorDraft = {
              name: resolvedDraftName,
              cardIds: [...createCardIds],
              selectedCoverCardId,
              energyTypes: selectedEnergyTypes,
            };
            const draftTargetDeckId = editingDeckId ?? (editingPremadeDeckId ? getEditedPremadeDeckId(editingPremadeDeckId) : editingCreateDraftId);
            const deckNameError = validateDeckNameAvailability(resolvedDraftName, draftTargetDeckId);
            if (deckNameError) {
              setCreateError(deckNameError);
              setShowUnsavedChangesConfirm(null);
              return;
            }
            try {
              if (editingDeckId || editingPremadeDeckId) {
                const draftDeckId = editingDeckId ?? getEditedPremadeDeckId(editingPremadeDeckId!);
                const nextEditDrafts = { ...editDraftByDeckId, [draftDeckId]: draft };
                setEditDraftByDeckId(nextEditDrafts);
                await persistDrafts(createDraftDecks, nextEditDrafts);
              } else if (editingCreateDraftId) {
                const nextEditDrafts = { ...editDraftByDeckId, [editingCreateDraftId]: draft };
                const nextCreateDrafts = createDraftDecks.map((deck) => {
                  if (deck.id !== editingCreateDraftId) return deck;
                  return {
                    ...deck,
                    name: draft.name,
                    coverCardId: resolveDraftCoverCardId(draft),
                    cardIds: draft.cardIds.filter((cardId): cardId is string => Boolean(cardId)),
                    energyTypes: draft.energyTypes,
                    updatedAt: new Date().toISOString(),
                  };
                });
                setEditDraftByDeckId(nextEditDrafts);
                setCreateDraftDecks(nextCreateDrafts);
                await persistDrafts(nextCreateDrafts, nextEditDrafts);
              } else {
                const draftDeckId = buildCreateDraftDeckId(draft.name, createDraftDecks, editDraftByDeckId);
                const nowIso = new Date().toISOString();
                const draftDeck: LocalDeck = {
                  id: draftDeckId,
                  name: draft.name,
                  coverCardId: resolveDraftCoverCardId(draft),
                  cardIds: draft.cardIds.filter((cardId): cardId is string => Boolean(cardId)),
                  energyTypes: draft.energyTypes,
                  formatVersion: LOCAL_DECK_FORMAT_VERSION,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };
                const nextCreateDrafts = [draftDeck, ...createDraftDecks];
                const nextEditDrafts = { ...editDraftByDeckId, [draftDeckId]: draft };
                setCreateDraftDecks(nextCreateDrafts);
                setEditDraftByDeckId(nextEditDrafts);
                await persistDrafts(nextCreateDrafts, nextEditDrafts);
              }
              closeCreateEditorImmediately();
            } catch (error) {
              setCreateError(error instanceof Error ? error.message : "Failed to save deck draft.");
              setShowUnsavedChangesConfirm(null);
            }
          }}
          onConfirm={() => {
            const editDraftId = editingDeckId ?? (editingPremadeDeckId ? getEditedPremadeDeckId(editingPremadeDeckId) : null);
            if (editDraftId) {
              const nextEditDrafts = { ...editDraftByDeckId };
              delete nextEditDrafts[editDraftId];
              setEditDraftByDeckId(nextEditDrafts);
              void persistDrafts(createDraftDecks, nextEditDrafts).catch((error) => {
                setLocalDeckError(error instanceof Error ? error.message : "Failed to clear deck draft.");
              });
            }
            closeCreateEditorImmediately();
          }}
        />
      )}
      {deleteDeck && (
        <DeckDeleteConfirmModal
          deckName={deleteDeck.name}
          deleting={deleteBusy}
          onClose={() => {
            if (deleteBusy) return;
            setDeleteDeckRef(null);
          }}
          onConfirm={async () => {
            if (deleteDeck.source === "premade" || deleteDeck.source === "premadeEdited") {
              const originalPremadeId = deleteDeck.source === "premadeEdited" ? getPremadeDeckIdFromEditedDeckId(deleteDeck.id) : deleteDeck.id;
              const nextHiddenPremadeDeckIds = new Set(hiddenPremadeDeckIds);
              nextHiddenPremadeDeckIds.add(originalPremadeId);
              setHiddenPremadeDeckIds(nextHiddenPremadeDeckIds);
              setFavoriteDeckKeys((current) => {
                const next = new Set(current);
                next.delete(toDeckFavoriteKey(deleteDeck));
                return next;
              });
              const nextEditDrafts = { ...editDraftByDeckId };
              delete nextEditDrafts[getEditedPremadeDeckId(originalPremadeId)];
              setEditDraftByDeckId(nextEditDrafts);
              void persistDrafts(createDraftDecks, nextEditDrafts).catch((error) => {
                setLocalDeckError(error instanceof Error ? error.message : "Failed to clear deck draft.");
              });
              setDeleteDeckRef(null);
              if (
                (openedDeckRef?.id === deleteDeck.id && openedDeckRef.source === deleteDeck.source)
                || (openedDeckRef?.id === originalPremadeId && openedDeckRef.source === "premade")
              ) {
                setOpenedDeckRef(null);
              }
              if (editingPremadeDeckId === originalPremadeId || editingDeckId === getEditedPremadeDeckId(originalPremadeId)) {
                closeCreateEditorImmediately();
              }
              if (equippedDeckId === deleteDeck.id || equippedDeckId === originalPremadeId) {
                const fallbackDeck = allDecks.find((deck) => deck.id !== deleteDeck.id && !(deck.source === "premade" && deck.id === originalPremadeId) && deck.source !== "draft");
                if (fallbackDeck) onEquipDeck(fallbackDeck.id);
              }
              return;
            }
            if (deleteDeck.source === "draft") {
              setFavoriteDeckKeys((current) => {
                const next = new Set(current);
                next.delete(toDeckFavoriteKey(deleteDeck));
                return next;
              });
              const nextCreateDrafts = createDraftDecks.filter((deck) => deck.id !== deleteDeck.id);
              const nextEditDrafts = { ...editDraftByDeckId };
              delete nextEditDrafts[deleteDeck.id];
              setCreateDraftDecks(nextCreateDrafts);
              setEditDraftByDeckId(nextEditDrafts);
              try {
                await persistDrafts(nextCreateDrafts, nextEditDrafts);
              } catch (error) {
                setLocalDeckError(error instanceof Error ? error.message : "Failed to delete deck draft.");
              }
              setDeleteDeckRef(null);
              if (openedDeckRef?.id === deleteDeck.id && openedDeckRef.source === "draft") {
                setOpenedDeckRef(null);
              }
              if (editingCreateDraftId === deleteDeck.id) {
                setEditingCreateDraftId(null);
                setPendingValidatedDeck(null);
                setPendingEnergySelectionDeck(null);
                setEnergySelectionError(null);
                setSelectedCoverCardId(null);
                setSelectedEnergyTypes(["psychic"]);
                setShowImportOverwriteConfirm(false);
                setShowClearAllConfirm(false);
                setIsCreateOpen(false);
              }
              return;
            }
            if (deleteDeck.source !== "local") return;
            setDeleteBusy(true);
            try {
              await deleteLocalDeck(deleteDeck.id);
              setFavoriteDeckKeys((current) => {
                const next = new Set(current);
                next.delete(toDeckFavoriteKey(deleteDeck));
                return next;
              });
              clearEditDraft(deleteDeck.id);
              await refreshLocalDecks();
              setDeleteDeckRef(null);
              if (openedDeckRef?.id === deleteDeck.id && openedDeckRef.source === "local") {
                setOpenedDeckRef(null);
              }
              if (editingDeckId === deleteDeck.id) {
                setEditingDeckId(null);
                setPendingValidatedDeck(null);
                setPendingEnergySelectionDeck(null);
                setEnergySelectionError(null);
                setSelectedCoverCardId(null);
                setSelectedEnergyTypes(["psychic"]);
                setShowImportOverwriteConfirm(false);
                setShowClearAllConfirm(false);
                setIsCreateOpen(false);
              }
            } catch (error) {
              setLocalDeckError(error instanceof Error ? error.message : "Failed to delete deck.");
            } finally {
              setDeleteBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
