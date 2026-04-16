import { type CSSProperties, useState } from "react";
import type { EnergyType, GameState } from "../../../shared/src/types";
import type { InspectTarget } from "../inspect";
import { getDisplayedRetreatCost } from "../game/engine";
import { getPreviewTone } from "../utils/color";
import { overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewAccentButtonStyle, previewKickerStyle } from "../styles/shared";
import { NeutralButton } from "../components/NeutralButton";
import { PreviewAccentButton } from "../components/PreviewAccentButton";
import { EnergyIcon } from "../components/EnergyIcon";

export function CardPreview({ state, target, canUseAttack, canUseRetreat, canUseAbility, onAttack, onRetreat, onAbility, onClose }: {
  state: GameState;
  target: InspectTarget | null;
  canUseAttack: boolean;
  canUseRetreat: boolean;
  canUseAbility: boolean;
  onAttack: () => void;
  onRetreat: () => void;
  onAbility: () => void;
  onClose: () => void;
}) {
  const [abilityHovered, setAbilityHovered] = useState(false);
  if (!target) return null;
  const { card, pokemon } = target;
  const previewTone = getPreviewTone(card);
  const image = card.kind === "pokemon" ? card.portrait : card.image;
  const hpPercent = pokemon ? Math.max(0, Math.round((pokemon.hp / pokemon.maxHp) * 100)) : 0;
  const energyEntries = pokemon ? (Object.entries(pokemon.energies) as [EnergyType, number][]) : [];
  const attachedEnergy = energyEntries.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
  const previewSide = target.sideId === "player" ? state.sides.player : state.sides.opponent;
  const retreatCost = pokemon ? getDisplayedRetreatCost(state, previewSide, pokemon) : 0;

  return (
    <div style={previewBackdropStyle} onClick={onClose}>
      <NeutralButton style={closeButtonStyle} onClick={onClose}>Close</NeutralButton>
      <div style={previewShellStyle} onClick={(event) => event.stopPropagation()}>
        <img style={previewImageStyle} src={image} alt={card.name} />
        <aside style={previewInfoStyle}>
          <div>
            <div style={previewKickerStyle}>{card.kind === "pokemon" ? card.label : card.label}</div>
            <h2 style={previewTitleStyle}>{card.name}</h2>
          </div>

          {pokemon && (
            <section style={previewBlockStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900 }}>
                <span>HP</span>
                <span>{pokemon.hp}/{pokemon.maxHp}</span>
              </div>
              <div style={{ height: 9, marginTop: 8, overflow: "hidden", borderRadius: 999, background: "#e2e8f0" }}>
                <div style={{ height: "100%", width: `${hpPercent}%`, borderRadius: 999, background: previewTone.accent }} />
              </div>
            </section>
          )}

          {pokemon && (
            <section style={previewBlockStyle}>
              <div style={previewKickerStyle}>Attached Energy</div>
              <div style={{ display: "flex", minHeight: 38, alignItems: "center", gap: 6, marginTop: 8 }}>
                {attachedEnergy.length === 0 ? (
                  <span style={{ color: "#647168", fontSize: 12, fontWeight: 800 }}>None</span>
                ) : (
                  attachedEnergy.map((type, index) => (
                    <span key={`${type}-${index}`} style={previewEnergyRingStyle}>
                      <EnergyIcon type={type} size="md" />
                    </span>
                  ))
                )}
              </div>
            </section>
          )}

          {card.kind === "pokemon" && pokemon && (
            <NeutralButton disabled={!canUseRetreat} onClick={onRetreat} style={retreatButtonStyle(canUseRetreat)}>
              <span>Retreat</span>
              <span style={retreatCostContentStyle}>
                <RetreatCostDisplay cost={retreatCost} />
              </span>
            </NeutralButton>
          )}

          {card.kind === "pokemon" && card.ability && (
            card.ability.moveBenchedEnergyToActive ? (
              <button
                type="button"
                disabled={!canUseAbility}
                onClick={onAbility}
                onMouseEnter={() => setAbilityHovered(true)}
                onMouseLeave={() => setAbilityHovered(false)}
                onFocus={() => setAbilityHovered(true)}
                onBlur={() => setAbilityHovered(false)}
                style={abilityButtonStyle(canUseAbility, abilityHovered, previewTone.accent)}
              >
                <div style={abilityKickerStyle(canUseAbility, abilityHovered)}>Ability</div>
                <strong style={abilityNameStyle}>{card.ability.name}</strong>
                <span style={abilityTextStyle}>{card.ability.text}</span>
              </button>
            ) : (
              <section style={abilitySectionStyle}>
                <div style={previewKickerStyle}>Ability</div>
                <strong style={abilityNameStyle}>{card.ability.name}</strong>
                <span style={abilityTextStyle}>{card.ability.text}</span>
              </section>
            )
          )}

          {card.kind === "pokemon" && (
            <section style={previewMovesStyle}>
              {card.attacks.map((attack, index) => (
                <PreviewAccentButton
                  key={attack.name}
                  accent={previewTone.accent}
                  style={{ padding: 12, fontSize: 14 }}
                  disabled={!canUseAttack || index !== 0}
                  onClick={onAttack}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{attack.name}</strong>
                    <strong>{attack.damage}</strong>
                  </span>
                  <span style={{ display: "block", marginTop: 4, color: "inherit", opacity: 0.82, fontSize: 12, lineHeight: 1.25 }}>{attack.text}</span>
                </PreviewAccentButton>
              ))}
            </section>
          )}

          {card.kind === "trainer" && (
            <section style={previewBlockStyle}>
              <div style={previewKickerStyle}>{card.trainerType}</div>
              <p style={{ margin: "6px 0 0", color: "#17211c", fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{card.text}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function RetreatCostDisplay({ cost }: { cost: number }) {
  if (cost <= 0) return <strong>Free</strong>;
  return (
    <span style={retreatPipListStyle} aria-label={`Retreat cost ${cost}`}>
      {Array.from({ length: cost }, (_, index) => <span key={index} style={colorlessPipStyle} />)}
    </span>
  );
}

const previewBackdropStyle: CSSProperties = { ...overlayBackdropStyle, zIndex: 50 };

const closeButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  top: 16,
  right: 16,
  padding: "0 16px",
  fontSize: 14,
  height: 40,
};

const previewShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 460px) minmax(260px, 360px)",
  gap: 18,
  alignItems: "center",
  width: "100%",
  maxWidth: 900,
};

const previewImageStyle: CSSProperties = {
  maxHeight: "90vh",
  width: "100%",
  borderRadius: 8,
  objectFit: "contain",
  boxShadow: "0 32px 100px rgba(0, 0, 0, 0.44)",
};

const previewInfoStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  border: "1px solid rgba(203, 213, 225, 0.9)",
  background: "#ffffff",
  padding: 16,
};

const previewTitleStyle: CSSProperties = {
  margin: "2px 0 14px",
  color: "#17211c",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const previewBlockStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: 8,
  border: "1px solid rgba(226, 232, 240, 0.95)",
  background: "#ffffff",
  padding: 10,
};

const previewEnergyRingStyle: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid white",
  background: "white",
  boxShadow: "0 8px 18px rgba(17,24,39,0.14)",
};

