import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { CARD_RARITY_LABELS, CARD_RARITY_SHORT_LABELS, getCardRarity, isFullArtCard } from "../../../shared/src/cardRarity";
import { allCards, ownedStarterCardIds } from "../../../shared/src/gameData";
import type { Card, CardRarity, EnergyType, TrainerType, UmamusumeType } from "../../../shared/src/types";
import { EnergyIcon } from "../components/cards/EnergyIcon";
import { HoloCardImage } from "../components/cards/HoloCardImage";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { energyLabel } from "../game/engine";
import { formatCardName } from "../game/engine/core/labels";
import { devUnlocksEnabled, isDevForcedUnowned } from "../config/devUnlocks";
import { CARD_ASPECT_RATIO, CARD_INSPECT_IMAGE_RADIUS, borders, colors, glassPanelStyle, radius, transitions, uiTextColor, uiTextShadow } from "../styles/shared";
import { readCloudCardCollection } from "../utils/cardCollectionApi";
import { DEFAULT_CARD_SORT, sortCardsForCollection, type CardSortKey, type CardSortOption } from "../utils/cardSorting";

type CategoryFilter = "umamusume" | "trainer" | "item" | "tool" | "stadium";
type StageFilter = 0 | 1 | 2;
type ArtFilter = "normal" | "fullArt";
type OwnershipFilter = "owned" | "unowned";
type RarityFilter = CardRarity;

const categoryFilters: Array<{ id: CategoryFilter; label: string }> = [
  { id: "umamusume", label: "Umamusume" },
  { id: "trainer", label: "Trainer" },
  { id: "item", label: "Item" },
  { id: "tool", label: "Tool" },
  { id: "stadium", label: "Stadium" },
];

const energyTypes: EnergyType[] = [
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "steel",
  "colorless",
  "dragon",
];

const stageFilters: Array<{ id: StageFilter; label: string }> = [
  { id: 0, label: "Basic" },
  { id: 1, label: "Stage 1" },
  { id: 2, label: "Stage 2" },
];

const artFilters: Array<{ id: ArtFilter; label: string }> = [
  { id: "normal", label: "Normal Art" },
  { id: "fullArt", label: "Full Art" },
];

const ownershipFilters: Array<{ id: OwnershipFilter; label: string }> = [
  { id: "owned", label: "Owned" },
  { id: "unowned", label: "Unowned" },
];

const rarityFilters: Array<{ id: RarityFilter; label: string }> = [
  { id: "common", label: CARD_RARITY_LABELS.common },
  { id: "uncommon", label: CARD_RARITY_LABELS.uncommon },
  { id: "rare", label: CARD_RARITY_LABELS.rare },
  { id: "doubleRare", label: CARD_RARITY_LABELS.doubleRare },
];

const cardEntries = Object.values(allCards).sort((left, right) => {
  const groupSort = getCardSortGroup(left) - getCardSortGroup(right);
  if (groupSort !== 0) return groupSort;
  return formatCardName(left).localeCompare(formatCardName(right));
});
const starterCardCounts = Array.from(ownedStarterCardIds).reduce<Record<string, number>>((counts, cardId) => {
  counts[cardId] = 2;
  return counts;
}, {});

const HOVER_PREVIEW_MAX_WIDTH = 440;
const HOVER_PREVIEW_VIEWPORT_WIDTH_PADDING = 36;
const HOVER_PREVIEW_GAP = 12;
const HOVER_PREVIEW_VIEWPORT_PAD = 10;
const HOVER_PREVIEW_HEIGHT_PER_WIDTH = 1040 / 745;

