import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { cards } from "../../../shared/src/gameData";
import type { Card, EnergyType, TrainerType, UmamusumeType } from "../../../shared/src/types";
import { EnergyIcon } from "../components/cards/EnergyIcon";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { energyLabel } from "../game/engine";
import { formatCardName } from "../game/engine/core/labels";
import { CARD_ASPECT_RATIO, borders, colors, glassPanelStyle, overlayBackdropStyle, radius, transitions, uiTextColor, uiTextShadow } from "../styles/shared";

type CategoryFilter = "umamusume" | "trainer" | "item" | "tool" | "stadium";
type StageFilter = 0 | 1 | 2;
type ArtFilter = "normal" | "fullArt";

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

const cardEntries = Object.values(cards).sort((left, right) => {
  const groupSort = getCardSortGroup(left) - getCardSortGroup(right);
  if (groupSort !== 0) return groupSort;
  return formatCardName(left).localeCompare(formatCardName(right));
});

export function CardBrowserScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [categoryFiltersSelected, setCategoryFiltersSelected] = useState<Set<CategoryFilter>>(() => new Set());
  const [energyFiltersSelected, setEnergyFiltersSelected] = useState<Set<EnergyType>>(() => new Set());
  const [stageFiltersSelected, setStageFiltersSelected] = useState<Set<StageFilter>>(() => new Set());
  const [artFiltersSelected, setArtFiltersSelected] = useState<Set<ArtFilter>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<Card | null>(null);
  const filterMenuWrapRef = useRef<HTMLDivElement | null>(null);
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

  const clearFilters = () => {
    setCategoryFiltersSelected(new Set());
    setEnergyFiltersSelected(new Set());
    setStageFiltersSelected(new Set());
    setArtFiltersSelected(new Set());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (inspectedCard) {
        event.preventDefault();
        setInspectedCard(null);
        return;
      }
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
  }, [filtersOpen, inspectedCard, onBack]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!filtersOpen || inspectedCard) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (filterMenuWrapRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [filtersOpen, inspectedCard]);

  return (
    <section style={cardBrowserShellStyle}>
      <header style={cardBrowserHeaderStyle}>
        <div>
          <div style={menuKickerStyle}>Cards</div>
          <h1 style={cardBrowserTitleStyle}>Browse available cards</h1>
          <p style={cardBrowserSubtitleStyle}>{visibleCards.length} of {cardEntries.length} cards shown</p>
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
              <CardTile key={card.id} card={card} onInspect={() => setInspectedCard(card)} />
            ))}
          </div>
        ) : (
          <div style={emptyStateStyle}>No cards match those filters.</div>
        )}
      </section>

      {inspectedCard && (
        <CardInspectModal card={inspectedCard} onClose={() => setInspectedCard(null)} />
      )}
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

function CardTile({ card, onInspect }: { card: Card; onInspect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const image = getCardImage(card);

  return (
    <button
      type="button"
      style={cardTileStyle(hovered)}
      onClick={onInspect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={`Inspect ${formatCardName(card)}`}
    >
      <img style={cardImageStyle} src={image} alt="" draggable={false} />
    </button>
  );
}

function CardInspectModal({ card, onClose }: { card: Card; onClose: () => void }) {
  return (
    <div style={inspectBackdropStyle} onClick={onClose}>
      <section style={inspectSurfaceStyle} onClick={(event) => event.stopPropagation()}>
        <img style={inspectImageStyle} src={getCardImage(card)} alt="" draggable={false} />
      </section>
    </div>
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

function isFullArtCard(card: Card): boolean {
  const image = getCardImage(card);
  return card.id.endsWith("FullArt") || image.includes("-fullart.");
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
      card.text,
    ].join(" ").toLowerCase();
  }

  return [
    card.name,
    card.label,
    card.species,
    card.type,
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
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
};

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
  zIndex: 1,
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

const cardImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: CARD_ASPECT_RATIO,
  objectFit: "contain",
  display: "block",
  borderRadius: radius.md,
};

const emptyStateStyle: CSSProperties = {
  padding: 18,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 15,
  fontWeight: 900,
  textAlign: "center",
};

const inspectBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 65,
};

const inspectSurfaceStyle: CSSProperties = {
  position: "relative",
  width: "min(520px, calc(100vw - 32px))",
  display: "grid",
  placeItems: "center",
};

const inspectImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: "90vh",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
  boxShadow: "0 32px 100px rgba(0, 0, 0, 0.44)",
};