import { neutralButtonStyle } from "../styles/shared";

function retreatButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, false),
    width: "100%",
    height: 44,
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 12px",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 900,
  };
}

const retreatCostContentStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  minHeight: 20,
};

const retreatPipListStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const colorlessPipStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "2px solid currentColor",
  background: "radial-gradient(circle at center, rgba(255,255,255,0.98) 0 32%, transparent 36%)",
  boxSizing: "border-box",
};

const abilitySectionStyle: CSSProperties = { ...previewBlockStyle };

function abilityButtonStyle(enabled: boolean, hovered: boolean, accent: string): CSSProperties {
  return {
    ...previewAccentButtonStyle(enabled, hovered, accent),
    marginTop: 10,
  };
}

function abilityKickerStyle(enabled: boolean, hovered: boolean): CSSProperties {
  return {
    ...previewKickerStyle,
    color: enabled && hovered ? "rgba(255, 255, 255, 0.78)" : previewKickerStyle.color,
  };
}

const abilityNameStyle: CSSProperties = {
  display: "block",
  marginTop: 6,
  color: "inherit",
  fontSize: 18,
  lineHeight: 1.1,
  fontWeight: 950,
};

const abilityTextStyle: CSSProperties = {
  display: "block",
  marginTop: 6,
  color: "inherit",
  opacity: 0.9,
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.35,
};

const previewMovesStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};
