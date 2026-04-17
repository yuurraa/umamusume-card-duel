import type { CSSProperties } from "react";

type AbilityReadyBadgeProps = {
  corner?: "topLeft" | "topRight";
  size?: "sm" | "md";
};

export function AbilityReadyBadge({ corner = "topLeft", size = "md" }: AbilityReadyBadgeProps) {
  const pixels = size === "md" ? 30 : 24;

  return (
    <span style={badgeStyle(corner, pixels)} aria-label="Ability ready" title="Ability ready">
      <span style={sparkStyle(pixels)} />
    </span>
  );
}

function badgeStyle(corner: NonNullable<AbilityReadyBadgeProps["corner"]>, pixels: number): CSSProperties {
  return {
    position: "absolute",
    top: pixels === 30 ? -8 : -6,
    left: corner === "topLeft" ? (pixels === 30 ? -8 : -6) : undefined,
    right: corner === "topRight" ? (pixels === 30 ? -8 : -6) : undefined,
    zIndex: 4,
    width: pixels,
    height: pixels,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: "2px solid rgba(255, 255, 255, 0.9)",
    background: "linear-gradient(145deg, #ffd66b 0%, #d80f43 58%, #7f1027 100%)",
    boxShadow: "0 0 0 3px rgba(216, 15, 67, 0.24), 0 0 20px rgba(255, 214, 107, 0.52), 0 8px 16px rgba(17, 24, 39, 0.24)",
    pointerEvents: "none",
  };
}

function sparkStyle(pixels: number): CSSProperties {
  const inner = Math.round(pixels * 0.4);

  return {
    width: inner,
    height: inner,
    display: "block",
    background: "#ffffff",
    clipPath: "polygon(50% 0, 62% 35%, 100% 50%, 62% 65%, 50% 100%, 38% 65%, 0 50%, 38% 35%)",
    filter: "drop-shadow(0 0 5px rgba(255, 255, 255, 0.9))",
  };
}
