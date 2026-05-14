import { useEffect, useRef, useState } from "react";
import type { Card, EnergyType } from "../../../../shared/src/types";
import { energyLabel, getCard } from "../../game/engine";
import { getDeckCoverCard, getDeckEnergyTypes } from "../../utils/deck";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { ActionNotice } from "../../match/feedback/ActionNotice";
import { CARD_INSPECT_IMAGE_RADIUS, radius } from "../../styles/shared";
import {
  DeckEntity,
  deckRows,
  getCardImage,
  SELECTED_TICK,
  DECK_CARD_COUNT,
  generatedEnergyTypes,
} from "./helpers";
import { getHoverPreviewPosition, HOVER_PREVIEW_ACTION_HEIGHT } from "./hoverPreview";
import {
  clearFiltersButtonStyle,
  closeDeckModalButtonStyle,
  createDeckModalStyle,
  deckBrowserCardStyle,
  deckBrowserCreateCardStyle,
  deckBrowserLockedEditIconStyle,
  deckBrowserLockedEditLabelStyle,
  deckCardGridStyle,
  deckCardImageStyle,
  deckCardRowStyle,
  deckCardTileStyle,
  deckCoverAuroraSleeveMarkStyle,
  deckCoverAuroraSleeveStyle,
  deckCoverImageStyle,
  deckEmptySlotTileStyle,
  deckEnergyIconWrapStyle,
  deckEnergyRowStyle,
  deckFavoriteBadgeStyle,
  deckInspectBackdropStyle,
  deckInspectImageStyle,
  deckInspectSurfaceStyle,
  deckLockedEditIconStyle,
  deckLockedEditLabelSmallStyle,
  deckLockedEditTileStyle,
  deckModalHoverDimStyle,
  deckMetaSeparatorStyle,
  deckModalActionButtonStyle,
  deckModalBackdropStyle,
  deckModalHeaderActionsStyle,
  deckModalHeaderStyle,
  deckModalInlineCountStyle,
  deckModalKickerStyle,
  deckModalMetaStyle,
  deckModalStyle,
  deckModalTitleStyle,
  deckNameInputStyle,
  deckSelectorCardTrayStyle,
  deckSelectorHoverDimStyle,
  deckSelectorInspectActionBarStyle,
  deckSelectorInspectActionButtonStyle,
  deckSelectorFilterPanelStyle,
  deckSelectorHoverPreviewImageStyle,
  deckSelectorHoverPreviewStyle,
  deckSelectorModalStyle,
  deckSelectedBadgeStyle,
  deckSummaryCardStyle,
  deckSummaryLabelStyle,
  deckSummaryNameStyle,
  deckSummaryTextStyle,
  emptyStateStyle,
  energyFilterButtonStyle,
  energyFilterGridStyle,
  filterChipStyle,
  filterGroupLabelStyle,
  filterGroupStyle,
  filterMenuButtonStyle,
  filterMenuWrapStyle,
  filterOptionGridStyle,
  filterPopoverHeaderStyle,
  filterPopoverStyle,
  filterPopoverTitleStyle,
  searchInputStyle,
  searchToolbarStyle,
  sortControlGroupStyle,
  sortDirectionButtonStyle,
  sortSelectStyle,
  deckJsonModalStyle,
  deckJsonTextareaStyle,
  deckJsonActionsStyle,
  deleteConfirmBodyStyle,
  validateDeckIconStyle,
  validateDeckLabelStyle,
  validateDeckTileStyle,
} from "./styles";

export { DeckCardSelectorModal } from "./DeckCardSelectorModal";

