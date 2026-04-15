import type { CSSProperties } from "react";
import type { EnergyType } from "../../../shared/src/types";
import { energyLabel } from "../game/engine";
import { EnergyIcon } from "../components/EnergyIcon";
import { NeutralButton } from "../components/NeutralButton";
import { overlayButtonStyle, overlaySurfaceStyle, inlineEnergyLabelStyle } from "../styles/shared";
import type { PendingSelection } from "../types/ui";

export function SelectionPrompt({ pending, onCancel, nextEnergyType }: {
  pending: PendingSelection;
  onCancel: () => void;
  nextEnergyType: EnergyType | null;
}) {
  const copy = pending.kind === "attachEnergy"
      ? nextEnergyType
        ? <AttachPromptContent energyType={nextEnergyType} />
        : "Choose one of your Umamusume to receive this turn's Energy."
    : pending.kind === "moveEnergyAbility"
      ? <MoveEnergyPromptContent energyType={pending.energyType} />
    : pending.kind === "retreatTarget"
      ? "Choose the benched Umamusume to move active."
      : pending.kind === "replaceActive"
        ? "Choose the benched Umamusume to move active."
      : pending.kind === "attackHealTarget"
        ? "Choose one of your damaged Umamusume to heal."
      : pending.kind === "healTarget"
        ? "Choose one Umamusume to heal."
        : pending.kind === "evolveTarget"
          ? "Choose the Umamusume that should evolve."
          : pending.kind === "discardForScout"
            ? "Choose one other card from your hand to discard."
          : "Choose an Umamusume from your deck.";

  return (
    <section style={selectionPromptStyle}>
      <strong style={selectionPromptTextStyle}>{copy}</strong>
      {pending.kind !== "replaceActive" && <NeutralButton style={selectionPromptButtonStyle} onClick={onCancel}>Cancel</NeutralButton>}
    </section>
  );
}

export function AttachEnergyContent({ energyType, extraCount }: { energyType: EnergyType | null; extraCount: number }) {
  if (!energyType) return <>Attach Energy</>;
  return (
    <span style={inlineEnergyLabelStyle}>
      <EnergyIcon type={energyType} size="sm" />
      <span>{extraCount > 0 ? `Attach ${energyLabel(energyType)} (+${extraCount})` : `Attach ${energyLabel(energyType)}`}</span>
    </span>
  );
}

function AttachPromptContent({ energyType }: { energyType: EnergyType }) {
  return (
    <span style={inlineEnergyLabelStyle}>
      <span>Choose one of your Umamusume to receive</span>
      <EnergyIcon type={energyType} size="sm" />
      <span>{energyLabel(energyType)}.</span>
    </span>
  );
}

function MoveEnergyPromptContent({ energyType }: { energyType: EnergyType }) {
  return (
    <span style={inlineEnergyLabelStyle}>
      <span>Choose the benched Umamusume to send</span>
      <EnergyIcon type={energyType} size="sm" />
      <span>{energyLabel(energyType)} from.</span>
    </span>
  );
}

const selectionPromptStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 18,
  zIndex: 45,
  width: "min(720px, calc(100vw - 32px))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  transform: "translateX(-50%)",
  padding: "12px 86px 12px 18px",
  textAlign: "center",
  ...overlaySurfaceStyle,
};

const selectionPromptTextStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.35,
  textAlign: "center",
};

const selectionPromptButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
};
