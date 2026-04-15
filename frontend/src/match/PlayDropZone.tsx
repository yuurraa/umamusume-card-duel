import { type CSSProperties, type DragEvent, useState } from "react";
import { hasTextDragPayload, readDragPayload } from "../components/dragData";

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
        borderColor: hovered ? "rgba(100, 113, 104, 0.6)" : playDropZoneStyle.borderColor,
        background: hovered ? "rgba(247, 250, 248, 0.96)" : playDropZoneStyle.background,
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
  width: 132,
  height: 132,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "2px dashed rgba(100, 113, 104, 0.32)",
  background: "rgba(255, 255, 255, 0.86)",
  color: "#647168",
  fontSize: 13,
  fontWeight: 900,
  textAlign: "center",
  boxShadow: "0 14px 36px rgba(17, 24, 39, 0.14)",
  pointerEvents: "auto",
  userSelect: "none",
};
