import { type CSSProperties, type DragEvent, useState } from "react";
import { hasTextDragPayload, readDragPayload } from "../../components/drag/dragData";
import { uiTextColor, uiTextShadow } from "../../styles/shared";

export function PlayDropZone({ onDropHandCard }: { onDropHandCard: (handIndex: number) => void }) {
  const [hovered, setHovered] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = readDragPayload(event.dataTransfer);
    setHovered(false);
    if (payload?.kind !== "hand-card") return;
    onDropHandCard(payload.handIndex);
  };

  return (
    <div
      style={{
        ...playDropZoneStyle,
        borderColor: hovered ? "rgba(148, 163, 184, 0.72)" : playDropZoneStyle.borderColor,
        background: hovered ? "rgba(238, 243, 238, 0.9)" : playDropZoneStyle.background,
      }}
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
    >
      Play Card
    </div>
  );
}

const playDropZoneStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "52%",
  transform: "translate(-50%, -50%)",
  zIndex: 3,
  width: "clamp(106px, 6.875vw, 132px)",
  height: "clamp(106px, 6.875vw, 132px)",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "2px dashed rgba(185, 198, 188, 0.88)",
  background: "rgba(238, 243, 238, 0.24)",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: "clamp(11px, 0.677vw, 13px)",
  fontWeight: 900,
  textAlign: "center",
  boxShadow: "0 14px 36px rgba(17, 24, 39, 0.14)",
  pointerEvents: "auto",
  userSelect: "none",
};