function getHoverPreviewPosition(rect: DOMRect): { left: number; top: number } {
  const popupWidth = Math.min(HOVER_PREVIEW_MAX_WIDTH, Math.max(120, window.innerWidth - HOVER_PREVIEW_VIEWPORT_WIDTH_PADDING));
  const popupHeight = popupWidth * HOVER_PREVIEW_HEIGHT_PER_WIDTH;
  const rightCandidate = rect.right + HOVER_PREVIEW_GAP;
  const leftCandidate = rect.left - HOVER_PREVIEW_GAP - popupWidth;
  const prefersRight = rightCandidate + popupWidth + HOVER_PREVIEW_VIEWPORT_PAD <= window.innerWidth;
  const unclampedLeft = prefersRight ? rightCandidate : leftCandidate;
  const maxLeft = Math.max(HOVER_PREVIEW_VIEWPORT_PAD, window.innerWidth - HOVER_PREVIEW_VIEWPORT_PAD - popupWidth);
  const left = Math.max(HOVER_PREVIEW_VIEWPORT_PAD, Math.min(maxLeft, unclampedLeft));
  const preferredCenterY = rect.top + rect.height / 2;
  const halfHeight = popupHeight / 2;
  const minCenterY = HOVER_PREVIEW_VIEWPORT_PAD + halfHeight;
  const maxCenterY = window.innerHeight - HOVER_PREVIEW_VIEWPORT_PAD - halfHeight;
  const top = minCenterY <= maxCenterY
    ? Math.max(minCenterY, Math.min(maxCenterY, preferredCenterY))
    : window.innerHeight / 2;
  return { left, top };
}

