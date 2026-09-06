import type { Dispatch, SetStateAction } from "react";
import { DeckBrowserCreateTile, DeckBrowserTile } from "./components";
import { DECK_CARD_COUNT, toggleSetValue, type DeckEntity } from "./helpers";
import { getEditDraftKeyForDeck, toDeckFavoriteKey, type DeckEditorDraft, type DeckRef } from "./model";
import { deckBrowserDeckTrayStyle, deckBrowserGridStyle } from "./styles";

type DeckBrowserDeckGridProps = {
  visibleDecks: Array<DeckEntity & { source: DeckRef["source"] }>;
  equippedDeckId: string;
  editDraftByDeckId: Record<string, DeckEditorDraft>;
  favoriteDeckKeys: Set<string>;
  setFavoriteDeckKeys: Dispatch<SetStateAction<Set<string>>>;
  setOpenedDeckRef: Dispatch<SetStateAction<DeckRef | null>>;
  customDecksEnabled: boolean;
  onCreate: (blankCardIds: Array<string | null>) => void;
};

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
        {visibleDecks.map((deck) => {
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
                setFavoriteDeckKeys((current) => toggleSetValue(current, key));
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