export function DeckBrowserTile({
  deck,
  equipped,
  favorite = false,
  onOpen,
  onToggleFavorite,
  label,
  isDraft = false,
}: {
  deck: DeckEntity;
  equipped: boolean;
  favorite?: boolean;
  onOpen: () => void;
  onToggleFavorite?: () => void;
  label?: string;
  isDraft?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      style={deckBrowserCardStyle(equipped, hovered)}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {onToggleFavorite && (
        <span
          role="button"
          tabIndex={0}
          aria-label={favorite ? "Remove deck from favorites" : "Add deck to favorites"}
          title={favorite ? "Remove favorite" : "Favorite deck"}
          style={deckFavoriteBadgeStyle(favorite)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
        >
          ★
        </span>
      )}
      {equipped && <span style={deckSelectedBadgeStyle}>{SELECTED_TICK}</span>}
      <DeckSummaryCard
        deck={deck}
        label={label ?? ("createdAt" in deck ? "Created Deck" : "Premade Deck")}
        framed={false}
        showAuroraSleeveCover={isDraft}
      />
    </button>
  );
}

export function DeckBrowserCreateTile({ onOpen }: { onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label="Create deck"
      title="Create deck"
      style={deckBrowserCreateCardStyle(hovered)}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span style={deckBrowserLockedEditIconStyle} aria-hidden="true">✎</span>
      <strong style={deckBrowserLockedEditLabelStyle}>Create Deck</strong>
    </button>
  );
}

export function DeckListModal({
  deck,
  equipped,
  canEquip,
  equipDisabled = false,
  canExport,
  canEdit,
  cardCountText,
  displayCardIds,
  deckLabel,
  onClose,
  onEdit,
  onExport,
  onImport,
  onEquip,
  onDelete,
  canDelete,
  canImport,
  onInspectActiveChange,
}: {
  deck: DeckEntity;
  equipped: boolean;
  canEquip: boolean;
  equipDisabled?: boolean;
  canExport: boolean;
  canEdit: boolean;
  cardCountText?: string;
  displayCardIds?: Array<string | null>;
  deckLabel: string;
  onClose: () => void;
  onEdit: () => void;
  onExport: () => void;
  onImport: () => void;
  onEquip: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canImport: boolean;
  onInspectActiveChange?: (active: boolean) => void;
}) {
  const shownCardIds = displayCardIds ?? deck.cardIds;
  const resolvedCountText = cardCountText ?? `${deck.cardIds.length} cards`;
  const [inspectCard, setInspectCard] = useState<Card | null>(null);
  const [inspectPosition, setInspectPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const inspectActive = Boolean(inspectCard && inspectPosition);
  const rows: (string | null)[][] = shownCardIds.length === 20
    ? [
      shownCardIds.slice(0, 7),
      shownCardIds.slice(7, 14),
      [...shownCardIds.slice(14, 20), null],
    ]
    : chunkDeckRows(shownCardIds, 7);

  const inspectCardFromTile = (card: Card, anchorEl: HTMLButtonElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const { left, top, width } = getHoverPreviewPosition(rect, HOVER_PREVIEW_ACTION_HEIGHT);
    setInspectCard(card);
    setInspectPosition({ left, top, width });
  };

  const closeInspectCard = () => {
    setInspectCard(null);
    setInspectPosition(null);
  };

  useEffect(() => {
    onInspectActiveChange?.(inspectActive);
    return () => onInspectActiveChange?.(false);
  }, [inspectActive, onInspectActiveChange]);

  useEffect(() => {
    if (!inspectActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeInspectCard();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [inspectActive]);

  return (
    <div
      style={deckModalBackdropStyle}
      onClick={() => {
        if (inspectActive) {
          closeInspectCard();
          return;
        }
        onClose();
      }}
    >
      <section style={{ ...deckModalStyle, position: "relative" }} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>{deckLabel}</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>{resolvedCountText}</span>
            </div>
            <h2 style={deckModalTitleStyle}>{deck.name}</h2>
          </div>
          <div style={deckModalHeaderActionsStyle}>
            <NeutralButton style={deckModalActionButtonStyle} onClick={onExport} disabled={!canExport}>Export</NeutralButton>
            {canEquip && (
              <NeutralButton style={deckModalActionButtonStyle} disabled={equipped || equipDisabled} onClick={onEquip}>
                {equipped ? "Equipped" : "Equip"}
              </NeutralButton>
            )}
            <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Close</NeutralButton>
          </div>
        </header>
        <div style={deckCardGridStyle}>
          {rows.map((row, rowIndex) => (
            <div key={`deck-row-${rowIndex}`} style={deckCardRowStyle(row.length)}>
              {row.map((cardId, colIndex) => {
                if (!cardId) {
                  const isBottomRightSlot = rowIndex === 2 && colIndex === 6;
                  if (canEdit) {
                    if (isBottomRightSlot) {
                      return <DeckListEditSlot key={`edit-${rowIndex}-${colIndex}`} onEdit={onEdit} />;
                    }
                    return <DeckListEmptySlot key={`empty-${rowIndex}-${colIndex}`} />;
                  }
                  if (canEquip) {
                    if (isBottomRightSlot) {
                      return <DeckListLockedEditSlot key={`locked-edit-${rowIndex}-${colIndex}`} />;
                    }
                    return <DeckListEmptySlot key={`empty-${rowIndex}-${colIndex}`} />;
                  }
                  return <DeckListEmptySlot key={`empty-${rowIndex}-${colIndex}`} />;
                }
                const card = getCard(cardId);
                const image = getCardImage(card);
                return (
                  <DeckListCardTile
                    key={`${cardId}-${rowIndex}-${colIndex}`}
                    card={card}
                    image={image}
                    name={card.name}
                    onInspect={(anchorEl) => inspectCardFromTile(card, anchorEl)}
                    previewActive={inspectCard?.id === card.id}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div style={deckSelectorHoverDimStyle(inspectActive)} onClick={closeInspectCard} aria-hidden="true" />
        <aside
          style={deckSelectorHoverPreviewStyle(
            inspectPosition?.left ?? 0,
            inspectPosition?.top ?? 0,
            inspectActive,
            inspectPosition?.width,
          )}
          aria-hidden={!inspectActive}
        >
          {inspectCard && (
            <>
              <HoloCardImage
                card={inspectCard}
                src={getCardImage(inspectCard)}
                alt=""
                imageStyle={deckSelectorHoverPreviewImageStyle}
                draggable={false}
                radiusOverride={CARD_INSPECT_IMAGE_RADIUS}
                motionVariant="inspect"
              />
              <div style={deckSelectorInspectActionBarStyle}>
                <NeutralButton style={deckSelectorInspectActionButtonStyle} onClick={closeInspectCard}>
                  Back
                </NeutralButton>
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}

function DeckListLockedEditSlot() {
  return (
    <button
      type="button"
      disabled
      aria-label="Edit deck unavailable for premade decks"
      title="Premade decks cannot be edited"
      style={deckLockedEditTileStyle}
    >
      <span style={deckLockedEditIconStyle} aria-hidden="true">✎</span>
      <strong style={deckLockedEditLabelSmallStyle}>Edit Deck</strong>
    </button>
  );
}

function DeckListEmptySlot() {
  return (
    <div
      aria-hidden="true"
      style={{ ...deckEmptySlotTileStyle, cursor: "default", boxShadow: "none", color: "transparent" }}
    />
  );
}

function DeckListEditSlot({ onEdit }: { onEdit: () => void }) {
  return (
    <button
      type="button"
      aria-label="Edit deck"
      title="Edit deck"
      style={validateDeckTileStyle}
      onClick={onEdit}
    >
      <span style={deckLockedEditIconStyle} aria-hidden="true">✎</span>
      <strong style={validateDeckLabelStyle}>Edit Deck</strong>
    </button>
  );
}

export function CreateDeckModal({
  title,
  name,
  cardIds,
  canRemoveCards,
  canManageDeck,
  canImportDeck,
  selectingCoverCard,
  selectedCoverCardId,
  infoNotice,
  saving,
  error,
  onClearError,
  onClose,
  onNameChange,
  onEditFilledSlot,
  onSelectCoverCard,
  onImportDeck,
  onClearAll,
  canClearAll,
  onDeleteDeck,
  onPickSlot,
  onValidate,
  onCoverInspectActiveChange,
}: {
  title: string;
  name: string;
  cardIds: Array<string | null>;
  canRemoveCards: boolean;
  canManageDeck: boolean;
  canImportDeck: boolean;
  selectingCoverCard: boolean;
  selectedCoverCardId?: string | null;
  infoNotice?: string | null;
  saving: boolean;
  error: string | null;
  onClearError: () => void;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onEditFilledSlot: (slotIndex: number) => void;
  onSelectCoverCard: (cardId: string) => void;
  onImportDeck: () => void;
  onClearAll: () => void;
  canClearAll: boolean;
  onDeleteDeck: () => void;
  onPickSlot: (slotIndex: number) => void;
  onValidate: () => void;
  onCoverInspectActiveChange?: (active: boolean) => void;
}) {
  const [hoverPreviewImage, setHoverPreviewImage] = useState<string | null>(null);
  const [hoverPreviewCard, setHoverPreviewCard] = useState<Card | null>(null);
  const [hoverPreviewKey, setHoverPreviewKey] = useState<string | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [coverInspectCard, setCoverInspectCard] = useState<Card | null>(null);
  const [coverInspectPosition, setCoverInspectPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const hoverPreviewTimeoutRef = useRef<number | null>(null);
  const filledCount = cardIds.filter((cardId) => Boolean(cardId)).length;

  const clearHoverPreviewTimer = () => {
    if (hoverPreviewTimeoutRef.current !== null) {
      window.clearTimeout(hoverPreviewTimeoutRef.current);
      hoverPreviewTimeoutRef.current = null;
    }
  };

  const scheduleHoverPreview = (key: string, card: Card, image: string, anchorEl: HTMLButtonElement) => {
    clearHoverPreviewTimer();
    hoverPreviewTimeoutRef.current = window.setTimeout(() => {
      const rect = anchorEl.getBoundingClientRect();
      const { left, top, width } = getHoverPreviewPosition(rect);
      setHoverPreviewImage(image);
      setHoverPreviewCard(card);
      setHoverPreviewKey(key);
      setHoverPreviewPosition({ left, top, width });
      hoverPreviewTimeoutRef.current = null;
    }, 500);
  };

  const hideHoverPreview = () => {
    clearHoverPreviewTimer();
    setHoverPreviewImage(null);
    setHoverPreviewCard(null);
    setHoverPreviewKey(null);
  };

  const inspectCoverCardFromTile = (card: Card, anchorEl: HTMLButtonElement) => {
    hideHoverPreview();
    const rect = anchorEl.getBoundingClientRect();
    const { left, top, width } = getHoverPreviewPosition(rect, HOVER_PREVIEW_ACTION_HEIGHT);
    setCoverInspectCard(card);
    setCoverInspectPosition({ left, top, width });
  };

  const closeCoverInspectCard = () => {
    setCoverInspectCard(null);
    setCoverInspectPosition(null);
  };

  useEffect(() => () => clearHoverPreviewTimer(), []);

  const hoverPreviewActive = Boolean(hoverPreviewImage && hoverPreviewPosition);
  const coverInspectActive = selectingCoverCard && Boolean(coverInspectCard && coverInspectPosition);

  useEffect(() => {
    onCoverInspectActiveChange?.(coverInspectActive);
    return () => onCoverInspectActiveChange?.(false);
  }, [coverInspectActive, onCoverInspectActiveChange]);

  useEffect(() => {
    if (!coverInspectActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeCoverInspectCard();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [coverInspectActive]);

  return (
    <div
      style={deckModalBackdropStyle}
      onClick={() => {
        if (coverInspectActive) {
          closeCoverInspectCard();
          return;
        }
        onClose();
      }}
    >
      <section style={createDeckModalStyle} onClick={(event) => event.stopPropagation()}>
        {error && (
          <ActionNotice
            notice={error}
            tone="danger"
            placement="bottom"
            interactive
            emphasize
            onClose={onClearError}
          />
        )}
        {!error && infoNotice && (
          <ActionNotice
            notice={infoNotice}
            tone="default"
            placement="bottom"
            interactive={false}
            emphasize
            onClose={() => {}}
          />
        )}
        <header style={deckModalHeaderStyle}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>{title}</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>{filledCount}/{DECK_CARD_COUNT} cards</span>
            </div>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              disabled={selectingCoverCard || saving}
              placeholder="Deck name"
              aria-label="Deck name"
              style={deckNameInputStyle}
            />
          </div>
          <div style={deckModalHeaderActionsStyle}>
            {canImportDeck && (
              <NeutralButton style={deckModalActionButtonStyle} onClick={onImportDeck} disabled={selectingCoverCard || saving}>Import</NeutralButton>
            )}
            <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onClearAll} disabled={!canClearAll || selectingCoverCard || saving}>
              Clear All
            </NeutralButton>
            {canManageDeck && (
              <>
                <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onDeleteDeck} disabled={selectingCoverCard || saving}>Delete</NeutralButton>
              </>
            )}
            <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Close</NeutralButton>
          </div>
        </header>
        <div style={deckCardGridStyle}>
          {deckRows.map((row, rowIndex) => (
            <div key={`create-row-${rowIndex}`} style={deckCardRowStyle(7)}>
              {row.map((slotIndex) => {
                const cardId = cardIds[slotIndex] ?? null;
                if (!cardId) {
                  return (
                    <button
                      key={`create-slot-${slotIndex}`}
                      type="button"
                      style={deckEmptySlotTileStyle}
                      onClick={() => onPickSlot(slotIndex)}
                      title={`Choose card for slot ${slotIndex + 1}`}
                    >
                      +
                    </button>
                  );
                }
                const card = getCard(cardId);
                const image = getCardImage(card);
                return (
                  <DeckListCardTile
                    key={`create-card-${slotIndex}-${cardId}`}
                    card={card}
                    image={image}
                    name={card.name}
                    selected={selectingCoverCard && selectedCoverCardId === cardId}
                    onInspect={(anchorEl) => {
                      if (selectingCoverCard) {
                        inspectCoverCardFromTile(card, anchorEl);
                        return;
                      }
                      hideHoverPreview();
                      if (canRemoveCards) {
                        onEditFilledSlot(slotIndex);
                        return;
                      }
                      onPickSlot(slotIndex);
                    }}
                    onHoverStart={selectingCoverCard ? undefined : (anchorEl) => scheduleHoverPreview(`create-${slotIndex}-${cardId}`, card, image, anchorEl)}
                    onHoverEnd={selectingCoverCard ? undefined : hideHoverPreview}
                    previewActive={hoverPreviewKey === `create-${slotIndex}-${cardId}`}
                  />
                );
              })}
              {rowIndex === 2 && (
                <button
                  type="button"
                  style={validateDeckTileStyle}
                  onClick={onValidate}
                  disabled={saving}
                  title={selectingCoverCard ? "Save deck with selected cover card" : "Validate deck"}
                >
                  <span style={validateDeckIconStyle} aria-hidden="true">{SELECTED_TICK}</span>
                  <strong style={validateDeckLabelStyle}>
                    {saving ? "Saving..." : selectingCoverCard ? "Save Deck" : "Validate Deck"}
                  </strong>
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={deckModalHoverDimStyle(hoverPreviewActive)} aria-hidden="true" />
        <aside
          style={deckSelectorHoverPreviewStyle(
            hoverPreviewPosition?.left ?? 0,
            hoverPreviewPosition?.top ?? 0,
            hoverPreviewActive,
            hoverPreviewPosition?.width,
          )}
          aria-hidden="true"
        >
          {hoverPreviewImage && hoverPreviewCard && (
            <HoloCardImage
              card={hoverPreviewCard}
              src={hoverPreviewImage}
              alt=""
              imageStyle={deckSelectorHoverPreviewImageStyle}
              draggable={false}
              radiusOverride={CARD_INSPECT_IMAGE_RADIUS}
              motionVariant="inspect"
            />
          )}
        </aside>
        <div style={deckSelectorHoverDimStyle(coverInspectActive)} onClick={closeCoverInspectCard} aria-hidden="true" />
        <aside
          style={deckSelectorHoverPreviewStyle(
            coverInspectPosition?.left ?? 0,
            coverInspectPosition?.top ?? 0,
            coverInspectActive,
            coverInspectPosition?.width,
          )}
          aria-hidden={!coverInspectActive}
        >
          {coverInspectCard && (
            <>
              <HoloCardImage
                card={coverInspectCard}
                src={getCardImage(coverInspectCard)}
                alt=""
                imageStyle={deckSelectorHoverPreviewImageStyle}
                draggable={false}
                radiusOverride={CARD_INSPECT_IMAGE_RADIUS}
                motionVariant="inspect"
              />
              <div style={deckSelectorInspectActionBarStyle}>
                <NeutralButton
                  style={deckSelectorInspectActionButtonStyle}
                  onClick={() => {
                    onSelectCoverCard(coverInspectCard.id);
                    closeCoverInspectCard();
                  }}
                >
                  Equip
                </NeutralButton>
                <NeutralButton style={deckSelectorInspectActionButtonStyle} onClick={closeCoverInspectCard}>
                  Back
                </NeutralButton>
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}

export function DeckEnergySelectionModal({
  selectedEnergyTypes,
  error,
  onToggleEnergyType,
  onClearError,
  onClose,
  onConfirm,
}: {
  selectedEnergyTypes: EnergyType[];
  error: string | null;
  onToggleEnergyType: (energyType: EnergyType) => void;
  onClearError: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section
        style={{
          ...deckModalStyle,
          width: "fit-content",
          maxWidth: "calc(100vw - 48px)",
          gridTemplateRows: "auto auto",
          padding: 18,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {error && (
          <ActionNotice
            notice={error}
            tone="danger"
            placement="bottom"
            interactive
            emphasize
            onClose={onClearError}
          />
        )}
        <header style={deckModalHeaderStyle}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Energy</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>{selectedEnergyTypes.length}/3 selected</span>
            </div>
            <h2 style={{ ...deckModalTitleStyle, minHeight: 0 }}>Choose Energy Types</h2>
          </div>
          <div style={deckModalHeaderActionsStyle}>
            <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Back</NeutralButton>
            <NeutralButton style={deckModalActionButtonStyle} onClick={onConfirm}>
              Continue
            </NeutralButton>
          </div>
        </header>
        <div style={{ display: "grid", gap: 18, marginTop: 6 }}>
          <div style={{ ...energyFilterGridStyle, display: "flex", justifyContent: "flex-start", gap: 16, gridTemplateColumns: "none" }}>
            {generatedEnergyTypes.map((energyType) => {
              const active = selectedEnergyTypes.includes(energyType);
              const disabled = !active && selectedEnergyTypes.length >= 3;
              return (
                <button
                  key={`deck-energy-modal-${energyType}`}
                  type="button"
                  style={{
                    ...energyFilterButtonStyle(active),
                    width: 48,
                    height: 48,
                    border: active ? "1px solid rgba(0, 0, 0, 0.7)" : "1px solid rgba(255, 255, 255, 0.82)",
                    opacity: disabled && !active ? 0.45 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                  disabled={disabled}
                  onClick={() => onToggleEnergyType(energyType)}
                  title={energyLabel(energyType)}
                  aria-label={energyLabel(energyType)}
                  aria-pressed={active}
                >
                  <EnergyIcon type={energyType} size="md" />
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}


function chunkDeckRows(cardIds: Array<string | null>, perRow: number): (string | null)[][] {
  const rows: (string | null)[][] = [];
  for (let index = 0; index < cardIds.length; index += perRow) {
    rows.push(cardIds.slice(index, index + perRow));
  }
  return rows;
}

function DeckListCardTile({
  card,
  image,
  name,
  onInspect,
  selected = false,
  clickable = true,
  onHoverStart,
  onHoverEnd,
  previewActive = false,
}: {
  card: Card;
  image: string;
  name: string;
  onInspect: (anchorEl: HTMLButtonElement) => void;
  selected?: boolean;
  clickable?: boolean;
  onHoverStart?: ((anchorEl: HTMLButtonElement) => void) | undefined;
  onHoverEnd?: (() => void) | undefined;
  previewActive?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const baseStyle = deckCardTileStyle(hovered);
  return (
    <button
      type="button"
      style={{
        ...baseStyle,
        border: selected ? "2px solid rgba(5, 7, 10, 0.82)" : baseStyle.border,
        boxShadow: selected ? "0 0 0 2px rgba(255, 255, 255, 0.72), 0 16px 32px rgba(17, 24, 39, 0.22)" : baseStyle.boxShadow,
        ...(clickable ? {} : { cursor: "default" }),
        ...(previewActive ? { position: "relative", zIndex: 8 } : {}),
      }}
      aria-label={`Inspect ${name}`}
      onClick={clickable ? (event) => onInspect(event.currentTarget) : undefined}
      onMouseEnter={(event) => {
        setHovered(true);
        onHoverStart?.(event.currentTarget);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHoverEnd?.();
      }}
      onFocus={(event) => {
        setHovered(true);
        onHoverStart?.(event.currentTarget);
      }}
      onBlur={() => {
        setHovered(false);
        onHoverEnd?.();
      }}
    >
      <HoloCardImage card={card} src={image} alt="" imageStyle={deckCardImageStyle} draggable={false} />
    </button>
  );
}

export function DeckCardInspectModal({ card, onClose }: { card: ReturnType<typeof getCard>; onClose: () => void }) {
  const image = card.kind === "umamusume" ? card.portrait : card.image;

  return (
    <div style={deckInspectBackdropStyle} onClick={onClose}>
      <section style={deckInspectSurfaceStyle} onClick={(event) => event.stopPropagation()}>
        <HoloCardImage
          card={card}
          src={image}
          alt=""
          imageStyle={deckInspectImageStyle}
          draggable={false}
          radiusOverride={CARD_INSPECT_IMAGE_RADIUS}
          motionVariant="inspect"
        />
      </section>
    </div>
  );
}

export function DeckSummaryCard({ deck, label, compact = false, framed = true, showAuroraSleeveCover = false }: { deck: DeckEntity; label: string; compact?: boolean; framed?: boolean; showAuroraSleeveCover?: boolean }) {
  const coverCard = getDeckCoverCard(deck);
  const coverImage = getCardImage(coverCard);
  const energyTypesInDeck = getDeckEnergyTypes(deck);

  return (
    <div style={deckSummaryCardStyle(compact, framed)}>
      {showAuroraSleeveCover ? (
        <span style={deckCoverAuroraSleeveStyle(compact)} aria-label="Aurora Stable card sleeve cover">
          <span style={deckCoverAuroraSleeveMarkStyle}>D</span>
        </span>
      ) : (
        <HoloCardImage card={coverCard} src={coverImage} alt="" imageStyle={deckCoverImageStyle(compact)} draggable={false} />
      )}
      <div style={deckSummaryTextStyle}>
        <div style={deckSummaryLabelStyle}>{label}</div>
        <strong style={deckSummaryNameStyle(compact)}>{deck.name}</strong>
        <div style={deckEnergyRowStyle}>
          {energyTypesInDeck.map((type) => (
            <span key={`${deck.id}-${type}`} style={deckEnergyIconWrapStyle} aria-label={energyLabel(type)}>
              <EnergyIcon type={type} size="sm" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export {
  DeckClearAllConfirmModal,
  DeckDeleteConfirmModal,
  DeckImportOverwriteConfirmModal,
  DeckJsonModal,
  DeckUnsavedChangesModal,
} from "./DeckJsonModals";