export function CardBrowserScreen({ onBack }: { onBack: () => void }) {
  const [ownedCardCounts, setOwnedCardCounts] = useState<Record<string, number> | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFiltersSelected, setCategoryFiltersSelected] = useState<Set<CategoryFilter>>(() => new Set());
  const [energyFiltersSelected, setEnergyFiltersSelected] = useState<Set<EnergyType>>(() => new Set());
  const [stageFiltersSelected, setStageFiltersSelected] = useState<Set<StageFilter>>(() => new Set());
  const [artFiltersSelected, setArtFiltersSelected] = useState<Set<ArtFilter>>(() => new Set());
  const [ownershipFiltersSelected, setOwnershipFiltersSelected] = useState<Set<OwnershipFilter>>(() => new Set());
  const [rarityFiltersSelected, setRarityFiltersSelected] = useState<Set<RarityFilter>>(() => new Set());
  const [sortOption, setSortOption] = useState<CardSortOption>(DEFAULT_CARD_SORT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoverPreviewCard, setHoverPreviewCard] = useState<Card | null>(null);
  const [hoverPreviewCardId, setHoverPreviewCardId] = useState<string | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const hoverPreviewTimeoutRef = useRef<number | null>(null);
  const filterMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const activeFilterCount = categoryFiltersSelected.size + energyFiltersSelected.size + stageFiltersSelected.size + artFiltersSelected.size + ownershipFiltersSelected.size + rarityFiltersSelected.size;

  const getOwnedCount = (cardId: string): number => {
    if (isDevForcedUnowned(cardId)) return 0;
    const value = ownedCardCounts?.[cardId];
    if (typeof value === "number") return value;
    if (devUnlocksEnabled) return 2;
    return starterCardCounts[cardId] ?? 0;
  };

  const isOwned = (cardId: string): boolean => getOwnedCount(cardId) > 0;

  const ownedCardCount = useMemo(
    () => cardEntries.filter((card) => isOwned(card.id)).length,
    [ownedCardCounts],
  );

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
    return sortCardsForCollection(filtered, sortOption, (card) => isOwned(card.id));
  }, [artFiltersSelected, categoryFiltersSelected, energyFiltersSelected, isOwned, ownershipFiltersSelected, query, rarityFiltersSelected, sortOption, stageFiltersSelected]);

  const clearFilters = () => {
    setCategoryFiltersSelected(new Set());
    setEnergyFiltersSelected(new Set());
    setStageFiltersSelected(new Set());
    setArtFiltersSelected(new Set());
    setOwnershipFiltersSelected(new Set());
    setRarityFiltersSelected(new Set());
  };

  const clearHoverPreviewTimer = () => {
    if (hoverPreviewTimeoutRef.current !== null) {
      window.clearTimeout(hoverPreviewTimeoutRef.current);
      hoverPreviewTimeoutRef.current = null;
    }
  };

  const scheduleHoverPreview = (card: Card, anchorEl: HTMLButtonElement) => {
    clearHoverPreviewTimer();
    hoverPreviewTimeoutRef.current = window.setTimeout(() => {
      const rect = anchorEl.getBoundingClientRect();
      const { left, top } = getHoverPreviewPosition(rect);
      setHoverPreviewCard(card);
      setHoverPreviewCardId(card.id);
      setHoverPreviewPosition({ left, top });
      hoverPreviewTimeoutRef.current = null;
    }, 500);
  };

  const hideHoverPreview = () => {
    clearHoverPreviewTimer();
    setHoverPreviewCard(null);
    setHoverPreviewCardId(null);
  };

  useEffect(() => () => clearHoverPreviewTimer(), []);

  const hoverPreviewActive = Boolean(hoverPreviewCard && hoverPreviewPosition);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filtersOpen) {
        event.preventDefault();
        setFiltersOpen(false);
        return;
      }
      event.preventDefault();
      onBack();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [filtersOpen, onBack]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!filtersOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (filterMenuWrapRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [filtersOpen]);

  return (
    <section style={cardBrowserShellStyle}>
      <header style={cardBrowserHeaderStyle}>
        <div>
          <div style={menuKickerStyle}>Cards</div>
          <h1 style={cardBrowserTitleStyle}>Browse available cards</h1>
          <p style={cardBrowserSubtitleStyle}>{visibleCards.length} of {cardEntries.length} cards shown • {ownedCardCount} owned</p>
        </div>
        <NeutralButton style={cardBrowserBackButtonStyle} onClick={onBack}>Back</NeutralButton>
      </header>

      <section style={filterPanelStyle}>
        <div style={searchToolbarStyle}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, type, ability, attack, or effect"
            aria-label="Search cards"
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
          <div ref={filterMenuWrapRef} style={filterMenuWrapStyle}>
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

      <section style={cardTrayStyle}>
        {visibleCards.length > 0 ? (
          <div style={cardGridStyle}>
            {visibleCards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                ownedCount={getOwnedCount(card.id)}
                onHoverStart={(anchorEl) => scheduleHoverPreview(card, anchorEl)}
                onHoverEnd={hideHoverPreview}
                previewActive={hoverPreviewCardId === card.id}
              />
            ))}
          </div>
        ) : (
          <div style={emptyStateStyle}>No cards match those filters.</div>
        )}
      </section>
      <div style={hoverDimStyle(hoverPreviewActive)} aria-hidden="true" />
      <aside
        style={hoverPreviewStyle(
          hoverPreviewPosition?.left ?? 0,
          hoverPreviewPosition?.top ?? 0,
          hoverPreviewActive,
        )}
        aria-hidden="true"
      >
        {hoverPreviewCard && (
          <HoloCardImage card={hoverPreviewCard} src={getCardImage(hoverPreviewCard)} alt="" imageStyle={hoverPreviewImageStyle} draggable={false} radiusOverride={CARD_INSPECT_IMAGE_RADIUS} />
        )}
      </aside>

    </section>
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
  onHoverStart,
  onHoverEnd,
  previewActive = false,
}: {
  card: Card;
  ownedCount: number;
  onHoverStart?: (anchorEl: HTMLButtonElement) => void;
  onHoverEnd?: () => void;
  previewActive?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const image = getCardImage(card);
  const rarity = getCardRarity(card);
  const hasHolo = rarity === "rare" || rarity === "doubleRare";
  const owned = ownedCount > 0;
  const ownershipLabel = owned ? `${ownedCount}x Owned` : "Unowned";

  return (
    <button
      type="button"
      style={{
        ...cardTileStyle(hovered),
        cursor: "default",
        ...(previewActive ? { position: "relative", zIndex: 10 } : {}),
      }}
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
      aria-label={formatCardName(card)}
    >
      <img style={cardImageStyle(owned)} src={image} alt="" draggable={false} />
      {hasHolo && (
        <>
          <span style={holoSparkleOverlayStyle(rarity)} aria-hidden="true" />
          <span style={holoSheenOverlayStyle(rarity)} aria-hidden="true" />
        </>
      )}
      <span style={rarityBadgeStyle(rarity)}>{CARD_RARITY_SHORT_LABELS[rarity]}</span>
      <span style={ownershipBadgeStyle(owned)}>{ownershipLabel}</span>
    </button>
  );
}

