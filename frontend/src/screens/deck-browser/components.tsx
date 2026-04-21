import { useMemo, useState } from "react";
import type { Card, EnergyType } from "../../../../shared/src/types";
import { energyLabel, getCard } from "../../game/engine";
import { formatCardName } from "../../game/engine/core/labels";
import { getDeckCoverCard, getDeckEnergyTypes } from "../../utils/deck";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { ActionNotice } from "../../match/feedback/ActionNotice";
import {
  ArtFilter,
  CategoryFilter,
  StageFilter,
  DeckEntity,
  artFilters,
  cardEntries,
  categoryFilters,
  deckRows,
  energyTypes,
  getCardImage,
  getSearchText,
  matchesAnyArtFilter,
  matchesAnyCategoryFilter,
  matchesAnyEnergyFilter,
  matchesAnyStageFilter,
  stageFilters,
  toDeckCountKey,
  toggleSetValue,
  SELECTED_TICK,
  DECK_CARD_COUNT,
} from "./helpers";
import {
  cardGridStyle,
  cardImageStyle,
  cardTileStyle,
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
  deckInspectBackdropStyle,
  deckInspectImageStyle,
  deckInspectSurfaceStyle,
  deckLockedEditIconStyle,
  deckLockedEditLabelSmallStyle,
  deckLockedEditTileStyle,
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
  deckSelectorFilterPanelStyle,
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
  deckJsonModalStyle,
  deckJsonTextareaStyle,
  deckJsonActionsStyle,
  deleteConfirmBodyStyle,
  validateDeckIconStyle,
  validateDeckLabelStyle,
  validateDeckTileStyle,
} from "./styles";

export function DeckBrowserTile({ deck, equipped, onOpen, label, isDraft = false }: { deck: DeckEntity; equipped: boolean; onOpen: () => void; label?: string; isDraft?: boolean }) {
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
  onInspectCard,
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
  onInspectCard: (cardId: string) => void;
}) {
  const shownCardIds = displayCardIds ?? deck.cardIds;
  const resolvedCountText = cardCountText ?? `${deck.cardIds.length} cards`;
  const rows: (string | null)[][] = shownCardIds.length === 20
    ? [
      shownCardIds.slice(0, 7),
      shownCardIds.slice(7, 14),
      [...shownCardIds.slice(14, 20), null],
    ]
    : chunkDeckRows(shownCardIds, 7);

  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckModalStyle} onClick={(event) => event.stopPropagation()}>
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
                const image = card.kind === "umamusume" ? card.portrait : card.image;
                return (
                  <DeckListCardTile
                    key={`${cardId}-${rowIndex}-${colIndex}`}
                    image={image}
                    name={card.name}
                    onInspect={() => onInspectCard(cardId)}
                  />
                );
              })}
            </div>
          ))}
        </div>
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
}) {
  const filledCount = cardIds.filter((cardId) => Boolean(cardId)).length;
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
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
                    image={image}
                    name={card.name}
                    selected={selectingCoverCard && selectedCoverCardId === cardId}
                    onInspect={() => {
                      if (selectingCoverCard) {
                        onSelectCoverCard(cardId);
                        return;
                      }
                      if (canRemoveCards) {
                        onEditFilledSlot(slotIndex);
                        return;
                      }
                      onPickSlot(slotIndex);
                    }}
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
      </section>
    </div>
  );
}

