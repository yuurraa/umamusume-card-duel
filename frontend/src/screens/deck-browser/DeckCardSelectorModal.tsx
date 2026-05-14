import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CARD_RARITY_SHORT_LABELS, getCardRarity, isCardDisabled } from "../../../../shared/src/cardRarity";
import { ownedStarterCardIds } from "../../../../shared/src/gameData";
import type { Card, EnergyType } from "../../../../shared/src/types";
import { energyLabel } from "../../game/engine";
import { devUnlocksEnabled, isDevForcedUnowned } from "../../config/devUnlocks";
import { formatCardName } from "../../game/engine/core/labels";
import { readCloudCardCollection } from "../../utils/cardCollectionApi";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { CARD_INSPECT_IMAGE_RADIUS } from "../../styles/shared";
import { DEFAULT_CARD_SORT, sortCardsForCollection, type CardSortKey, type CardSortOption } from "../../utils/cardSorting";
import {
  ArtFilter,
  CategoryFilter,
  OwnershipFilter,
  RarityFilter,
  StageFilter,
  artFilters,
  cardEntries,
  categoryFilters,
  energyTypes,
  getCardImage,
  getSearchText,
  matchesAnyArtFilter,
  matchesAnyCategoryFilter,
  matchesAnyEnergyFilter,
  matchesAnyOwnershipFilter,
  matchesAnyRarityFilter,
  matchesAnyStageFilter,
  ownershipFilters,
  rarityFilters,
  stageFilters,
  toDeckCountKey,
  toggleSetValue,
} from "./helpers";
import { getHoverPreviewPosition, HOVER_PREVIEW_ACTION_HEIGHT } from "./hoverPreview";
import { cardGridStyle, cardImageStyle, cardTileStyle, rarityBadgeStyle } from "./selectorCardStyles";
import {
  clearFiltersButtonStyle,
  closeDeckModalButtonStyle,
  deckModalBackdropStyle,
  deckModalHeaderStyle,
  deckModalInlineCountStyle,
  deckModalKickerStyle,
  deckModalMetaStyle,
  deckModalTitleStyle,
  deckSelectorCardTrayStyle,
  deckSelectorFilterPanelStyle,
  deckSelectorHoverDimStyle,
  deckSelectorHoverPreviewImageStyle,
  deckSelectorHoverPreviewStyle,
  deckSelectorInspectActionBarStyle,
  deckSelectorInspectActionButtonStyle,
  deckSelectorModalStyle,
  deckMetaSeparatorStyle,
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
} from "./styles";