function toggleSetValue<T>(selected: Set<T>, value: T): Set<T> {
  const next = new Set(selected);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function matchesAnyCategoryFilter(card: Card, filters: Set<CategoryFilter>): boolean {
  for (const filter of filters) {
    if (matchesCategoryFilter(card, filter)) return true;
  }
  return false;
}

function matchesCategoryFilter(card: Card, filter: CategoryFilter): boolean {
  if (filter === "umamusume") return card.kind === "umamusume";
  if (filter === "trainer") return card.kind === "trainer";
  return card.kind === "trainer" && card.trainerType === filter;
}

function matchesAnyEnergyFilter(card: Card, filters: Set<EnergyType>): boolean {
  if (card.kind !== "umamusume") return true;
  return filters.has(toEnergyType(card.type));
}

function matchesAnyStageFilter(card: Card, filters: Set<StageFilter>): boolean {
  if (card.kind !== "umamusume") return true;
  return filters.has(card.stage as StageFilter);
}

function matchesAnyArtFilter(card: Card, filters: Set<ArtFilter>): boolean {
  return filters.has(isFullArtCard(card) ? "fullArt" : "normal");
}

function matchesAnyOwnershipFilter(
  card: Card,
  filters: Set<OwnershipFilter>,
  isOwned: (cardId: string) => boolean,
): boolean {
  return filters.has(isOwned(card.id) ? "owned" : "unowned");
}

function matchesAnyRarityFilter(card: Card, filters: Set<RarityFilter>): boolean {
  return filters.has(getCardRarity(card));
}

function getCardImage(card: Card): string {
  return card.kind === "umamusume" ? card.portrait : card.image;
}

function getCardSortGroup(card: Card): number {
  if (card.kind === "umamusume") return 0;
  if (card.trainerType === "item") return 1;
  if (card.trainerType === "tool") return 2;
  if (card.trainerType === "supporter") return 3;
  return 4;
}

function getSearchText(card: Card): string {
  if (card.kind === "trainer") {
    return [
      card.name,
      card.label,
      card.trainerType,
      trainerTypeLabel(card.trainerType),
      CARD_RARITY_LABELS[getCardRarity(card)],
      card.text,
    ].join(" ").toLowerCase();
  }

  return [
    card.name,
    card.label,
    card.species,
    card.type,
    CARD_RARITY_LABELS[getCardRarity(card)],
    card.evolvesFrom ?? "",
    card.ability?.name ?? "",
    card.ability?.text ?? "",
    card.attacks.map((attack) => `${attack.name} ${attack.text}`).join(" "),
  ].join(" ").toLowerCase();
}

function trainerTypeLabel(type: TrainerType): string {
  if (type === "supporter") return "Supporter";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function toEnergyType(type: UmamusumeType): EnergyType {
  return type.toLowerCase() as EnergyType;
}

const cardBrowserShellStyle: CSSProperties = {
  isolation: "isolate",
  maxWidth: 1320,
  margin: "0 auto",
  display: "grid",
  gap: 18,
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  height: "calc(100dvh - 32px)",
  boxSizing: "border-box",
  padding: "18px 0 16px",
};

const cardBrowserHeaderStyle: CSSProperties = {
  ...glassPanelStyle,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: 18,
};

const menuKickerStyle: CSSProperties = {
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const cardBrowserTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 950,
};

const cardBrowserSubtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 15,
  fontWeight: 800,
};

const cardBrowserBackButtonStyle: CSSProperties = {
  padding: "0 16px",
  height: 44,
};

const filterPanelStyle: CSSProperties = {
  ...glassPanelStyle,
  position: "relative",
  zIndex: 4,
  display: "grid",
  gap: 10,
  padding: 14,
};

const searchToolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  gap: 10,
  alignItems: "center",
};

const sortControlGroupStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const sortSelectStyle: CSSProperties = {
  height: 46,
  minWidth: 126,
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(245, 248, 245, 0.94)",
  color: colors.black,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 900,
  outline: "none",
  boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
};

function sortDirectionButtonStyle(enabled: boolean): CSSProperties {
  return {
    height: 46,
    minWidth: 64,
    borderRadius: radius.md,
    border: enabled ? "1px solid rgba(0, 0, 0, 0.42)" : borders.neutralStrong,
    background: enabled ? "rgba(245, 248, 245, 0.94)" : "rgba(238, 243, 238, 0.62)",
    color: enabled ? colors.black : "rgba(0, 0, 0, 0.48)",
    fontSize: 12,
    fontWeight: 950,
    cursor: enabled ? "pointer" : "not-allowed",
    boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
  };
}

const searchInputStyle: CSSProperties = {
  width: "100%",
  height: 46,
  boxSizing: "border-box",
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(245, 248, 245, 0.94)",
  color: colors.black,
  outline: "none",
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
};

const filterMenuWrapStyle: CSSProperties = {
  position: "relative",
};

function filterMenuButtonStyle(active: boolean): CSSProperties {
  return {
    height: 46,
    minWidth: 104,
    padding: "0 14px",
    borderRadius: radius.md,
    border: active ? "1px solid rgba(0, 0, 0, 0.58)" : borders.neutralStrong,
    background: active ? colors.black : "rgba(245, 248, 245, 0.94)",
    color: active ? colors.white : colors.black,
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 12px 28px rgba(17, 24, 39, 0.22)" : "0 10px 24px rgba(17, 24, 39, 0.08)",
    transition: `background ${transitions.base}, border-color ${transitions.base}, color ${transitions.base}, box-shadow ${transitions.base}`,
  };
}

const filterPopoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  zIndex: 30,
  width: "min(255px, calc(100vw - 48px))",
  display: "grid",
  gap: 14,
  padding: 12,
  maxHeight: "min(560px, calc(100dvh - 190px))",
  overflowY: "auto",
  borderRadius: radius.md,
  border: borders.glassStrong,
  background: "rgba(238, 243, 238, 0.96)",
  boxShadow: "0 22px 56px rgba(17, 24, 39, 0.22)",
  color: colors.black,
  textShadow: "none",
};

const filterPopoverHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const filterPopoverTitleStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 950,
};

function clearFiltersButtonStyle(enabled: boolean): CSSProperties {
  return {
    height: 28,
    padding: "0 10px",
    borderRadius: radius.md,
    border: enabled ? "1px solid rgba(0, 0, 0, 0.42)" : borders.neutralStrong,
    background: enabled ? colors.black : "rgba(245, 248, 245, 0.76)",
    color: enabled ? colors.white : "rgba(0, 0, 0, 0.52)",
    fontSize: 11,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}

const filterGroupStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const filterGroupLabelStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const filterOptionGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const energyFilterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 42px)",
  gap: 9,
};

function filterChipStyle(active: boolean): CSSProperties {
  return {
    height: 34,
    padding: "0 12px",
    borderRadius: radius.md,
    border: active ? "1px solid rgba(0, 0, 0, 0.58)" : borders.neutralStrong,
    background: active ? colors.black : "rgba(245, 248, 245, 0.9)",
    color: active ? colors.white : colors.black,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 10px 24px rgba(17, 24, 39, 0.18)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
    transition: `background ${transitions.base}, border-color ${transitions.base}, color ${transitions.base}, box-shadow ${transitions.base}`,
  };
}

function energyFilterButtonStyle(active: boolean): CSSProperties {
  return {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: radius.circle,
    border: active ? "2px solid rgba(0, 0, 0, 0.68)" : "1px solid rgba(255, 255, 255, 0.9)",
    background: active ? "rgba(245, 248, 245, 0.98)" : "rgba(238, 243, 238, 0.66)",
    cursor: "pointer",
    boxShadow: active ? "0 12px 26px rgba(17, 24, 39, 0.22)" : "0 8px 18px rgba(17, 24, 39, 0.1)",
    padding: 0,
    transition: `border-color ${transitions.base}, box-shadow ${transitions.base}, background ${transitions.base}`,
  };
}

