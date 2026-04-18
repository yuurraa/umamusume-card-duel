import type { CSSProperties } from "react";
import { getCard } from "../../game/engine";

type AttachedToolBadgeProps = {
  toolCardId: string | null | undefined;
  size?: "sm" | "md";
  variant?: "overlay" | "inline";
  onInspect?: ((toolCardId: string) => void) | undefined;
};

export function AttachedToolBadge({ toolCardId, size = "md", variant = "overlay", onInspect }: AttachedToolBadgeProps) {
  if (!toolCardId) return null;
  const tool = getCard(toolCardId);
  if (tool.kind !== "trainer") return null;
  const interactive = Boolean(onInspect);

  const inspectTool = () => {
    onInspect?.(toolCardId);
  };

  return (
    <span
      style={toolBadgeStyle(size, variant, interactive)}
      aria-label={`Inspect attached Tool: ${tool.name}`}
      title={`Inspect attached Tool: ${tool.name}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={(event) => {
        if (!interactive) return;
        event.preventDefault();
        event.stopPropagation();
        inspectTool();
      }}
      onPointerDown={(event) => {
        if (interactive) event.stopPropagation();
      }}
      onMouseDown={(event) => {
        if (interactive) event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (!interactive || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        event.stopPropagation();
        inspectTool();
      }}
    >
      <img style={toolImageStyle(size)} src={tool.image} alt="" draggable={false} />
    </span>
  );
}

function toolBadgeStyle(size: NonNullable<AttachedToolBadgeProps["size"]>, variant: NonNullable<AttachedToolBadgeProps["variant"]>, interactive: boolean): CSSProperties {
  return {
    position: variant === "overlay" ? "absolute" : "relative",
    left: variant === "overlay" ? (size === "md" ? 350 : 108) : undefined,
    top: variant === "overlay" ? (size === "md" ? 52 : 14) : undefined,
    zIndex: 3,
    width: size === "md" ? 78 : 34,
    height: size === "md" ? 46.5 : 21,
    overflow: "hidden",
    display: "inline-block",
    flex: "0 0 auto",
    borderRadius: 4,
    border: "2px solid rgba(255, 255, 255, 0.96)",
    background: "rgba(255, 255, 255, 0.94)",
    boxShadow: "0 6px 14px rgba(17, 24, 39, 0.28)",
    pointerEvents: interactive ? "auto" : "none",
    cursor: interactive ? "pointer" : "default",
  };
}

function toolImageStyle(size: NonNullable<AttachedToolBadgeProps["size"]>): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: size === "md" ? -19.5 : -9,
    width: size === "md" ? 90 : 42,
    height: "auto",
    transform: "translateX(-50%)",
    display: "block",
  };
}
