import { DeckBrowserCreateTile, DeckBrowserTile } from "./components";
import { DECK_CARD_COUNT, toggleSetValue } from "./helpers";
import { getEditDraftKeyForDeck, toDeckFavoriteKey } from "./model";
import { deckBrowserDeckTrayStyle, deckBrowserGridStyle } from "./styles";

type DeckBrowserDeckGridProps = Record<string, any>;

export function DeckBrowserDeckGrid({
  visibleDecks,
  equippedDeckId,
  editDraftByDeckId,
  favoriteDeckKeys,
  setFavoriteDeckKeys,
  setOpenedDeckRef,
  customDecksEnabled,
  onCreate,
}: DeckBrowserDeckGridProps) {
  return (
    <div style={deckBrowserDeckTrayStyle}>
      <div style={deckBrowserGridStyle}>
        {visibleDecks.map((deck: any) => {
          const equipped = deck.source !== "draft" && deck.id === equippedDeckId;
          const hasDraft = deck.source === "draft" || Boolean(editDraftByDeckId[getEditDraftKeyForDeck(deck)]);
          const favorite = favoriteDeckKeys.has(toDeckFavoriteKey(deck));
          return (
            <DeckBrowserTile
              key={`${deck.source}-${deck.id}`}
              deck={deck}
              equipped={equipped}
              isDraft={hasDraft}
              favorite={favorite}
              label={deck.source === "premade" ? "Premade Deck" : deck.source === "premadeEdited" ? "Premade Deck (Edited)" : hasDraft ? "Draft Deck" : "Created Deck"}
              onOpen={() => setOpenedDeckRef({ id: deck.id, source: deck.source })}
              onToggleFavorite={() => {
                const key = toDeckFavoriteKey(deck);
                setFavoriteDeckKeys((current: Set<string>) => toggleSetValue(current, key));
              }}
            />
          );
        })}
        {customDecksEnabled && (
          <DeckBrowserCreateTile
            onOpen={() => onCreate(Array.from({ length: DECK_CARD_COUNT }, () => null as string | null))}
          />
        )}
      </div>
    </div>
  );
}