export function DeckCardSelectorModal({
  slotIndex,
  currentCardIds,
  onClose,
  onSelectCard,
  onInspectActiveChange,
}: {
  slotIndex: number;
  currentCardIds: Array<string | null>;
  onClose: () => void;
  onSelectCard: (cardId: string) => void;
  onInspectActiveChange?: (active: boolean) => void;
}) {
  const [ownedCardCounts, setOwnedCardCounts] = useState<Record<string, number> | null>(null);
  const [query, setQuery] = useState("");
  const [inspectCard, setInspectCard] = useState<Card | null>(null);
  const [inspectPosition, setInspectPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [categoryFiltersSelected, setCategoryFiltersSelected] = useState<Set<CategoryFilter>>(() => new Set());
  const [energyFiltersSelected, setEnergyFiltersSelected] = useState<Set<EnergyType>>(() => new Set());
  const [stageFiltersSelected, setStageFiltersSelected] = useState<Set<StageFilter>>(() => new Set());
  const [artFiltersSelected, setArtFiltersSelected] = useState<Set<ArtFilter>>(() => new Set());
  const [ownershipFiltersSelected, setOwnershipFiltersSelected] = useState<Set<OwnershipFilter>>(() => new Set());
  const [rarityFiltersSelected, setRarityFiltersSelected] = useState<Set<RarityFilter>>(() => new Set());
  const [sortOption, setSortOption] = useState<CardSortOption>(DEFAULT_CARD_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = categoryFiltersSelected.size + energyFiltersSelected.size + stageFiltersSelected.size + artFiltersSelected.size + ownershipFiltersSelected.size + rarityFiltersSelected.size;

  const getOwnedCount = (cardId: string): number => {
    if (isDevForcedUnowned(cardId)) return 0;
    const value = ownedCardCounts?.[cardId];
    if (typeof value === "number") return value;
    if (devUnlocksEnabled) return 2;
    return ownedStarterCardIds.has(cardId) ? 2 : 0;
  };
  const isOwned = (cardId: string): boolean => getOwnedCount(cardId) > 0;

  useEffect(() => {
    let active = true;
    readCloudCardCollection()
      .then((counts) => {
        if (!active) return;
        setOwnedCardCounts(counts);
      })
      .catch(() => {
        if (!active) return;
        setOwnedCardCounts(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = cardEntries.filter((card) => {
      if (categoryFiltersSelected.size > 0 && !matchesAnyCategoryFilter(card, categoryFiltersSelected)) return false;
      if (energyFiltersSelected.size > 0 && !matchesAnyEnergyFilter(card, energyFiltersSelected)) return false;
      if (stageFiltersSelected.size > 0 && !matchesAnyStageFilter(card, stageFiltersSelected)) return false;
      if (artFiltersSelected.size > 0 && !matchesAnyArtFilter(card, artFiltersSelected)) return false;
      if (ownershipFiltersSelected.size > 0 && !matchesAnyOwnershipFilter(card, ownershipFiltersSelected, isOwned)) return false;
      if (rarityFiltersSelected.size > 0 && !matchesAnyRarityFilter(card, rarityFiltersSelected)) return false;
      if (!normalizedQuery) return true;
      return getSearchText(card).includes(normalizedQuery);
    });
    return sortCardsForCollection(filtered, sortOption, (card) => getOwnedCount(card.id) > 0);
  }, [artFiltersSelected, categoryFiltersSelected, energyFiltersSelected, ownershipFiltersSelected, query, rarityFiltersSelected, sortOption, stageFiltersSelected]);

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
    setOwnershipFiltersSelected(new Set());
    setRarityFiltersSelected(new Set());
  };

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

  const inspectActive = Boolean(inspectCard && inspectPosition);
  const inspectedCopyKey = inspectCard ? toDeckCountKey(inspectCard.id) : null;
  const inspectedCopyCount = inspectedCopyKey ? cardCounts.get(inspectedCopyKey) ?? 0 : 0;
  const inspectedOwnedCount = inspectCard ? getOwnedCount(inspectCard.id) : 0;
  const inspectedCanEquip = Boolean(inspectCard && inspectedOwnedCount > 0 && inspectedCopyCount < 2);

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
            <div style={sortControlGroupStyle}>
              <select
                value={sortOption.key}
                aria-label="Sort cards"
                style={sortSelectStyle}
                onChange={(event) => setSortOption((current) => ({ ...current, key: event.target.value as CardSortKey }))}
              >
                <option value="default">Default</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="rarity">Rarity</option>
              </select>
              <button
                type="button"
                aria-label="Toggle sort direction"
                style={sortDirectionButtonStyle(sortOption.key !== "default")}
                disabled={sortOption.key === "default"}
                onClick={() => setSortOption((current) => ({
                  ...current,
                  direction: current.direction === "asc" ? "desc" : "asc",
                }))}
              >
                {sortOption.direction === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
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
                    <div style={filterGroupLabelStyle}>Ownership</div>
                    <div style={filterOptionGridStyle}>
                      {ownershipFilters.map((filter) => (
                        <FilterChip
                          key={filter.id}
                          active={ownershipFiltersSelected.has(filter.id)}
                          onClick={() => setOwnershipFiltersSelected((selected) => toggleSetValue(selected, filter.id))}
                        >
                          {filter.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                  <div style={filterGroupStyle}>
                    <div style={filterGroupLabelStyle}>Rarity</div>
                    <div style={filterOptionGridStyle}>
                      {rarityFilters.map((filter) => (
                        <FilterChip
                          key={filter.id}
                          active={rarityFiltersSelected.has(filter.id)}
                          onClick={() => setRarityFiltersSelected((selected) => toggleSetValue(selected, filter.id))}
                        >
                          {filter.label}
                        </FilterChip>
                      ))}
                    </div>
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
                const ownedCount = getOwnedCount(card.id);
                const isOwned = ownedCount > 0;
                const disabledReason = isCardDisabled(card) ? "This card is not available for decks yet." : undefined;
                const isDisabled = copyCount >= 2 || !isOwned || Boolean(disabledReason);
                return (
                  <CardTile
                    key={card.id}
                    card={card}
                    ownedCount={ownedCount}
                    unowned={!isOwned}
                    disabled={isDisabled}
                    disabledReason={disabledReason}
                    onInspect={(anchorEl) => inspectCardFromTile(card, anchorEl)}
                    previewActive={inspectCard?.id === card.id}
                  />
                );
              })}
            </div>
          ) : (
            <div style={emptyStateStyle}>No cards match those filters.</div>
          )}
        </section>
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
                <NeutralButton
                  style={deckSelectorInspectActionButtonStyle}
                  disabled={!inspectedCanEquip}
                  onClick={() => {
                    if (!inspectedCanEquip || !inspectCard) return;
                    onSelectCard(inspectCard.id);
                  }}
                >
                  Equip
                </NeutralButton>
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

function FilterChip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button type="button" style={filterChipStyle(active)} onClick={onClick}>
      {children}
    </button>
  );
}

function CardTile({
  card,
  ownedCount,
  unowned = false,
  disabled = false,
  disabledReason,
  onInspect,
  previewActive = false,
}: {
  card: Card;
  ownedCount: number;
  unowned?: boolean;
  disabled?: boolean;
  disabledReason?: string | undefined;
  onInspect: (anchorEl: HTMLButtonElement) => void;
  previewActive?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const image = getCardImage(card);
  const name = formatCardName(card);
  const rarity = getCardRarity(card);
  const owned = ownedCount > 0;
  const ownershipLabel = owned ? `${ownedCount}x Owned` : "Unowned";

  return (
    <button
      type="button"
      aria-disabled={disabled}
      style={{
        ...cardTileStyle(hovered, disabled, unowned),
        ...(previewActive ? { position: "relative", zIndex: 10 } : {}),
      }}
      onClick={(event) => onInspect(event.currentTarget)}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setHovered(true);
      }}
      onBlur={() => {
        setHovered(false);
      }}
      aria-label={`Inspect ${name}`}
      title={disabledReason ?? (unowned ? `You do not own ${name}` : disabled ? `Max 2 copies per deck (${name})` : undefined)}
    >
      <HoloCardImage
        card={card}
        src={image}
        alt=""
        imageStyle={selectorCardImageStyle(owned)}
        draggable={false}
        disableHoverAnimation={unowned}
      />
      <span style={rarityBadgeStyle(rarity)}>{CARD_RARITY_SHORT_LABELS[rarity]}</span>
      <span style={selectorOwnershipBadgeStyle(owned && !disabledReason)}>{disabledReason ? "Disabled" : ownershipLabel}</span>
    </button>
  );
}

function selectorCardImageStyle(owned: boolean): CSSProperties {
  return {
    ...cardImageStyle,
    filter: owned ? "none" : "grayscale(0.55) saturate(0.45) brightness(0.92)",
    opacity: owned ? 1 : 0.86,
  };
}

function selectorOwnershipBadgeStyle(owned: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 999,
    border: owned ? "1px solid rgba(45, 212, 191, 0.72)" : "1px solid rgba(255, 255, 255, 0.56)",
    background: owned ? "rgba(13, 148, 136, 0.88)" : "rgba(31, 41, 55, 0.78)",
    color: "#fff",
    padding: "4px 8px",
    fontSize: 10,
    fontWeight: 950,
    textTransform: "uppercase",
    pointerEvents: "none",
    boxShadow: "0 8px 18px rgba(17, 24, 39, 0.24)",
  };
}
