import { useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { getCardRarity, isFullArtCard } from "../../../../shared/src/cardRarity";
import type { Card, CardPrintVariant, CardRarity } from "../../../../shared/src/types";

type HoloCardImageProps = {
  card: Card;
  src: string;
  alt: string;
  imageStyle: CSSProperties;
  draggable?: boolean;
  radiusOverride?: number;
  shineVariant?: "default" | "compact";
  printVariant?: CardPrintVariant;
  wrapperStyle?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLImageElement>) => void;
};

type PokemonFoilEffect = "common" | "uncommon" | "reverseHolo" | "rareHolo" | "trainerHolo" | "trainerGallery";

type FoilPointer = {
  x: number;
  y: number;
  fromCenter: number;
  fromTop: number;
  fromLeft: number;
  backgroundX: number;
  backgroundY: number;
};

const defaultPointer: FoilPointer = {
  x: 56,
  y: 38,
  fromCenter: 0.42,
  fromTop: 0.38,
  fromLeft: 0.56,
  backgroundX: 44,
  backgroundY: 36,
};

export function HoloCardImage({
  card,
  src,
  alt,
  imageStyle,
  draggable = false,
  radiusOverride,
  shineVariant = "default",
  printVariant = "standard",
  wrapperStyle,
  onClick,
}: HoloCardImageProps) {
  const [pointer, setPointer] = useState<FoilPointer>(defaultPointer);
  const [active, setActive] = useState(false);
  const rarity = getCardRarity(card);
  const foilEffect = getFoilEffect(card, rarity, printVariant);
  const shadow = imageStyle.boxShadow;
  const borderRadius = radiusOverride ?? imageStyle.borderRadius ?? 8;
  const compact = shineVariant === "compact";
  const pokemonVars = getPokemonFoilVars(pointer, active, compact);
  const pokemonData = getPokemonFoilData(card, foilEffect);

  return (
    <span
      className={`pokemon-card-foil${foilEffect ? " pokemon-card-foil--active-effect" : ""}${compact ? " pokemon-card-foil--compact" : ""}`}
      data-foil-effect={foilEffect ?? "none"}
      data-rarity={pokemonData.rarity}
      data-supertype={pokemonData.supertype}
      data-subtypes={pokemonData.subtypes}
      data-trainer-gallery={pokemonData.trainerGallery}
      onPointerEnter={() => setActive(true)}
      onPointerMove={(event) => {
        setActive(true);
        setPointer(getPointerState(event));
      }}
      onPointerLeave={() => {
        setActive(false);
        setPointer(defaultPointer);
      }}
      onFocus={() => setActive(true)}
      onBlur={() => {
        setActive(false);
        setPointer(defaultPointer);
      }}
      style={{
        ...pokemonVars,
        position: "relative",
        display: "block",
        width: imageStyle.width ?? "100%",
        height: imageStyle.height,
        aspectRatio: imageStyle.aspectRatio,
        maxWidth: imageStyle.maxWidth,
        maxHeight: imageStyle.maxHeight,
        justifySelf: imageStyle.justifySelf,
        alignSelf: imageStyle.alignSelf,
        borderRadius,
        boxShadow: typeof shadow === "string" ? shadow : undefined,
        overflow: "hidden",
        ...wrapperStyle,
      }}
    >
      <span className="pokemon-card-foil__front" style={{ borderRadius }}>
        <img
          style={{
            ...imageStyle,
            display: "block",
            boxShadow: "none",
            borderRadius,
          }}
          src={src}
          alt={alt}
          draggable={draggable}
          onClick={onClick}
        />
      </span>
      {foilEffect && (
        <>
          <span className="pokemon-card-foil__shine" style={{ borderRadius }} aria-hidden="true" />
          <span className="pokemon-card-foil__glare" style={{ borderRadius }} aria-hidden="true" />
        </>
      )}
    </span>
  );
}

