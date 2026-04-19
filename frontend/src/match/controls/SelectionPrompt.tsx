import type { CSSProperties } from "react";
import type { EnergyType } from "../../../../shared/src/types";
import { energyLabel } from "../../game/engine";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { overlayButtonStyle, overlaySurfaceStyle, inlineEnergyLabelStyle } from "../../styles/shared";
import type { PendingSelection } from "../../types/ui";

export function SelectionPrompt({ pending, onCancel, nextEnergyType, onRetreatDiscardAdjust, onConfirmRetreatDiscard }: {
  pending: PendingSelection;
  onCancel: () => void;
  nextEnergyType: EnergyType | null;
  onRetreatDiscardAdjust?: (energyType: EnergyType, delta: 1 | -1) => void;
  onConfirmRetreatDiscard?: () => void;
}) {
  const isRetreatDiscard = pending.kind === "retreatDiscard";
  const retreatSelectedCount = isRetreatDiscard ? getSelectedEnergyCount(pending.selectedEnergyCounts) : 0;
  const retreatConfirmEnabled = isRetreatDiscard && retreatSelectedCount === pending.retreatCost;

  const copy = pending.kind === "attachEnergy"
      ? nextEnergyType
        ? <AttachPromptContent energyType={nextEnergyType} />
        : "Choose 1 of your Umamusume to receive this turn's Energy."
    : pending.kind === "zoneBenchAttachTarget"
      ? "Choose 1 of your Benched Umamusume to receive 1 random Energy from Team Canopus."
    : pending.kind === "moveEnergyAbility"
      ? <MoveEnergyPromptContent energyTypes={pending.energyTypes} />
    : pending.kind === "retreatDiscard"
      ? `Choose exactly ${pending.retreatCost} energy to discard for retreat.`
    : pending.kind === "retreatTarget"
      ? "Choose the benched Umamusume to move active."
      : pending.kind === "forceSwitchActive"
        ? "Choose the benched Umamusume to switch in."
      : pending.kind === "replaceActive"
        ? "Choose the benched Umamusume to move active."
      : pending.kind === "attackHealTarget"
        ? "Choose 1 of your damaged Umamusume to heal."
      : pending.kind === "attackDamageTarget"
        ? "Choose 1 of your opponent's Umamusume to damage."
      : pending.kind === "healTarget"
        ? "Choose 1 Umamusume to heal."
        : pending.kind === "evolveTarget"
          ? "Choose the Umamusume that should evolve."
          : pending.kind === "toolTarget"
            ? "Choose 1 Umamusume to attach this Tool to."
          : pending.kind === "rainbowUncapTarget"
            ? "Choose the Basic Umamusume to evolve, skipping Stage 1."
          : pending.kind === "rainbowUncapEvolution"
            ? "Choose the Stage 2 card from your hand to evolve into."
          : pending.kind === "discardForScout"
            ? "Choose one other card from your hand to discard. Then choose 1 Umamusume from your deck."
            : pending.kind === "abilityDamageTarget"
              ? "Choose 1 of your opponent's Umamusume to damage."
            : pending.kind === "discardForAbility"
              ? "Choose 1 card from your hand to discard."
          : "Choose your next action.";

  return (
    <section style={selectionPromptStyle(isRetreatDiscard)}>
      <strong style={selectionPromptTextStyle}>{copy}</strong>
      {isRetreatDiscard && (
        <RetreatDiscardSelector
          pending={pending}
          {...(onRetreatDiscardAdjust ? { onAdjust: onRetreatDiscardAdjust } : {})}
        />
      )}
      {isRetreatDiscard ? (
        <div style={selectionPromptActionRowStyle}>
          <NeutralButton style={selectionPromptInlineButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
          <NeutralButton
            style={selectionPromptInlineButtonStyle}
            disabled={!retreatConfirmEnabled}
            {...(onConfirmRetreatDiscard ? { onClick: onConfirmRetreatDiscard } : {})}
          >
            Confirm
          </NeutralButton>
        </div>
      ) : (
        pending.kind !== "replaceActive" && pending.kind !== "forceSwitchActive" && <NeutralButton style={selectionPromptButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
      )}
    </section>
  );
}

function RetreatDiscardSelector({ pending, onAdjust }: { pending: Extract<PendingSelection, { kind: "retreatDiscard" }>; onAdjust?: (energyType: EnergyType, delta: 1 | -1) => void }) {
  const selectedTotal = getSelectedEnergyCount(pending.selectedEnergyCounts);
  const rows = RETREAT_ENERGY_ORDER
    .map((energyType) => {
      const available = pending.availableEnergyCounts[energyType] ?? 0;
      const selected = pending.selectedEnergyCounts[energyType] ?? 0;
      return { energyType, available, selected };
    })
    .filter((row) => row.available > 0);

  return (
    <div style={retreatDiscardGridStyle}>
      {rows.map(({ energyType, available, selected }) => (
        <div key={energyType} style={retreatDiscardRowStyle}>
          <span style={retreatDiscardLabelStyle}>
            <EnergyIcon type={energyType} size="sm" />
            <span>{energyLabel(energyType)}</span>
          </span>
          <div style={retreatDiscardCounterWrapStyle}>
            <button
              type="button"
              style={retreatAdjustButtonStyle}
              disabled={selected <= 0}
              onClick={() => onAdjust?.(energyType, -1)}
            >
              -
            </button>
            <span style={retreatCountTextStyle}>{selected}/{available}</span>
            <button
              type="button"
              style={retreatAdjustButtonStyle}
              disabled={selected >= available || selectedTotal >= pending.retreatCost}
              onClick={() => onAdjust?.(energyType, 1)}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function getSelectedEnergyCount(selectedEnergyCounts: Partial<Record<EnergyType, number>>): number {
  return Object.values(selectedEnergyCounts).reduce((sum, count) => sum + (count ?? 0), 0);
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
      <span>Choose 1 of your Umamusume to receive</span>
      <EnergyIcon type={energyType} size="sm" />
      <span>{energyLabel(energyType)}.</span>
    </span>
  );
}

function MoveEnergyPromptContent({ energyTypes }: { energyTypes: EnergyType[] }) {
  return (
    <span style={inlineEnergyLabelStyle}>
      <span>Drag a Benched</span>
      {energyTypes.map((energyType) => <EnergyIcon key={energyType} type={energyType} size="sm" />)}
      <span>{formatEnergyList(energyTypes)} to your Active Umamusume.</span>
    </span>
  );
}

function formatEnergyList(energyTypes: EnergyType[]): string {
  const labels = energyTypes.map(energyLabel);
  if (labels.length <= 1) return labels[0] ?? "Energy";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

const RETREAT_ENERGY_ORDER: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

function selectionPromptStyle(isRetreatDiscard: boolean): CSSProperties {
  return {
  position: "fixed",
  left: "50%",
  bottom: 18,
  zIndex: 45,
  width: "min(720px, calc(100vw - 32px))",
  display: "grid",
  gap: 12,
  transform: "translateX(-50%)",
  padding: isRetreatDiscard ? "14px 18px" : "12px 86px 12px 18px",
  textAlign: "center",
  ...overlaySurfaceStyle,
  };
}

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
  color: "#000000",
};

const selectionPromptButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
};

const selectionPromptActionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 8,
};

const selectionPromptInlineButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 88,
  position: "static",
  transform: "none",
};

const retreatDiscardGridStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 180,
  overflowY: "auto",
};

const retreatDiscardRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  borderRadius: 8,
  border: "1px solid rgba(185, 198, 188, 0.9)",
  background: "rgba(238, 243, 238, 0.82)",
  padding: "6px 10px",
};

const retreatDiscardLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 850,
  color: "#000000",
};

const retreatDiscardCounterWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const retreatAdjustButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid rgba(185, 198, 188, 0.95)",
  background: "rgba(238, 243, 238, 0.9)",
  color: "#000000",
  fontSize: 14,
  fontWeight: 900,
  lineHeight: 1,
  padding: 0,
  cursor: "pointer",
};

const retreatCountTextStyle: CSSProperties = {
  minWidth: 42,
  textAlign: "center",
  fontSize: 12,
  fontWeight: 900,
  color: "#000000",
};