const cardTrayStyle: CSSProperties = {
  ...glassPanelStyle,
  position: "relative",
  zIndex: 0,
  backdropFilter: "none",
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
  padding: 12,
  boxSizing: "border-box",
};

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(146px, 1fr))",
  gap: 8,
  alignItems: "start",
};

function cardTileStyle(hovered: boolean): CSSProperties {
  return {
    display: "block",
    position: "relative",
    overflow: "hidden",
    minWidth: 0,
    border: 0,
    borderRadius: radius.md,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    filter: hovered ? "drop-shadow(0 18px 26px rgba(17, 24, 39, 0.24))" : "drop-shadow(0 10px 18px rgba(17, 24, 39, 0.14))",
    transform: hovered ? "translateY(-6px) rotate(0.6deg) scale(1.018)" : "translateY(0) rotate(0deg) scale(1)",
    transition: `transform ${transitions.slow}, filter ${transitions.slow}`,
  };
}

function cardImageStyle(owned: boolean): CSSProperties {
  return {
    width: "100%",
    aspectRatio: CARD_ASPECT_RATIO,
    objectFit: "contain",
    display: "block",
    borderRadius: radius.md,
    filter: owned ? "none" : "grayscale(1) saturate(0.24) brightness(0.72)",
    opacity: owned ? 1 : 0.58,
    transition: `filter ${transitions.base}, opacity ${transitions.base}`,
  };
}

function ownershipBadgeStyle(owned: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: radius.pill,
    border: owned ? "1px solid rgba(45, 212, 191, 0.72)" : "1px solid rgba(255, 255, 255, 0.56)",
    background: owned ? "rgba(13, 148, 136, 0.88)" : "rgba(31, 41, 55, 0.78)",
    color: colors.white,
    textShadow: uiTextShadow,
    padding: "4px 8px",
    fontSize: 10,
    fontWeight: 950,
    textTransform: "uppercase",
    pointerEvents: "none",
    boxShadow: "0 8px 18px rgba(17, 24, 39, 0.24)",
  };
}

function rarityBadgeStyle(rarity: ReturnType<typeof getCardRarity>): CSSProperties {
  const palette: Record<ReturnType<typeof getCardRarity>, { border: string; background: string; color: string }> = {
    common: {
      border: "1px solid rgba(255, 255, 255, 0.64)",
      background: "rgba(31, 41, 55, 0.76)",
      color: colors.white,
    },
    uncommon: {
      border: "1px solid rgba(52, 211, 153, 0.72)",
      background: "rgba(6, 95, 70, 0.86)",
      color: colors.white,
    },
    rare: {
      border: "1px solid rgba(96, 165, 250, 0.78)",
      background: "rgba(30, 64, 175, 0.86)",
      color: colors.white,
    },
    doubleRare: {
      border: "1px solid rgba(250, 204, 21, 0.86)",
      background: "rgba(133, 77, 14, 0.9)",
      color: "#fff7cc",
    },
  };
  const color = palette[rarity];
  return {
    position: "absolute",
    right: 8,
    bottom: 8,
    minWidth: 24,
    borderRadius: radius.pill,
    border: color.border,
    background: color.background,
    color: color.color,
    textShadow: uiTextShadow,
    padding: "4px 7px",
    fontSize: 10,
    fontWeight: 950,
    textTransform: "uppercase",
    pointerEvents: "none",
    boxShadow: "0 8px 18px rgba(17, 24, 39, 0.24)",
  };
}

function hoverDimStyle(active: boolean): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    pointerEvents: "none",
    background: "rgba(17, 24, 39, 0.34)",
    opacity: active ? 1 : 0,
    transition: `opacity ${transitions.base}`,
  };
}

