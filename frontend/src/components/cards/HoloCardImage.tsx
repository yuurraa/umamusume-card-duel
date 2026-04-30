import { useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { getCardRarity, isFullArtCard, isUncommonPlusCard } from "../../../../shared/src/cardRarity";
import type { Card, CardPrintVariant, CardRarity } from "../../../../shared/src/types";

type HoloCardImageProps = {
  card: Card;
  src: string;
  alt: string;
  imageStyle: CSSProperties;
  draggable?: boolean;
  radiusOverride?: number;
  shineVariant?: "default" | "compact";
  motionVariant?: "none" | "inspect";
  printVariant?: CardPrintVariant;
  wrapperStyle?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLImageElement>) => void;
  disableHoverAnimation?: boolean;
};

type PokemonFoilEffect = "common" | "uncommon" | "uncommonPlus" | "reverseHolo" | "rareHolo" | "trainerHolo" | "trainerGallery";

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
  motionVariant = "none",
  printVariant = "standard",
  wrapperStyle,
  onClick,
  disableHoverAnimation = false,
}: HoloCardImageProps) {
  const [pointer, setPointer] = useState<FoilPointer>(defaultPointer);
  const [active, setActive] = useState(false);
  const rarity = getCardRarity(card);
  const foilEffect = getFoilEffect(card, rarity, printVariant);
  const shadow = imageStyle.boxShadow;
  const borderRadius = radiusOverride ?? imageStyle.borderRadius ?? 8;
  const compact = shineVariant === "compact";
  const inspectMotion = motionVariant === "inspect";
  const isInteractive = !disableHoverAnimation;
  const isEffectActive = isInteractive && active;
  const pokemonVars = getPokemonFoilVars(pointer, isEffectActive, compact, inspectMotion);
  const pokemonData = getPokemonFoilData(card, foilEffect);
  const motionStyle = inspectMotion ? getInspectMotionStyle(pointer, isEffectActive, compact) : undefined;

  return (
    <span
      className={`pokemon-card-foil${foilEffect ? " pokemon-card-foil--active-effect" : ""}${compact ? " pokemon-card-foil--compact" : ""}${inspectMotion ? " pokemon-card-foil--inspect" : ""}`}
      data-foil-effect={foilEffect ?? "none"}
      data-rarity={pokemonData.rarity}
      data-supertype={pokemonData.supertype}
      data-subtypes={pokemonData.subtypes}
      data-trainer-gallery={pokemonData.trainerGallery}
      data-card-type={card.kind === "umamusume" ? card.type.toLowerCase() : undefined}
      onPointerEnter={() => {
        if (!isInteractive) return;
        setActive(true);
      }}
      onPointerMove={(event) => {
        if (!isInteractive) return;
        setActive(true);
        setPointer(getPointerState(event));
      }}
      onPointerLeave={() => {
        if (!isInteractive) return;
        setActive(false);
        setPointer(defaultPointer);
      }}
      onFocus={() => {
        if (!isInteractive) return;
        setActive(true);
      }}
      onBlur={() => {
        if (!isInteractive) return;
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
        ...(motionStyle ?? {}),
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

function getInspectMotionStyle(pointer: FoilPointer, active: boolean, compact: boolean): CSSProperties {
  const centerX = pointer.x - 50;
  const centerY = pointer.y - 50;
  const rotateX = active ? roundMotion(-centerY / 3.5) : 0;
  const rotateY = active ? roundMotion(centerX / 3.5) : 0;
  const translateX = active ? roundMotion(centerX / 4) : 0;
  const translateY = active ? roundMotion(centerY / 4) : 0;
  const scale = active ? (compact ? 1.01 : 1.03) : 1;

  return {
    transform: `perspective(900px) translate3d(${translateX}px, ${translateY}px, 0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
    transformStyle: "preserve-3d",
    willChange: "transform",
    transition: `transform ${active ? "120ms" : "220ms"} ease`,
  };
}

function roundMotion(value: number): number {
  return Math.round(value * 100) / 100;
}

function getFoilEffect(card: Card, rarity: CardRarity, printVariant: CardPrintVariant): PokemonFoilEffect | null {
  if (isUncommonPlusCard(card)) return "uncommonPlus";
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
  if (foilEffect === "uncommonPlus") {
    return {
      rarity: "uncommon plus",
      supertype: card.kind === "trainer" ? "trainer" : "pokémon",
      subtypes: card.kind === "trainer" ? card.trainerType : card.kind === "umamusume" && card.stage > 0 ? `stage${card.stage}` : "basic",
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

function getPokemonFoilVars(pointer: FoilPointer, active: boolean, compact: boolean, inspectMotion: boolean): CSSProperties {
  const inspectScale = inspectMotion ? 1 : 1;

  return {
    "--pointer-x": `${pointer.x}%`,
    "--pointer-y": `${pointer.y}%`,
    "--pointer-from-center": pointer.fromCenter,
    "--pointer-from-top": pointer.fromTop,
    "--pointer-from-left": pointer.fromLeft,
    "--background-x": `${pointer.backgroundX}%`,
    "--background-y": `${pointer.backgroundY}%`,
    "--card-opacity": active ? (compact ? 0.62 : 1) * inspectScale : 0,
    "--common-card-opacity": active ? (compact ? 0.34 : 0.48) * inspectScale : 0,
    "--uncommon-card-opacity": active ? (compact ? 0.38 : 0.52) * inspectScale : 0,
    "--rare-holo-opacity": active ? (compact ? 0.3 : 0.46) * inspectScale : 0,
    "--trainer-holo-opacity": active ? (compact ? 0.28 : 0.42) * inspectScale : 0,
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