function getFoilEffect(card: Card, rarity: CardRarity, printVariant: CardPrintVariant): PokemonFoilEffect | null {
  if (isFullArtCard(card)) {
    return card.kind === "trainer" && card.trainerType === "supporter" ? "trainerHolo" : "trainerGallery";
  }
  if (printVariant === "holographic" && card.kind === "trainer") return "trainerHolo";
  if (rarity === "rare") return "rareHolo";
  if (printVariant === "holographic") return "reverseHolo";
  if (rarity === "uncommon") return "uncommon";
  if (rarity === "common") return "common";
  return null;
}

function getPokemonFoilData(card: Card, foilEffect: PokemonFoilEffect | null): {
  rarity: string;
  supertype: string;
  subtypes: string;
  trainerGallery: string;
} {
  if (foilEffect === "trainerGallery") {
    return {
      rarity: "rare holo",
      supertype: "pokémon",
      subtypes: card.kind === "umamusume" && card.stage > 0 ? `stage${card.stage}` : "basic",
      trainerGallery: "true",
    };
  }
  if (foilEffect === "trainerHolo") {
    return {
      rarity: isFullArtCard(card) ? "rare ultra" : "rare holo",
      supertype: "trainer",
      subtypes: card.kind === "trainer" ? card.trainerType : "supporter",
      trainerGallery: "false",
    };
  }
  if (foilEffect === "rareHolo") {
    return {
      rarity: "rare holo",
      supertype: card.kind === "trainer" ? "trainer" : "pokémon",
      subtypes: card.kind === "umamusume" && card.stage > 0 ? `stage${card.stage}` : card.kind === "trainer" ? card.trainerType : "basic",
      trainerGallery: "false",
    };
  }
  if (foilEffect === "reverseHolo") {
    return {
      rarity: "reverse holo",
      supertype: card.kind === "trainer" ? "trainer" : "pokémon",
      subtypes: card.kind === "trainer" ? card.trainerType : card.kind === "umamusume" && card.stage > 0 ? `stage${card.stage}` : "basic",
      trainerGallery: "false",
    };
  }
  if (foilEffect === "uncommon") {
    return {
      rarity: "uncommon",
      supertype: card.kind === "trainer" ? "trainer" : "pokémon",
      subtypes: card.kind === "trainer" ? card.trainerType : card.kind === "umamusume" && card.stage > 0 ? `stage${card.stage}` : "basic",
      trainerGallery: "false",
    };
  }
  if (foilEffect === "common") {
    return {
      rarity: "common",
      supertype: card.kind === "trainer" ? "trainer" : "pokémon",
      subtypes: card.kind === "trainer" ? card.trainerType : card.kind === "umamusume" && card.stage > 0 ? `stage${card.stage}` : "basic",
      trainerGallery: "false",
    };
  }
  return { rarity: "common", supertype: card.kind === "trainer" ? "trainer" : "pokémon", subtypes: "", trainerGallery: "false" };
}

function getPokemonFoilVars(pointer: FoilPointer, active: boolean, compact: boolean): CSSProperties {
  return {
    "--pointer-x": `${pointer.x}%`,
    "--pointer-y": `${pointer.y}%`,
    "--pointer-from-center": pointer.fromCenter,
    "--pointer-from-top": pointer.fromTop,
    "--pointer-from-left": pointer.fromLeft,
    "--background-x": `${pointer.backgroundX}%`,
    "--background-y": `${pointer.backgroundY}%`,
    "--card-opacity": active ? (compact ? 0.62 : 1) : 0,
    "--common-card-opacity": active ? (compact ? 0.34 : 0.48) : 0,
    "--uncommon-card-opacity": active ? (compact ? 0.38 : 0.52) : 0,
    "--rare-holo-opacity": active ? (compact ? 0.3 : 0.46) : 0,
    "--trainer-holo-opacity": active ? (compact ? 0.28 : 0.42) : 0,
  } as CSSProperties;
}

function getPointerState(event: PointerEvent<HTMLSpanElement>): FoilPointer {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return defaultPointer;

  const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
  const fromCenter = Math.min(1, Math.hypot(x - 50, y - 50) / 70.71);

  return {
    x,
    y,
    fromCenter,
    fromTop: y / 100,
    fromLeft: x / 100,
    backgroundX: 100 - x,
    backgroundY: 100 - y,
  };
}
