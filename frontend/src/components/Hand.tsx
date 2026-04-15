import { type CSSProperties, type DragEvent, useState } from "react";
import { getCard, getPlayableAction } from "../game/engine";
import type { Card, GameState } from "../../../shared/src/types";
import type { InspectTarget } from "../inspect";
import { writeDragPayload } from "./dragData";

type HandProps = {
  state: GameState;
  onInspect: (target: InspectTarget) => void;
  mode?: "play" | "setup";
  setupActiveIndex?: number | null;
  setupBenchIndexes?: number[];
  onSetupChooseActive?: (index: number) => void;
};

export function Hand({
  state,
  onInspect,
  mode = "play",
  setupActiveIndex = null,
  setupBenchIndexes = [],
}: HandProps) {
  const player = state.sides.player;
  const isSetup = mode === "setup";
  const playerTurn = isSetup || (!state.gameOver && state.currentSide === "player");
  const hiddenSetupIndexes = isSetup ? new Set([setupActiveIndex, ...setupBenchIndexes].filter((index): index is number => index !== null)) : null;

  return (
    <div style={handStyle}>
      {player.hand.map((cardId, index) => {
        if (hiddenSetupIndexes?.has(index)) return null;
        const card = getCard(cardId);
        const action = getPlayableAction(state, player, cardId);
        const isSetupBasic = isSetup && card.kind === "pokemon" && card.stage === 0;
        const canDrag = isSetup ? isSetupBasic : playerTurn && action.canPlay;
        const image = card.kind === "pokemon" ? card.portrait : card.image;
        const shadow = card.kind === "pokemon"
          ? "drop-shadow(0 18px 22px rgba(214, 81, 157, 0.22))"
          : card.trainerType === "supporter"
            ? "drop-shadow(0 18px 22px rgba(245, 158, 11, 0.22))"
            : "drop-shadow(0 18px 22px rgba(63, 159, 92, 0.22))";
        return (
          <HandCard
            key={`${cardId}-${index}`}
            card={card}
            handIndex={index}
            image={image}
            canDrag={canDrag}
            shadow={shadow}
            isSetup={isSetup}
            onPrimaryAction={() => onInspect({ card })}
          />
        );
      })}
    </div>
  );
}

function HandCard({
  card,
  handIndex,
  image,
  canDrag,
  shadow,
  isSetup,
  onPrimaryAction,
}: {
  card: Card;
  handIndex: number;
  image: string;
  canDrag: boolean;
  shadow: string;
  isSetup: boolean;
  onPrimaryAction: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeHover = hovered;

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    event.dataTransfer.effectAllowed = "move";
    writeDragPayload(event.dataTransfer, isSetup ? { kind: "setup-hand", handIndex } : { kind: "hand-card", handIndex });
  };

  return (
    <div style={{ position: "relative", width: 184, height: 258, flex: "0 0 auto", opacity: canDrag ? 1 : 0.62 }}>
      <button
        type="button"
        style={{
          ...handCardButtonStyle,
          filter: activeHover ? `${shadow} saturate(1.06)` : shadow,
          cursor: canDrag ? "grab" : "pointer",
          transform: activeHover ? "translateY(-10px) rotate(0.8deg) scale(1.035)" : "translateY(0) rotate(0deg) scale(1)",
          transition: "transform 170ms ease, filter 170ms ease",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={onPrimaryAction}
        draggable={canDrag}
        onDragStart={handleDragStart}
      >
        <img style={handImageStyle} src={image} alt="" draggable={false} />
      </button>
    </div>
  );
}

const handStyle: CSSProperties = {
  height: 286,
  display: "flex",
  gap: 12,
  justifyContent: "center",
  overflowX: "auto",
  padding: "16px 2px 8px",
};

const handCardButtonStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  padding: 0,
  border: 0,
  borderRadius: 8,
  background: "transparent",
  textAlign: "left",
};

const handImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
};