export function DeckCardSelectorModal({
  slotIndex,
  currentCardIds,
  onClose,
  onSelectCard,
}: {
  slotIndex: number;
  currentCardIds: Array<string | null>;
  onClose: () => void;
  onSelectCard: (cardId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryFiltersSelected, setCategoryFiltersSelected] = useState<Set<CategoryFilter>>(() => new Set());
  const [energyFiltersSelected, setEnergyFiltersSelected] = useState<Set<EnergyType>>(() => new Set());
  const [stageFiltersSelected, setStageFiltersSelected] = useState<Set<StageFilter>>(() => new Set());
  const [artFiltersSelected, setArtFiltersSelected] = useState<Set<ArtFilter>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = categoryFiltersSelected.size + energyFiltersSelected.size + stageFiltersSelected.size + artFiltersSelected.size;

  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cardEntries.filter((card) => {
      if (categoryFiltersSelected.size > 0 && !matchesAnyCategoryFilter(card, categoryFiltersSelected)) return false;
      if (energyFiltersSelected.size > 0 && !matchesAnyEnergyFilter(card, energyFiltersSelected)) return false;
      if (stageFiltersSelected.size > 0 && !matchesAnyStageFilter(card, stageFiltersSelected)) return false;
      if (artFiltersSelected.size > 0 && !matchesAnyArtFilter(card, artFiltersSelected)) return false;
      if (!normalizedQuery) return true;
      return getSearchText(card).includes(normalizedQuery);
    });
  }, [artFiltersSelected, categoryFiltersSelected, energyFiltersSelected, query, stageFiltersSelected]);

  const cardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    currentCardIds.forEach((cardId, index) => {
      if (!cardId || index === slotIndex) return;
      const key = toDeckCountKey(cardId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [currentCardIds, slotIndex]);

  const clearFilters = () => {
    setCategoryFiltersSelected(new Set());
    setEnergyFiltersSelected(new Set());
    setStageFiltersSelected(new Set());
    setArtFiltersSelected(new Set());
  };

  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckSelectorModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Select Card</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Slot {slotIndex + 1}</span>
            </div>
            <h2 style={deckModalTitleStyle}>Choose a card to add to the deck</h2>
          </div>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Close</NeutralButton>
        </header>

        <section style={deckSelectorFilterPanelStyle}>
          <div style={searchToolbarStyle}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, type, ability, attack, or effect"
              aria-label="Search cards for slot"
              style={searchInputStyle}
            />
            <div style={filterMenuWrapStyle}>
              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-haspopup="menu"
                style={filterMenuButtonStyle(filtersOpen || activeFilterCount > 0)}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
              {filtersOpen && (
                <div style={filterPopoverStyle} role="menu">
                  <div style={filterPopoverHeaderStyle}>
                    <div style={filterPopoverTitleStyle}>Filters</div>
                    <button
                      type="button"
                      style={clearFiltersButtonStyle(activeFilterCount > 0)}
                      disabled={activeFilterCount === 0}
                      onClick={clearFilters}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={filterGroupStyle}>
                    <div style={filterGroupLabelStyle}>Card Type</div>
                    <div style={filterOptionGridStyle}>
                      {categoryFilters.map((filter) => (
                        <FilterChip
                          key={filter.id}
                          active={categoryFiltersSelected.has(filter.id)}
                          onClick={() => setCategoryFiltersSelected((selected) => toggleSetValue(selected, filter.id))}
                        >
                          {filter.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                  <div style={filterGroupStyle}>
                    <div style={filterGroupLabelStyle}>Stage</div>
                    <div style={filterOptionGridStyle}>
                      {stageFilters.map((filter) => (
                        <FilterChip
                          key={filter.id}
                          active={stageFiltersSelected.has(filter.id)}
                          onClick={() => setStageFiltersSelected((selected) => toggleSetValue(selected, filter.id))}
                        >
                          {filter.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                  <div style={filterGroupStyle}>
                    <div style={filterGroupLabelStyle}>Art</div>
                    <div style={filterOptionGridStyle}>
                      {artFilters.map((filter) => (
                        <FilterChip
                          key={filter.id}
                          active={artFiltersSelected.has(filter.id)}
                          onClick={() => setArtFiltersSelected((selected) => toggleSetValue(selected, filter.id))}
                        >
                          {filter.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                  <div style={filterGroupStyle}>
                    <div style={filterGroupLabelStyle}>Energy</div>
                    <div style={energyFilterGridStyle}>
                      {energyTypes.map((type) => (
                        <button
                          key={type}
                          type="button"
                          aria-label={`${energyLabel(type)} filter`}
                          title={energyLabel(type)}
                          style={energyFilterButtonStyle(energyFiltersSelected.has(type))}
                          onClick={() => setEnergyFiltersSelected((selected) => toggleSetValue(selected, type))}
                        >
                          <EnergyIcon type={type} size="md" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={deckSelectorCardTrayStyle}>
          {visibleCards.length > 0 ? (
            <div style={cardGridStyle}>
              {visibleCards.map((card) => {
                const copyKey = toDeckCountKey(card.id);
                const copyCount = cardCounts.get(copyKey) ?? 0;
                const isDisabled = copyCount >= 2;
                return (
                  <CardTile
                    key={card.id}
                    card={card}
                    disabled={isDisabled}
                    onInspect={() => {
                      if (isDisabled) return;
                      onSelectCard(card.id);
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div style={emptyStateStyle}>No cards match those filters.</div>
          )}
        </section>
      </section>
    </div>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button type="button" style={filterChipStyle(active)} onClick={onClick}>
      {children}
    </button>
  );
}

function CardTile({ card, disabled = false, onInspect }: { card: Card; disabled?: boolean; onInspect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const image = getCardImage(card);
  const name = formatCardName(card);

  return (
    <button
      type="button"
      disabled={disabled}
      style={cardTileStyle(hovered, disabled)}
      onClick={onInspect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={`Use ${name}`}
      title={disabled ? `Max 2 copies per deck (${name})` : undefined}
    >
      <img style={cardImageStyle} src={image} alt="" draggable={false} />
    </button>
  );
}

function chunkDeckRows(cardIds: Array<string | null>, perRow: number): (string | null)[][] {
  const rows: (string | null)[][] = [];
  for (let index = 0; index < cardIds.length; index += perRow) {
    rows.push(cardIds.slice(index, index + perRow));
  }
  return rows;
}

function DeckListCardTile({ image, name, onInspect, selected = false }: { image: string; name: string; onInspect: () => void; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const baseStyle = deckCardTileStyle(hovered);
  return (
    <button
      type="button"
      style={{
        ...baseStyle,
        border: selected ? "2px solid rgba(5, 7, 10, 0.82)" : baseStyle.border,
        boxShadow: selected ? "0 0 0 2px rgba(255, 255, 255, 0.72), 0 16px 32px rgba(17, 24, 39, 0.22)" : baseStyle.boxShadow,
      }}
      aria-label={`Inspect ${name}`}
      onClick={onInspect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <img style={deckCardImageStyle} src={image} alt="" draggable={false} />
    </button>
  );
}

export function DeckCardInspectModal({ card, onClose }: { card: ReturnType<typeof getCard>; onClose: () => void }) {
  const image = card.kind === "umamusume" ? card.portrait : card.image;

  return (
    <div style={deckInspectBackdropStyle} onClick={onClose}>
      <section style={deckInspectSurfaceStyle} onClick={(event) => event.stopPropagation()}>
        <img style={deckInspectImageStyle} src={image} alt="" draggable={false} />
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
        <img style={deckCoverImageStyle(compact)} src={coverImage} alt="" draggable={false} />
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

export function DeckJsonModal({
  mode,
  value,
  error,
  onClearError,
  onClose,
  onChange,
  onConfirm,
  onCopy,
  busy = false,
}: {
  mode: "export" | "import";
  value: string;
  error: string | null;
  onClearError: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCopy: () => Promise<boolean>;
  busy?: boolean;
}) {
  const isExport = mode === "export";
  const [copied, setCopied] = useState(false);
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
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
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>{isExport ? "Export" : "Import"}</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Deck JSON</span>
            </div>
            <h2 style={deckModalTitleStyle}>{isExport ? "Copy deck JSON" : "Paste deck JSON"}</h2>
          </div>
        </header>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={isExport}
          spellCheck={false}
          style={deckJsonTextareaStyle}
          aria-label={isExport ? "Deck JSON export" : "Deck JSON import"}
        />
        <div style={deckJsonActionsStyle}>
          {isExport ? (
            <NeutralButton
              style={deckModalActionButtonStyle}
              onClick={() => {
                void onCopy().then((ok) => {
                  if (ok) setCopied(true);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </NeutralButton>
          ) : (
            <NeutralButton style={deckModalActionButtonStyle} onClick={onConfirm} disabled={busy}>{busy ? "Importing..." : "Import"}</NeutralButton>
          )}
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Close</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckDeleteConfirmModal({
  deckName,
  onClose,
  onConfirm,
  deleting = false,
}: {
  deckName: string;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Delete</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Created Deck</span>
            </div>
            <h2 style={deckModalTitleStyle}>Delete this deck?</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>This will permanently remove <strong>{deckName}</strong>.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </NeutralButton>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Cancel</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckImportOverwriteConfirmModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Import</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Replace current cards</span>
            </div>
            <h2 style={deckModalTitleStyle}>Overwrite current deck cards?</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>Importing JSON will replace the cards currently selected in this editor.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onConfirm}>Continue Import</NeutralButton>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Cancel</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckClearAllConfirmModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Clear</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Create / Edit Deck</span>
            </div>
            <h2 style={deckModalTitleStyle}>Clear all selected cards?</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>This removes all currently selected cards from this deck editor.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onConfirm}>Clear All</NeutralButton>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Cancel</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckUnsavedChangesModal({
  mode,
  onCancel,
  onSaveDraft,
  onConfirm,
}: {
  mode: "create" | "edit";
  onCancel: () => void;
  onSaveDraft: () => void;
  onConfirm: () => void;
}) {
  const title = mode === "edit"
    ? "Are you sure you want to stop editing deck?"
    : "Are you sure you want to stop creating deck?";

  return (
    <div style={deckModalBackdropStyle} onClick={onCancel}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Unsaved Changes</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>{mode === "edit" ? "Edit Deck" : "Create Deck"}</span>
            </div>
            <h2 style={deckModalTitleStyle}>{title}</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>Unsaved changes will be lost.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onSaveDraft}>Save as Draft</NeutralButton>
          <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onConfirm}>Confirm</NeutralButton>
        </div>
      </section>
    </div>
  );
}
