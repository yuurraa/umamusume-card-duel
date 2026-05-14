import type { CSSProperties } from "react";
import type { EnergyType } from "../../../../shared/src/types";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { energyLabel } from "../../game/engine/core/labels";
import { energyTypes, toggleSetValue } from "./helpers";
import { deckListFilters, deckListSorts, type DeckListSortKey } from "./model";
import {
  clearFiltersButtonStyle,
  deckBrowserFilterPanelStyle,
  energyFilterButtonStyle,
  energyFilterGridStyle,
  filterChipStyle,
  filterGroupLabelStyle,
  filterGroupStyle,
  filterMenuButtonStyle,
  filterMenuWrapStyle,
  filterPopoverHeaderStyle,
  filterPopoverStyle,
  filterPopoverTitleStyle,
  searchInputStyle,
  searchToolbarStyle,
  sortControlGroupStyle,
  sortDirectionButtonStyle,
  sortSelectStyle,
} from "./styles";

type DeckBrowserFiltersProps = Record<string, any>;

export function DeckBrowserFilters({
  deckQuery,
  setDeckQuery,
  deckSortKey,
  setDeckSortKey,
  deckSortDirection,
  setDeckSortDirection,
  deckFiltersOpen,
  setDeckFiltersOpen,
  activeDeckFilterCount,
  deckFilter,
  setDeckFilter,
  deckEnergyFiltersSelected,
  setDeckEnergyFiltersSelected,
}: DeckBrowserFiltersProps) {
  return (
    <section style={deckBrowserFilterPanelStyle}>
      <div style={searchToolbarStyle}>
        <input
          value={deckQuery}
          onChange={(event) => setDeckQuery(event.target.value)}
          placeholder="Search decks"
          aria-label="Search decks"
          style={searchInputStyle}
        />
        <div style={sortControlGroupStyle}>
          <select
            value={deckSortKey}
            aria-label="Sort decks"
            style={sortSelectStyle}
            onChange={(event) => setDeckSortKey(event.target.value as DeckListSortKey)}
          >
            {deckListSorts.map((sort) => (
              <option key={sort.id} value={sort.id}>{sort.label}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Toggle deck sort direction"
            style={sortDirectionButtonStyle(deckSortKey !== "recommended")}
            disabled={deckSortKey === "recommended"}
            onClick={() => setDeckSortDirection((current: "asc" | "desc") => (current === "asc" ? "desc" : "asc"))}
          >
            {deckSortDirection === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
        <div style={filterMenuWrapStyle}>
          <button
            type="button"
            aria-expanded={deckFiltersOpen}
            aria-haspopup="menu"
            style={filterMenuButtonStyle(deckFiltersOpen || activeDeckFilterCount > 0)}
            onClick={() => setDeckFiltersOpen((open: boolean) => !open)}
          >
            Filters{activeDeckFilterCount > 0 ? ` (${activeDeckFilterCount})` : ""}
          </button>
          {deckFiltersOpen && (
            <div style={filterPopoverStyle} role="menu">
              <div style={filterPopoverHeaderStyle}>
                <div style={filterPopoverTitleStyle}>Deck Filters</div>
                <button
                  type="button"
                  style={clearFiltersButtonStyle(activeDeckFilterCount > 0)}
                  disabled={activeDeckFilterCount === 0}
                  onClick={() => {
                    setDeckFilter(null);
                    setDeckEnergyFiltersSelected(new Set());
                  }}
                >
                  Clear
                </button>
              </div>
              <div style={filterGroupStyle}>
                <div style={filterGroupLabelStyle}>Deck Type</div>
                <div style={deckFilterOptionGridStyle}>
                  {deckListFilters.map((filter) => (
                    <DeckFilterChip
                      key={filter.id}
                      active={deckFilter === filter.id}
                      onClick={() => setDeckFilter((current: string | null) => (current === filter.id ? null : filter.id))}
                    >
                      {filter.label}
                    </DeckFilterChip>
                  ))}
                </div>
              </div>
              <div style={filterGroupStyle}>
                <div style={filterGroupLabelStyle}>Energy</div>
                <div style={energyFilterGridStyle}>
                  {energyTypes.map((type: EnergyType) => (
                    <button
                      key={type}
                      type="button"
                      aria-label={`${energyLabel(type)} filter`}
                      title={energyLabel(type)}
                      style={energyFilterButtonStyle(deckEnergyFiltersSelected.has(type))}
                      onClick={() => setDeckEnergyFiltersSelected((selected: Set<EnergyType>) => toggleSetValue(selected, type))}
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
  );
}

function DeckFilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" style={filterChipStyle(active)} onClick={onClick}>
      {children}
    </button>
  );
}

const deckFilterOptionGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;
