import { useEffect, useMemo, useState } from "react";
import { createDeckIdFromName, LOCAL_DECK_FORMAT_VERSION, type LocalDeck } from "../../../shared/src/localDecks";
import { getCard } from "../game/engine";
import { NeutralButton } from "../components/buttons/NeutralButton";
import type { PremadeDeck } from "../types/ui";
import { deleteLocalDeck, importLocalDeck, listCloudDeckDrafts, listLocalDecks, saveCloudDeckDrafts, saveLocalDeck } from "../utils/localDeckApi";
import {
  DeckClearAllConfirmModal,
  CreateDeckModal,
  DeckBrowserCreateTile,
  DeckImportOverwriteConfirmModal,
  DeckUnsavedChangesModal,
  DeckBrowserTile,
  DeckCardInspectModal,
  DeckCardSelectorModal,
  DeckDeleteConfirmModal,
  DeckJsonModal,
  DeckListModal,
  DeckSummaryCard,
} from "./deck-browser/components";
import {
  DECK_CARD_COUNT,
  type DeckEntity,
  buildDeckJson,
  getDuplicateOverflowCardName,
  parseDeckJson,
  sortDeckCardIds,
  toEditableDeckSlots,
  writeLocalDeckCache,
} from "./deck-browser/helpers";
import {
  deckBrowserBackButtonStyle,
  deckBrowserGridStyle,
  deckBrowserHeaderStyle,
  deckBrowserShellStyle,
  deckBrowserSubtitleStyle,
  deckBrowserTitleStyle,
  localDeckErrorStyle,
  localDeckPersistenceNoticeStyle,
  menuKickerStyle,
} from "./deck-browser/styles";

export { DeckSummaryCard } from "./deck-browser/components";

const CREATE_DECK_DRAFTS_STORAGE_KEY = "umamusume-deck-editor-draft-create-list";
const EDIT_DECK_DRAFT_STORAGE_KEY = "umamusume-deck-editor-draft-edit";

type DeckEditorDraft = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
};

