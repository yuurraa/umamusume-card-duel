import { type CSSProperties, type DragEvent, useState } from "react";
import { hasTextDragPayload, readDragPayload } from "../../components/drag/dragData";

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
        borderColor: hovered ? "rgba(0, 0, 0, 0.65)" : playDropZoneStyle.borderColor,
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
  width: 132,
  height: 132,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "2px dashed rgba(0, 0, 0, 0.45)",
  background: "rgba(238, 243, 238, 0.74)",
  color: "#000000",
  fontSize: 13,
  fontWeight: 900,
  textAlign: "center",
  boxShadow: "0 14px 36px rgba(17, 24, 39, 0.14)",
  pointerEvents: "auto",
  userSelect: "none",
};
