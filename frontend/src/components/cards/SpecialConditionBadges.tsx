import type { CSSProperties } from "react";
import type { SpecialCondition } from "../../../../shared/src/types";
import { colors, radius } from "../../styles/shared";

type SpecialConditionBadgesProps = {
  conditions: SpecialCondition[];
  size?: "sm" | "md";
};

const FORCE_STATUS_PIP_TEST = false;
const DEFAULT_FORCED_STATUS: SpecialCondition = "paralysed";

const CONDITION_ICON_BY_KIND: Partial<Record<SpecialCondition, string>> = {
  asleep: "/assets/status/Sleep.png",
  burned: "/assets/status/Burn.png",
  frozen: "/assets/status/Frozen.png",
  paralysed: "/assets/status/Paralysis.png",
  poisoned: "/assets/status/Poison.png",
};

export function SpecialConditionBadges({ conditions, size = "md" }: SpecialConditionBadgesProps) {
  const forcedFromGlobal = getForcedStatusFromGlobal();
  const forcedStatus = forcedFromGlobal ?? DEFAULT_FORCED_STATUS;
  const visibleConditions = conditions.length > 0
    ? conditions
    : FORCE_STATUS_PIP_TEST
      ? ([forcedStatus] as SpecialCondition[])
      : [];
  if (!visibleConditions.length) return null;
  return (
    <div style={wrapStyle(size)}>
      <style>{STATUS_BADGE_KEYFRAMES}</style>
      {visibleConditions.map((condition) => {
        const icon = CONDITION_ICON_BY_KIND[condition];
        const label = formatConditionLabel(condition);
        return (
          <span key={condition} style={badgeStyle(size, visibleConditions.indexOf(condition))}>
            {icon ? (
              <img src={icon} alt={label} title={label} draggable={false} style={iconStyle(size)} />
            ) : (
              <span style={textStyle}>{label.slice(0, 3).toUpperCase()}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function getForcedStatusFromGlobal(): SpecialCondition | null {
  const raw = (globalThis as typeof globalThis & { __UMA_STATUS_PIP_TEST__?: string }).__UMA_STATUS_PIP_TEST__;
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "asleep") return "asleep";
  if (normalized === "burned") return "burned";
  if (normalized === "frozen") return "frozen";
  if (normalized === "paralysed") return "paralysed";
  if (normalized === "poisoned") return "poisoned";
  return null;
}

function formatConditionLabel(condition: SpecialCondition): string {
  if (condition === "asleep") return "Sleep";
  if (condition === "burned") return "Burn";
  if (condition === "frozen") return "Frozen";
  if (condition === "paralysed") return "Paralysed";
  return "Poison";
}

function wrapStyle(size: "sm" | "md"): CSSProperties {
  return {
    position: "absolute",
    left: size === "md" ? "-3%" : "-3%",
    bottom: size === "md" ? "26px" : "17px",
    zIndex: 4,
    display: "flex",
    gap: 3,
    pointerEvents: "none",
  };
}

function badgeStyle(size: "sm" | "md", index: number): CSSProperties {
  return {
    position: "relative",
    width: size === "md" ? 100 : 40,
    aspectRatio: "108 / 34",
    overflow: "hidden",
    display: "inline-block",
    flex: "0 0 auto",
    borderRadius: size === "md" ? 7 : 5,
    border: "2px solid rgba(255, 255, 255, 0.9)",
    background: "rgba(255, 255, 255, 0.06)",
    boxShadow: "0 4px 10px rgba(17, 24, 39, 0.22)",
    animation: `status-badge-appear 500ms cubic-bezier(0.2, 0.8, 0.2, 1) ${index * 42}ms both`,
  };
}

function iconStyle(size: "sm" | "md"): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: size === "md" ? "100%" : "100%",
    height: size === "md" ? "100%" : "100%",
    transform: "translate(-50%, -50%)",
    objectFit: "contain",
    display: "block",
  };
}

const textStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  color: colors.black,
};

const STATUS_BADGE_KEYFRAMES = `
@keyframes status-badge-appear {
  0% { opacity: 0; transform: translateY(8px) scale(0.72) rotate(-5deg); filter: saturate(0.72); box-shadow: 0 0 0 rgba(168, 85, 247, 0); }
  44% { opacity: 1; transform: translateY(-3px) scale(1.14) rotate(2deg); filter: saturate(1.2); box-shadow: 0 0 0 7px rgba(168, 85, 247, 0.2), 0 10px 20px rgba(17, 24, 39, 0.26); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); filter: saturate(1); }
}
`;
