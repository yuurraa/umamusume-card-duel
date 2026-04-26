import cardsDataRaw from "./data/cards.json";
import premadeDecksDataRaw from "./data/premadeDecks.json";
import type { Card, EnergyType, GameData, PremadeDeck } from "./types";

export const MAX_POINTS = 3;
export const MAX_BENCH = 3;
export const MAX_HAND = 10;
export const OPENING_HAND = 5;

type CardsDataFile = {
  weaknessBonus: number;
  fullArtSuffix: string;
  fullArtBaseCardIds: string[];
  baseCards: Record<string, Card>;
};

type PremadeDecksDataFile = {
  defaultPlayerDeckId: string;
  defaultAiOpponentDeckId: string;
  premadeDecks: PremadeDeck[];
  aiPremadeDecks: PremadeDeck[];
};

const cardsData = cardsDataRaw as CardsDataFile;
const premadeDecksData = premadeDecksDataRaw as PremadeDecksDataFile;

export const WEAKNESS_BONUS = cardsData.weaknessBonus;
const FULL_ART_SUFFIX = cardsData.fullArtSuffix;

export const energyImages: Record<EnergyType, string> = {
  grass: "/assets/energy/grass-energy.png",
  fire: "/assets/energy/fire-energy.png",
  water: "/assets/energy/water-energy.png",
  lightning: "/assets/energy/lightning-energy.png",
  psychic: "/assets/energy/psychic-energy.png",
  fighting: "/assets/energy/fighting-energy.png",
  darkness: "/assets/energy/darkness-energy.png",
  steel: "/assets/energy/steel-energy.png",
  colorless: "/assets/energy/colorless-energy.png",
  dragon: "/assets/energy/dragon-energy.png",
};

const baseCards = cardsData.baseCards;
const fullArtBaseCardIds = cardsData.fullArtBaseCardIds;
const starterCardIds = new Set(
  premadeDecksData.premadeDecks.flatMap((deck) => [deck.coverCardId, ...deck.cardIds]),
);

export const allCards = withFullArtVariants(baseCards, fullArtBaseCardIds);
export const ownedStarterCardIds: ReadonlySet<string> = starterCardIds;
export const cards = allCards;

function withFullArtVariants(sourceCards: Record<string, Card>, baseCardIds: readonly string[]): Record<string, Card> {
  const nextCards: Record<string, Card> = { ...sourceCards };

  baseCardIds.forEach((baseCardId) => {
    const baseCard = sourceCards[baseCardId];
    if (!baseCard) return;
    const fullArtCardId = `${baseCardId}FullArt`;
    if (baseCard.kind === "umamusume") {
      nextCards[fullArtCardId] = {
        ...baseCard,
        id: fullArtCardId,
        portrait: toFullArtAssetPath(baseCard.portrait),
      };
      return;
    }
    nextCards[fullArtCardId] = {
      ...baseCard,
      id: fullArtCardId,
      image: toFullArtAssetPath(baseCard.image),
    };
  });

  return nextCards;
}

function toFullArtAssetPath(assetPath: string): string {
  return assetPath.endsWith(".png")
    ? assetPath.slice(0, -4) + `${FULL_ART_SUFFIX}.png`
    : `${assetPath}${FULL_ART_SUFFIX}`;
}

export const premadeDecks = premadeDecksData.premadeDecks;
export const aiPremadeDecks = premadeDecksData.aiPremadeDecks;

export const defaultPlayerDeckId = premadeDecksData.defaultPlayerDeckId;
export const defaultAiOpponentDeckId = premadeDecksData.defaultAiOpponentDeckId;

function getDeckListById(deckId: string, decks: PremadeDeck[] = premadeDecks): string[] {
  return decks.find((deck) => deck.id === deckId)?.cardIds ?? [];
}

export const matikanetannhauserDeckList = getDeckListById("matikanetannhauser");
export const riceShowerDeckList = getDeckListById("riceShower");
export const matikanetannhauserNiceNatureDeckList = getDeckListById("matikanetannhauserNiceNature", aiPremadeDecks);
export const riceShowerHaruUraraDeckList = getDeckListById("riceShowerHaruUrara", aiPremadeDecks);
export const mihonoBourbonNishinoFlowerDeckList = getDeckListById("mihonoBourbonNishinoFlower", aiPremadeDecks);
export const agnesDigitalAgnesTachyonDeckList = getDeckListById("agnesDigitalAgnesTachyon", aiPremadeDecks);
export const tamamoCrossNiceNatureDeckList = getDeckListById("tamamoCrossNiceNature", aiPremadeDecks);
export const superCreekNishinoFlowerDeckList = getDeckListById("superCreekNishinoFlower", aiPremadeDecks);

export const mihonoBourbonDeckList = mihonoBourbonNishinoFlowerDeckList;
export const agnesDigitalDeckList = agnesDigitalAgnesTachyonDeckList;
export const manhattanCafeDeckList = riceShowerHaruUraraDeckList;

export const playerDeckList = getDeckListById(defaultPlayerDeckId).length > 0
  ? getDeckListById(defaultPlayerDeckId)
  : (mihonoBourbonDeckList.length > 0 ? mihonoBourbonDeckList : (premadeDecks[0]?.cardIds ?? []));

export const opponentDeckList = getDeckListById(defaultAiOpponentDeckId, aiPremadeDecks).length > 0
  ? getDeckListById(defaultAiOpponentDeckId, aiPremadeDecks)
  : (aiPremadeDecks[0]?.cardIds ?? riceShowerDeckList);

export const gameData: GameData = {
  cards,
  playerDeckList,
  opponentDeckList,
};
