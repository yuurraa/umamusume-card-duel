import { useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getCard } from "../../game/engine";
import { energyLabel, formatCardName } from "../../game/engine/core/labels";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { borders, colors, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle, radius, transitions } from "../../styles/shared";
import { energyTypes, getSearchText, stageFilters, toggleSetValue, type StageFilter } from "../../screens/deck-browser/helpers";
import {
  clearFiltersButtonStyle,
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
} from "../../screens/deck-browser/styles";
import type { EnergyType, UmamusumeCard } from "../../../../shared/src/types";

type DeckChoiceOption = {
  deckIndex: number;
  cardId: string;
  card: UmamusumeCard;
};

type DeckChoiceSortKey = "deck" | "name" | "stage" | "type";
type SortDirection = "asc" | "desc";

const deckChoiceSorts: Array<{ id: DeckChoiceSortKey; label: string }> = [
  { id: "deck", label: "Deck Order" },
  { id: "name", label: "Name" },
  { id: "stage", label: "Stage" },
  { id: "type", label: "Type" },
];

export function DeckChoiceModal({
  cardIds,
  filter = "umamusume",
  evolvesFrom,
  stage,
  onChoose,
  onClose,
}: {
  cardIds: string[];
  filter?: "umamusume" | "evolutionUmamusume";
  evolvesFrom?: string | undefined;
  stage?: number | undefined;
  onChoose: (deckIndex: number) => void;
  onClose: () => void;
}) {
  const options = cardIds.flatMap((cardId, deckIndex) => {
    const card = getCard(cardId);
    if (card.kind !== "umamusume") return [];
    if (filter === "evolutionUmamusume" && card.stage <= 0) return [];
    if (evolvesFrom !== undefined && card.evolvesFrom !== evolvesFrom) return [];
    if (stage !== undefined && card.stage !== stage) return [];
    return [{ deckIndex, cardId, card }];
  });
  const deckScrollerClassName = `deck-scroller-${useId().replace(/:/g, "")}`;
  const deckScrollRef = useRef<HTMLDivElement | null>(null);
  const deckPanRef = useRef<{ active: boolean; pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [isDeckPanning, setIsDeckPanning] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<DeckChoiceSortKey>("deck");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stageFiltersSelected, setStageFiltersSelected] = useState<Set<StageFilter>>(new Set());
  const [energyFiltersSelected, setEnergyFiltersSelected] = useState<Set<EnergyType>>(new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const activeFilterCount = stageFiltersSelected.size + energyFiltersSelected.size;
  const visibleOptions = sortDeckChoiceOptions(
    options.filter((option) => {
      if (stageFiltersSelected.size > 0 && !stageFiltersSelected.has(option.card.stage as StageFilter)) return false;
      if (energyFiltersSelected.size > 0 && !energyFiltersSelected.has(option.card.type.toLowerCase() as EnergyType)) return false;
      if (normalizedQuery && !getSearchText(option.card).includes(normalizedQuery)) return false;
      return true;
    }),
    sortKey,
    sortDirection,
  );

  const clearFilters = () => {
    setStageFiltersSelected(new Set());
    setEnergyFiltersSelected(new Set());
  };

  const stopDeckPan = () => {
    deckPanRef.current = null;
    setIsDeckPanning(false);
  };

  const handleDeckPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = deckScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    deckPanRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    setIsDeckPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleDeckPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = deckPanRef.current;
    const container = deckScrollRef.current;
    if (!pan || !container || !pan.active || pan.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    container.scrollLeft = pan.startScrollLeft - deltaX;
  };

  const handleDeckPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pan = deckPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    stopDeckPan();
  };

  return (
    <div style={deckBackdropStyle} onClick={onClose}>
      <section style={deckModalStyle} onClick={(event) => event.stopPropagation()}>
        <style>{`.${deckScrollerClassName}{scrollbar-width:none;-ms-overflow-style:none;}.${deckScrollerClassName}::-webkit-scrollbar{display:none;width:0;height:0;}`}</style>
        <header style={deckHeaderStyle}>
          <div>
            <div style={deckKickerStyle}>Deck</div>
            <h2 style={deckTitleStyle}>{visibleOptions.length} of {options.length} {options.length === 1 ? "card" : "cards"}</h2>
          </div>
          <NeutralButton style={closeButtonStyle} onClick={onClose}>Back</NeutralButton>
        </header>
        <div style={searchToolbarStyle}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deck"
            aria-label="Search selectable deck cards"
            style={searchInputStyle}
          />
          <div style={sortControlGroupStyle}>
            <select
              value={sortKey}
              aria-label="Sort selectable deck cards"
              style={sortSelectStyle}
              onChange={(event) => setSortKey(event.target.value as DeckChoiceSortKey)}
            >
              {deckChoiceSorts.map((sort) => (
                <option key={sort.id} value={sort.id}>{sort.label}</option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Toggle sort direction"
              style={sortDirectionButtonStyle(sortKey !== "deck")}
              disabled={sortKey === "deck"}
              onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
            >
              {sortDirection === "asc" ? "Asc" : "Desc"}
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
                  <div style={filterGroupLabelStyle}>Stage</div>
                  <div style={filterOptionGridStyle}>
                    {stageFilters.map((stageFilter) => (
                      <FilterChip
                        key={stageFilter.id}
                        active={stageFiltersSelected.has(stageFilter.id)}
                        onClick={() => setStageFiltersSelected((selected) => toggleSetValue(selected, stageFilter.id))}
                      >
                        {stageFilter.label}
                      </FilterChip>
                    ))}
                  </div>
                </div>
                <div style={filterGroupStyle}>
                  <div style={filterGroupLabelStyle}>Type</div>
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
        {options.length === 0 ? (
          <div style={emptyDeckStyle}>No Umamusume can be selected from your deck.</div>
        ) : visibleOptions.length === 0 ? (
          <div style={emptyDeckStyle}>No cards match those filters.</div>
        ) : (
          <div
            ref={deckScrollRef}
            className={deckScrollerClassName}
            style={{ ...deckGridStyle, cursor: isDeckPanning ? "grabbing" : "grab" }}
            onPointerDown={handleDeckPointerDown}
            onPointerMove={handleDeckPointerMove}
            onPointerUp={handleDeckPointerUp}
            onPointerCancel={stopDeckPan}
            onPointerLeave={stopDeckPan}
          >
            {visibleOptions.map((option) => (
              <DeckChoiceCardButton
                key={`${option.cardId}-${option.deckIndex}`}
                option={option}
                onChoose={onChoose}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function sortDeckChoiceOptions(options: DeckChoiceOption[], sortKey: DeckChoiceSortKey, direction: SortDirection): DeckChoiceOption[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...options].sort((left, right) => {
    if (sortKey === "deck") return left.deckIndex - right.deckIndex;
    if (sortKey === "name") return (formatCardName(left.card).localeCompare(formatCardName(right.card)) || left.deckIndex - right.deckIndex) * multiplier;
    if (sortKey === "stage") return (left.card.stage - right.card.stage || formatCardName(left.card).localeCompare(formatCardName(right.card)) || left.deckIndex - right.deckIndex) * multiplier;
    return (left.card.type.localeCompare(right.card.type) || formatCardName(left.card).localeCompare(formatCardName(right.card)) || left.deckIndex - right.deckIndex) * multiplier;
  });
}

function DeckChoiceCardButton({ option, onChoose }: { option: DeckChoiceOption; onChoose: (deckIndex: number) => void }) {
  const card = option.card;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Choose ${card.name}`}
      style={deckCardButtonStyle(hovered)}
      onClick={() => onChoose(option.deckIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <HoloCardImage card={card} src={card.portrait} alt="" imageStyle={deckCardImageStyle} draggable={false} />
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" style={filterChipStyle(active)} onClick={onClick}>
      {children}
    </button>
  );
}

const deckBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 48,
};

const deckModalStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(1000px, calc(100vw - 64px))",
  maxHeight: "min(430px, calc(100vh - 64px))",
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
  gap: 12,
  padding: 16,
  background: colors.glassOverlay,
  color: colors.black,
  textShadow: "none",
};

const deckHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const deckTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: colors.black,
  textShadow: "none",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const deckKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

const closeButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 76,
};

const deckGridStyle: CSSProperties = {
  minHeight: 0,
  height: 220,
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 6px 12px",
};

function deckCardButtonStyle(hovered: boolean): CSSProperties {
  return {
    flex: "0 0 auto",
    width: 140,
    height: 196,
    border: 0,
    borderRadius: radius.md,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    filter: hovered ? "drop-shadow(0 18px 22px rgba(17, 24, 39, 0.18)) saturate(1.06)" : "drop-shadow(0 12px 18px rgba(17, 24, 39, 0.12))",
    transform: hovered ? "translateY(-8px) rotate(0.6deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
    transition: `transform ${transitions.card}, filter ${transitions.card}`,
  };
}

const deckCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const emptyDeckStyle: CSSProperties = {
  borderRadius: radius.md,
  border: borders.neutralDashed,
  background: "rgba(238, 243, 238, 0.86)",
  color: colors.black,
  textShadow: "none",
  padding: 18,
  fontSize: 14,
  fontWeight: 850,
  textAlign: "center",
};