type DeckEditorSnapshot = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
};

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
  const [openedDeckRef, setOpenedDeckRef] = useState<{ id: string; source: "premade" | "local" | "draft" } | null>(null);
  const [inspectedDeckCardId, setInspectedDeckCardId] = useState<string | null>(null);
  const [localDecks, setLocalDecks] = useState<LocalDeck[]>([]);
  const [localDeckError, setLocalDeckError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("New Deck");
  const [createCardIds, setCreateCardIds] = useState<Array<string | null>>(() => Array.from({ length: DECK_CARD_COUNT }, () => null));
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSavingCreateDeck, setIsSavingCreateDeck] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editingCreateDraftId, setEditingCreateDraftId] = useState<string | null>(null);
  const [jsonModalMode, setJsonModalMode] = useState<"export" | "import" | null>(null);
  const [jsonModalDeckRef, setJsonModalDeckRef] = useState<{ id: string; source: "premade" | "local" | "draft" } | null>(null);
  const [jsonModalText, setJsonModalText] = useState("");
  const [jsonModalError, setJsonModalError] = useState<string | null>(null);
  const [jsonModalBusy] = useState(false);
  const [deleteDeckRef, setDeleteDeckRef] = useState<{ id: string; source: "premade" | "local" | "draft" } | null>(null);
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
  } | null>(null);
  const [selectedCoverCardId, setSelectedCoverCardId] = useState<string | null>(null);
  const [editorBaseline, setEditorBaseline] = useState<DeckEditorSnapshot | null>(null);

  const allDecks = useMemo(
    () => [
      ...decks.map((deck) => ({ ...deck, source: "premade" as const })),
      ...localDecks.map((deck) => ({ ...deck, source: "local" as const })),
      ...createDraftDecks.map((deck) => ({ ...deck, source: "draft" as const })),
    ],
    [createDraftDecks, decks, localDecks],
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
  const inspectedDeckCard = inspectedDeckCardId ? getCard(inspectedDeckCardId) : null;
  const openedDeckHasDraft = Boolean(
    openedDeck
    && (openedDeck.source === "draft" || (openedDeck.source === "local" && editDraftByDeckId[openedDeck.id])),
  );
  const openedDeckDraft = openedDeck && openedDeck.source !== "premade" ? editDraftByDeckId[openedDeck.id] : undefined;

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
    if (pendingValidatedDeck) return true;
    if (!editorBaseline) return false;
    if (editorBaseline.name !== createName) return true;
    if (editorBaseline.selectedCoverCardId !== selectedCoverCardId) return true;
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
    setEditingCreateDraftId(null);
    setPendingValidatedDeck(null);
    setSelectedCoverCardId(null);
    setShowImportOverwriteConfirm(false);
    setShowClearAllConfirm(false);
    setShowUnsavedChangesConfirm(null);
    setEditorBaseline(null);
    setIsCreateOpen(false);
  };

  const requestCloseCreateEditor = () => {
    if (hasUnsavedEditorChanges()) {
      setShowUnsavedChangesConfirm(editingDeckId || editingCreateDraftId ? "edit" : "create");
      return;
    }
    closeCreateEditorImmediately();
  };

  useEffect(() => {
    let active = true;
    Promise.all([listLocalDecks(), listCloudDeckDrafts()])
      .then(([nextDecks, nextDrafts]) => {
        if (!active) return;
        setLocalDecks(nextDecks);
        writeLocalDeckCache(nextDecks);
        setCreateDraftDecks(nextDrafts.createDrafts);
        setEditDraftByDeckId(nextDrafts.editDrafts);
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
  }, []);

  useEffect(() => {
    const onDeckEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        !inspectedDeckCardId
        && pickerSlotIndex === null
        && !jsonModalMode
        && !deleteDeckRef
        && !showImportOverwriteConfirm
        && !showClearAllConfirm
        && !showUnsavedChangesConfirm
        && !isCreateOpen
        && !openedDeckRef
      ) return;
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
      if (inspectedDeckCardId) {
        setInspectedDeckCardId(null);
        return;
      }
      if (pickerSlotIndex !== null) {
        setPickerSlotIndex(null);
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
  }, [deleteDeckRef, openedDeckRef, inspectedDeckCardId, isCreateOpen, jsonModalMode, pickerSlotIndex, requestCloseCreateEditor, showClearAllConfirm, showImportOverwriteConfirm, showUnsavedChangesConfirm]);

  useEffect(() => {
    if (!isCreateOpen) {
      setCreateError(null);
      setEditingDeckId(null);
      setEditingCreateDraftId(null);
      setPendingValidatedDeck(null);
      setSelectedCoverCardId(null);
      setShowImportOverwriteConfirm(false);
      setShowClearAllConfirm(false);
      setShowUnsavedChangesConfirm(null);
      setEditorBaseline(null);
    }
  }, [isCreateOpen]);

  const refreshLocalDecks = async () => {
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
      <div style={localDeckPersistenceNoticeStyle}>
Created decks are saved to cloud storage for this test profile. Export still gives you a portable JSON backup.
      </div>
      <div style={deckBrowserGridStyle}>
        {allDecks.map((deck) => {
          const equipped = deck.source !== "draft" && deck.id === equippedDeckId;
          const hasDraft = deck.source === "draft" || (deck.source === "local" && Boolean(editDraftByDeckId[deck.id]));
          return (
            <DeckBrowserTile
              key={`${deck.source}-${deck.id}`}
              deck={deck}
              equipped={equipped}
              isDraft={hasDraft}
              label={deck.source === "premade" ? "Premade Deck" : hasDraft ? "Draft Deck" : "Created Deck"}
              onOpen={() => setOpenedDeckRef({ id: deck.id, source: deck.source })}
            />
          );
        })}
        <DeckBrowserCreateTile
          onOpen={() => {
            const blankCardIds = Array.from({ length: DECK_CARD_COUNT }, () => null as string | null);
            setCreateName("New Deck");
            setCreateCardIds(blankCardIds);
            setCreateError(null);
            setPickerSlotIndex(null);
            setEditingDeckId(null);
            setEditingCreateDraftId(null);
            setPendingValidatedDeck(null);
            setSelectedCoverCardId(null);
            setShowImportOverwriteConfirm(false);
            setShowClearAllConfirm(false);
            setShowUnsavedChangesConfirm(null);
            setEditorBaseline({
              name: "New Deck",
              cardIds: blankCardIds,
              selectedCoverCardId: null,
            });
            setIsCreateOpen(true);
        }}
        />
      </div>
      {localDeckError && <div style={localDeckErrorStyle}>{localDeckError}</div>}
      {openedDeck && (
        <DeckListModal
          deck={openedDeck as DeckEntity}
          equipped={openedDeck.id === equippedDeckId}
          canEquip
          equipDisabled={openedDeck.source === "draft" || openedDeckHasDraft}
          canExport={!openedDeckHasDraft}
          canEdit={openedDeck.source !== "premade"}
          {...(openedDeckDraft
            ? {
              displayCardIds: openedDeckDraft.cardIds,
              cardCountText: `${openedDeckDraft.cardIds.filter((cardId) => Boolean(cardId)).length}/${DECK_CARD_COUNT} cards`,
            }
            : {})}
          deckLabel={openedDeck.source === "premade" ? "Premade Deck" : openedDeckHasDraft ? "Draft Deck" : "Created Deck"}
          onClose={() => {
            setInspectedDeckCardId(null);
            setOpenedDeckRef(null);
          }}
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
            if (openedDeck.source === "premade") return;
            const draft = editDraftByDeckId[openedDeck.id];
            const draftName = draft?.name ?? openedDeck.name;
            const draftCardIds = draft?.cardIds ?? toEditableDeckSlots(openedDeck.cardIds);
            const draftCover = draft?.selectedCoverCardId ?? openedDeck.coverCardId;
            setCreateName(draftName);
            setCreateCardIds([...draftCardIds]);
            setCreateError(null);
            setPickerSlotIndex(null);
            setEditingDeckId(openedDeck.source === "local" ? openedDeck.id : null);
            setEditingCreateDraftId(openedDeck.source === "draft" ? openedDeck.id : null);
            setPendingValidatedDeck(null);
            setSelectedCoverCardId(draftCover);
            setShowImportOverwriteConfirm(false);
            setShowClearAllConfirm(false);
            setShowUnsavedChangesConfirm(null);
            setEditorBaseline({
              name: draftName,
              cardIds: [...draftCardIds],
              selectedCoverCardId: draftCover,
            });
            setOpenedDeckRef(null);
            setIsCreateOpen(true);
          }}
          onEquip={() => {
            if (openedDeckHasDraft) return;
            onEquipDeck(openedDeck.id);
            setInspectedDeckCardId(null);
            setOpenedDeckRef(null);
          }}
          onDelete={() => {
            if (openedDeck.source === "premade") return;
            setDeleteDeckRef({ id: openedDeck.id, source: openedDeck.source });
          }}
          canDelete={openedDeck.source !== "premade"}
          canImport={openedDeck.source === "local"}
          onInspectCard={setInspectedDeckCardId}
        />
      )}
      {isCreateOpen && (
        <CreateDeckModal
          title={editingDeckId || editingCreateDraftId ? "Edit Deck" : "Create Deck"}
          name={createName}
          cardIds={createCardIds}
          canRemoveCards={Boolean(editingDeckId || editingCreateDraftId) && !pendingValidatedDeck}
          canManageDeck={Boolean(editingDeckId || editingCreateDraftId)}
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
          }}
          onEditFilledSlot={(slotIndex) => {
            setCreateCardIds((current) => {
              const next = [...current];
              next[slotIndex] = null;
              return next;
            });
            setCreateError(null);
            setPendingValidatedDeck(null);
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
            if (editingCreateDraftId) {
              setDeleteDeckRef({ id: editingCreateDraftId, source: "draft" });
            }
          }}
          onPickSlot={(slotIndex) => {
            setPendingValidatedDeck(null);
            setPickerSlotIndex(slotIndex);
          }}
          onValidate={async () => {
            if (isSavingCreateDeck) return;
            if (pendingValidatedDeck) {
              const deckNameError = validateDeckNameAvailability(pendingValidatedDeck.name, pendingValidatedDeck.deckId);
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
                };
                const deck = pendingValidatedDeck.deckId
                  ? await saveLocalDeck(pendingValidatedDeck.deckId, payload)
                  : await importLocalDeck(payload);
                await refreshLocalDecks();
                setPendingValidatedDeck(null);
                setSelectedCoverCardId(null);
                if (!pendingValidatedDeck.deckId) {
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
                  delete nextEditDrafts[pendingValidatedDeck.deckId];
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
            const deckNameError = validateDeckNameAvailability(createName, editingDeckId ?? editingCreateDraftId);
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
              setPendingValidatedDeck({
                name: createName.trim(),
                cardIds: resolvedCardIds,
                deckId: editingDeckId ?? null,
              });
              setSelectedCoverCardId(initialCoverCardId);
            } catch (error) {
              setCreateError(error instanceof Error ? error.message : "Failed to save deck.");
            }
          }}
        />
      )}
      {pickerSlotIndex !== null && (
        <DeckCardSelectorModal
          slotIndex={pickerSlotIndex}
          currentCardIds={createCardIds}
          onClose={() => setPickerSlotIndex(null)}
          onSelectCard={(cardId) => {
            setCreateCardIds((current) => {
              const next = [...current];
              next[pickerSlotIndex] = cardId;
              return next;
            });
            setCreateError(null);
            setPickerSlotIndex(null);
          }}
        />
      )}
      {inspectedDeckCard && (
        <DeckCardInspectModal
          card={inspectedDeckCard}
          onClose={() => setInspectedDeckCardId(null)}
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
            setSelectedCoverCardId(parsed.payload.coverCardId);
            setEditorBaseline({
              name: parsed.payload.name,
              cardIds: toEditableDeckSlots(parsed.payload.cardIds),
              selectedCoverCardId: parsed.payload.coverCardId,
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
            setSelectedCoverCardId(null);
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
            const draft: DeckEditorDraft = {
              name: createName,
              cardIds: [...createCardIds],
              selectedCoverCardId,
            };
            const deckNameError = validateDeckNameAvailability(createName, editingDeckId ?? editingCreateDraftId);
            if (deckNameError) {
              setCreateError(deckNameError);
              setShowUnsavedChangesConfirm(null);
              return;
            }
            try {
              if (editingDeckId) {
                const nextEditDrafts = { ...editDraftByDeckId, [editingDeckId]: draft };
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
            if (editingDeckId) {
              const nextEditDrafts = { ...editDraftByDeckId };
              delete nextEditDrafts[editingDeckId];
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
            if (deleteDeck.source === "draft") {
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
                setSelectedCoverCardId(null);
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
              clearEditDraft(deleteDeck.id);
              await refreshLocalDecks();
              setDeleteDeckRef(null);
              if (openedDeckRef?.id === deleteDeck.id && openedDeckRef.source === "local") {
                setOpenedDeckRef(null);
              }
              if (editingDeckId === deleteDeck.id) {
                setEditingDeckId(null);
                setPendingValidatedDeck(null);
                setSelectedCoverCardId(null);
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

function readCreateDraftDecks(): LocalDeck[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CREATE_DECK_DRAFTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalDeck[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((deck) => {
      if (!deck || typeof deck !== "object") return false;
      if (typeof deck.id !== "string" || deck.id.length === 0) return false;
      if (typeof deck.name !== "string" || deck.name.length === 0) return false;
      if (typeof deck.coverCardId !== "string" || deck.coverCardId.length === 0) return false;
      if (!Array.isArray(deck.cardIds) || deck.cardIds.some((cardId) => typeof cardId !== "string")) return false;
      if (typeof deck.createdAt !== "string" || typeof deck.updatedAt !== "string") return false;
      return true;
    });
  } catch {
    return [];
  }
}

function writeCreateDraftDecks(drafts: LocalDeck[]): void {
  if (typeof window === "undefined") return;
  if (drafts.length === 0) {
    window.localStorage.removeItem(CREATE_DECK_DRAFTS_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CREATE_DECK_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

function readEditDeckDrafts(): Record<string, DeckEditorDraft> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(EDIT_DECK_DRAFT_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, DeckEditorDraft>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, DeckEditorDraft> = {};
    for (const [deckId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      if (typeof value.name !== "string") continue;
      if (!Array.isArray(value.cardIds) || value.cardIds.length !== DECK_CARD_COUNT) continue;
      if (value.cardIds.some((cardId) => cardId !== null && typeof cardId !== "string")) continue;
      if (value.selectedCoverCardId !== null && typeof value.selectedCoverCardId !== "string") continue;
      next[deckId] = {
        name: value.name,
        cardIds: [...value.cardIds],
        selectedCoverCardId: value.selectedCoverCardId,
      };
    }
    return next;
  } catch {
    return {};
  }
}

function writeEditDeckDrafts(drafts: Record<string, DeckEditorDraft>): void {
  if (typeof window === "undefined") return;
  if (Object.keys(drafts).length === 0) {
    window.localStorage.removeItem(EDIT_DECK_DRAFT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(EDIT_DECK_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function normalizeDeckNameForCompare(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveDraftCoverCardId(draft: DeckEditorDraft): string {
  return draft.selectedCoverCardId
    ?? draft.cardIds.find((cardId): cardId is string => Boolean(cardId))
    ?? "mihonoBourbonStage2";
}

function buildCreateDraftDeckId(
  deckName: string,
  createDraftDecks: LocalDeck[],
  editDraftByDeckId: Record<string, DeckEditorDraft>,
): string {
  const existingIds = new Set([
    ...createDraftDecks.map((deck) => deck.id),
    ...Object.keys(editDraftByDeckId),
  ]);
  const base = createDeckIdFromName(deckName);
  let candidate = base;
  let suffix = 1;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
