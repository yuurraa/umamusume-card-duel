import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react";
import type { GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { getCard } from "../../game/engine";
import { AbilityReadyBadge } from "../../components/cards/AbilityReadyBadge";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { hasTextDragPayload, readDragPayload } from "../../components/drag/dragData";
import { colors, radius, transitions, uiTextColor, uiTextShadow } from "../../styles/shared";

export function StadiumSpot({ state, abilityReady = false, onDropHandCard, onInspect }: {
  state: GameState;
  abilityReady?: boolean;
  onDropHandCard: (handIndex: number) => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [opponentStadiumRevealToken, setOpponentStadiumRevealToken] = useState(0);
  const previousStadiumCardIdRef = useRef<string | null>(state.stadium?.cardId ?? null);
  const stadium = state.stadium ? getCard(state.stadium.cardId) : null;
  const stadiumImage = stadium?.kind === "trainer" ? stadium.image : null;
  const stadiumName = stadium?.kind === "trainer" ? stadium.name : "Stadium Spot";

  useEffect(() => {
    const previousCardId = previousStadiumCardIdRef.current;
    const currentCardId = state.stadium?.cardId ?? null;
    const newlyPlayedStadium = previousCardId !== currentCardId && currentCardId !== null;
    if (newlyPlayedStadium) setOpponentStadiumRevealToken((current) => current + 1);
    previousStadiumCardIdRef.current = currentCardId;
  }, [state.stadium]);

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const payload = readDragPayload(event.dataTransfer);
    setHovered(false);
    if (payload?.kind !== "hand-card") return;
    onDropHandCard(payload.handIndex);
  };

  return (
    <button
      type="button"
      style={StadiumSpotStyle(hovered, Boolean(stadiumImage), abilityReady)}
      onClick={() => {
        if (!stadium || stadium.kind !== "trainer") return;
        onInspect({ card: stadium });
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onDragOver={(event) => {
        if (!hasTextDragPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setHovered(true);
      }}
      onDragEnter={(event) => {
        if (!hasTextDragPayload(event)) return;
        setHovered(true);
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={handleDrop}
      aria-label={stadiumName}
    >
      <style>{STADIUM_REVEAL_KEYFRAMES}</style>
    {stadiumImage && stadium
        ? (
          <>
            <HoloCardImage
              key={`stadium-${opponentStadiumRevealToken}-${stadiumImage}`}
              card={stadium}
              src={stadiumImage}
              alt={stadiumName}
              imageStyle={stadiumImageStyle(hovered, Boolean(opponentStadiumRevealToken > 0))}
              draggable={false}
            />
            {abilityReady && <AbilityReadyBadge corner="topLeft" size="xs" nudgeX={0} />}
          </>
        )
        : <span style={stadiumEmptyTextStyle}>Stadium Spot</span>}
    </button>
  );
}

function StadiumSpotStyle(hovered: boolean, hasCard: boolean, abilityReady: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "calc(52% - clamp(150px, 9.792vw, 188px))",
    transform: "translate(-50%, -50%)",
    zIndex: 4,
    width: "clamp(118px, 7.708vw, 148px)",
    height: "clamp(166px, 10.833vw, 208px)",
    display: "grid",
    placeItems: "center",
    overflow: "visible",
    borderRadius: radius.md,
    border: hovered ? "2px dashed rgba(148, 163, 184, 0.72)" : "2px dashed rgba(185, 198, 188, 0.88)",
    background: hasCard ? colors.glass : colors.glassSoft,
    color: uiTextColor,
    textShadow: uiTextShadow,
    padding: "clamp(6px, 0.417vw, 8px)",
    fontSize: "clamp(10px, 0.625vw, 12px)",
    fontWeight: 950,
    cursor: hasCard ? "pointer" : "default",
    boxShadow: hovered
      ? "0 0 0 5px rgba(100, 113, 104, 0.12), 0 18px 42px rgba(17, 24, 39, 0.18)"
      : "0 10px 30px rgba(17, 24, 39, 0.1)",
    boxSizing: "border-box",
    transition: `border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
  };
}

function stadiumImageStyle(hovered: boolean, reveal: boolean): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    borderRadius: radius.md,
    filter: hovered
      ? "drop-shadow(0 20px 28px rgba(17, 24, 39, 0.24)) saturate(1.04)"
      : "drop-shadow(0 14px 20px rgba(17, 24, 39, 0.18))",
    transform: hovered ? "translateY(-6px) rotate(0.8deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
    transition: `transform ${transitions.board}, filter ${transitions.board}`,
    animation: reveal ? `stadium-reveal-slide-up 320ms ${transitions.spring} both` : undefined,
  };
}

const stadiumEmptyTextStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  background: "transparent",
  color: uiTextColor,
  textShadow: uiTextShadow,
  textAlign: "center",
};

const STADIUM_REVEAL_KEYFRAMES = `
@keyframes stadium-reveal-slide-up {
  from { opacity: 0; transform: translateY(26px) scale(0.96); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
`;
