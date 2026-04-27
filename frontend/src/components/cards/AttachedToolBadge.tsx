import type { CSSProperties } from "react";
import { getCard } from "../../game/engine";
import { colors, radius, shadows } from "../../styles/shared";

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
  const overlay = variant === "overlay";

  return {
    position: overlay ? "absolute" : "relative",
    right: overlay ? (size === "md" ? "-2%" : "11%") : undefined,
    top: overlay ? (size === "md" ? "14.8%" : "18%") : undefined,
    zIndex: 3,
    width: overlay ? (size === "md" ? "18.5%" : "22%") : size === "md" ? 74 : 34,
    aspectRatio: overlay ? "77 / 46.5" : undefined,
    height: overlay ? undefined : size === "md" ? 45 : 21,
    overflow: "hidden",
    display: "inline-block",
    flex: "0 0 auto",
    borderRadius: radius.sm,
    border: `${size === "md" ? 2 : 1}px solid rgba(255, 255, 255, 0.96)`,
    background: colors.glassOverlay,
    boxShadow: size === "md" ? "0 6px 14px rgba(17, 24, 39, 0.28)" : shadows.md,
    pointerEvents: interactive ? "auto" : "none",
    cursor: interactive ? "pointer" : "default",
  };
}

function toolImageStyle(size: NonNullable<AttachedToolBadgeProps["size"]>): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: size === "md" ? "-42%" : "-43%",
    width: size === "md" ? "118%" : "120%",
    height: "auto",
    transform: "translateX(-50%)",
    display: "block",
  };
}
