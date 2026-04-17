import { type CSSProperties, type DragEvent, useState } from "react";
import type { GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { getCard } from "../../game/engine";
import { hasTextDragPayload, readDragPayload } from "../../components/drag/dragData";

export function StadiumSlot({ state, onDropHandCard, onInspect }: {
  state: GameState;
  onDropHandCard: (handIndex: number) => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const stadium = state.stadium ? getCard(state.stadium.cardId) : null;
  const stadiumImage = stadium?.kind === "trainer" ? stadium.image : null;
  const stadiumName = stadium?.kind === "trainer" ? stadium.name : "Stadium Slot";

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
      style={stadiumSlotStyle(hovered, Boolean(stadiumImage))}
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
      {stadiumImage
        ? <img style={stadiumImageStyle(hovered)} src={stadiumImage} alt={stadiumName} draggable={false} />
        : <span style={stadiumEmptyTextStyle}>Stadium Slot</span>}
    </button>
  );
}

function stadiumSlotStyle(hovered: boolean, hasCard: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "calc(52% - 188px)",
    transform: "translate(-50%, -50%)",
    zIndex: 4,
    width: 148,
    height: 208,
    display: "grid",
    placeItems: "center",
    overflow: "visible",
    borderRadius: 8,
    border: hovered ? "2px dashed rgba(0, 0, 0, 0.65)" : "2px dashed rgba(0, 0, 0, 0.45)",
    background: hasCard ? "rgba(238, 243, 238, 0.22)" : "rgba(238, 243, 238, 0.62)",
    color: "#000000",
    padding: 8,
    fontSize: 12,
    fontWeight: 950,
    cursor: hasCard ? "pointer" : "default",
    boxShadow: hovered
      ? "0 0 0 5px rgba(100, 113, 104, 0.12), 0 18px 42px rgba(17, 24, 39, 0.18)"
      : "0 10px 30px rgba(17, 24, 39, 0.1)",
    boxSizing: "border-box",
    transition: "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
  };
}

function stadiumImageStyle(hovered: boolean): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    borderRadius: 8,
    filter: hovered
      ? "drop-shadow(0 20px 28px rgba(17, 24, 39, 0.24)) saturate(1.04)"
      : "drop-shadow(0 14px 20px rgba(17, 24, 39, 0.18))",
    transform: hovered ? "translateY(-6px) rotate(0.8deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
    transition: "transform 160ms ease, filter 160ms ease",
  };
}

const stadiumEmptyTextStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "100%",
  height: "100%",
  borderRadius: 6,
    background: "rgba(238, 243, 238, 0.5)",
  textAlign: "center",
};