function hoverPreviewStyle(left: number, top: number, active: boolean): CSSProperties {
  return {
    position: "fixed",
    left,
    top,
    transform: "translateY(-50%)",
    width: "min(440px, calc(100vw - 36px))",
    pointerEvents: "none",
    zIndex: 50,
    borderRadius: 0,
    background: "transparent",
    padding: 0,
    opacity: active ? 1 : 0,
    transition: `opacity ${transitions.base}`,
  };
}

const hoverPreviewImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: CARD_ASPECT_RATIO,
  objectFit: "contain",
  borderRadius: radius.md,
  display: "block",
  filter: "drop-shadow(0 24px 64px rgba(17, 24, 39, 0.34))",
};

function holoSparkleOverlayStyle(rarity: ReturnType<typeof getCardRarity>): CSSProperties {
  const isUltraRare = rarity === "doubleRare";

  return {
    position: "absolute",
    inset: 0,
    borderRadius: radius.md,
    pointerEvents: "none",
    background: isUltraRare
      ? "radial-gradient(circle at 16% 18%, rgba(255, 255, 255, 0.72) 0 0.8px, rgba(255, 231, 122, 0.24) 1.4px, transparent 3px), radial-gradient(circle at 74% 24%, rgba(142, 235, 255, 0.58) 0 0.9px, rgba(255, 115, 210, 0.2) 1.5px, transparent 3.2px), radial-gradient(circle at 38% 72%, rgba(255, 255, 255, 0.62) 0 0.8px, rgba(112, 255, 199, 0.2) 1.4px, transparent 3px), radial-gradient(circle at 86% 82%, rgba(255, 166, 229, 0.54) 0 0.8px, transparent 3px), radial-gradient(circle at 28% 48%, rgba(255, 255, 180, 0.5) 0 0.7px, transparent 2.8px), radial-gradient(circle at 62% 58%, rgba(139, 255, 226, 0.42) 0 0.7px, transparent 2.8px), radial-gradient(circle at 48% 30%, rgba(255, 150, 235, 0.44) 0 0.7px, transparent 2.8px)"
      : "radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.52) 0 0.8px, rgba(202, 232, 247, 0.18) 1.4px, transparent 3px), radial-gradient(circle at 72% 66%, rgba(255, 255, 255, 0.42) 0 0.8px, rgba(202, 232, 247, 0.14) 1.4px, transparent 3px), radial-gradient(circle at 42% 38%, rgba(255, 255, 255, 0.36) 0 0.7px, transparent 2.8px)",
    backgroundRepeat: "no-repeat",
    mixBlendMode: "screen",
    animation: isUltraRare ? "card-holo-sparkle-pulse 4.8s ease-in-out infinite" : "card-holo-sparkle-pulse 6s ease-in-out infinite",
  };
}

function holoSheenOverlayStyle(rarity: ReturnType<typeof getCardRarity>): CSSProperties {
  const isUltraRare = rarity === "doubleRare";

  return {
    position: "absolute",
    top: "-70%",
    bottom: "-70%",
    left: "-82%",
    width: "170%",
    pointerEvents: "none",
    borderRadius: "44%",
    background: isUltraRare
      ? "linear-gradient(90deg, black 0%, black 18%, hsl(314, 45%, 28%) 34%, hsl(52, 72%, 72%) 50%, hsl(188, 58%, 66%) 62%, hsl(270, 48%, 36%) 76%, black 92%, black 100%)"
      : "linear-gradient(90deg, black 0%, black 24%, hsl(210, 14%, 26%) 40%, hsl(198, 70%, 78%) 54%, hsl(245, 34%, 68%) 68%, black 86%, black 100%)",
    mixBlendMode: "color-dodge",
    opacity: isUltraRare ? 0.38 : 0.24,
    animation: isUltraRare ? "card-holo-shimmer-contained 6s linear infinite" : "card-holo-shimmer-contained 8s linear infinite",
  };
}

const emptyStateStyle: CSSProperties = {
  padding: 18,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 15,
  fontWeight: 900,
  textAlign: "center",
};
