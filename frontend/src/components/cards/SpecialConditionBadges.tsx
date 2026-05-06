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
      {visibleConditions.map((condition) => {
        const icon = CONDITION_ICON_BY_KIND[condition];
        const label = formatConditionLabel(condition);
        return (
          <span key={condition} style={badgeStyle(size)}>
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
    left: size === "md" ? "-3%" : "-2%",
    bottom: size === "md" ? "26px" : "14px",
    zIndex: 4,
    display: "flex",
    gap: 3,
    pointerEvents: "none",
  };
}

function badgeStyle(size: "sm" | "md"): CSSProperties {
  return {
    position: "relative",
    width: size === "md" ? 95 : 40,
    aspectRatio: "148 / 46",
    overflow: "visible",
    display: "inline-block",
    flex: "0 0 auto",
    borderRadius: radius.sm,
    border: "2px solid rgba(255, 255, 255, 0.9)",
    background: "rgba(255, 255, 255, 0.06)",
    boxShadow: "0 4px 10px rgba(17, 24, 39, 0.22)",
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
