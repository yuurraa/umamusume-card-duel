import { type CSSProperties, useState } from "react";
import type { EnergyType, GameState, UmamusumeType } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { energyLabel, getAllUmamusume, getCard, getDisplayedRetreatCost, getUmamusumeCard } from "../../game/engine";
import { UMAMUSUME_TYPE_TO_ENERGY } from "../../game/engine/core/constants";
import { abilityRuby, alphaColor, energyAccentColors, getPreviewTone } from "../../utils/color";
import { borders, colors, neutralButtonStyle, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle, radius, shadows, transitions } from "../../styles/shared";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { PreviewAccentButton } from "../../components/buttons/PreviewAccentButton";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { AbilityReadyBadge } from "../../components/cards/AbilityReadyBadge";
import { AttachedToolBadge } from "../../components/cards/AttachedToolBadge";

export function CardPreview({ state, target, canUseAttack, canUseRetreat, canUseAbility, onAttack, onRetreat, onAbility, onInspect, onClose }: {
  state: GameState;
  target: InspectTarget | null;
  canUseAttack: boolean;
  canUseRetreat: boolean;
  canUseAbility: boolean;
  onAttack: () => void;
  onRetreat: () => void;
  onAbility: () => void;
  onInspect: (target: InspectTarget) => void;
  onClose: () => void;
}) {
  const [abilityHovered, setAbilityHovered] = useState(false);
  const [retreatHovered, setRetreatHovered] = useState(false);
  if (!target) return null;
  const { card, umamusume } = target;
  const previewTone = getPreviewTone(card);
  const image = card.kind === "umamusume" ? card.portrait : card.image;
  const hpPercent = umamusume ? Math.max(0, Math.round((umamusume.hp / umamusume.maxHp) * 100)) : 0;
  const energyEntries = umamusume ? (Object.entries(umamusume.energies) as [EnergyType, number][]) : [];
  const attachedEnergy = energyEntries.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
  const attachedTool = umamusume?.toolCardId ? getCard(umamusume.toolCardId) : null;
  const previewSide = target.sideId === "player" ? state.sides.player : state.sides.opponent;
  const retreatCost = umamusume ? getDisplayedRetreatCost(state, previewSide, umamusume) : 0;
  const hpEffectLines = card.kind === "umamusume" && umamusume && target.sideId
    ? getHpEffectLines(state, target.sideId, umamusume)
    : [];
  const retreatEffectLines = card.kind === "umamusume" && umamusume && target.sideId
    ? getRetreatEffectLines(state, target.sideId, umamusume)
    : [];
  const hasRetreatEffectLines = retreatEffectLines.length > 0;
  const miscEffects = card.kind === "umamusume" && umamusume && target.sideId
    ? getMiscEffectGroups(state, umamusume)
    : { buffs: [], debuffs: [] as string[] };
  const attackPreviews = card.kind === "umamusume" && umamusume && target.sideId
    ? card.attacks.map((attack) => getAttackPreview(state, target.sideId!, umamusume, attack))
    : card.kind === "umamusume"
      ? card.attacks.map((attack) => ({
        damage: isNonDamagingAttack(attack) ? null : attack.damage,
        notes: isNonDamagingAttack(attack) ? [] : attack.coinBonus ? [`+${attack.coinBonus} damage - Heads`] : [],
      }))
      : [];

  return (
    <div style={previewBackdropStyle} onClick={onClose}>
      <NeutralButton style={closeButtonStyle} onClick={onClose}>Close</NeutralButton>
      <div style={previewShellStyle} onClick={(event) => event.stopPropagation()}>
        <img style={previewImageStyle} src={image} alt={card.name} />
        <aside style={previewInfoStyle}>
          <div>
            <div style={inspectKickerStyle}>{card.kind === "umamusume" ? card.label : card.label}</div>
            <h2 style={previewTitleStyle}>{card.name}</h2>
          </div>

          {umamusume && (
            <section style={previewBlockStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900 }}>
                <span>HP</span>
                <span>{umamusume.hp}/{umamusume.maxHp}</span>
              </div>
              <div style={{ height: 9, marginTop: 8, overflow: "hidden", borderRadius: radius.pill, background: "#e2e8f0" }}>
                <div style={{ height: "100%", width: `${hpPercent}%`, borderRadius: radius.pill, background: previewTone.accent }} />
              </div>
              {hpEffectLines.length > 0 && (
                <div style={{ ...modifierListStyle, marginTop: 8 }}>
                  {hpEffectLines.map((line) => (
                    <span key={line} style={modifierLineStyle}>{line}</span>
                  ))}
                </div>
              )}
            </section>
          )}

          {umamusume && (
            <section style={previewBlockStyle}>
              <div style={inspectKickerStyle}>Attached Energy</div>
              <div style={{ display: "flex", minHeight: 38, alignItems: "center", gap: 6, marginTop: 8 }}>
                {attachedEnergy.length === 0 ? (
                  <span style={{ color: colors.black, fontSize: 12, fontWeight: 800 }}>None</span>
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

          {umamusume && attachedTool?.kind === "trainer" && (
            <section style={previewBlockStyle}>
              <div style={inspectKickerStyle}>Attached Tool</div>
              <div style={attachedToolRowStyle}>
                <AttachedToolBadge
                  toolCardId={umamusume.toolCardId}
                  variant="inline"
                  size="sm"
                  onInspect={(toolCardId) => {
                    const tool = getCard(toolCardId);
                    if (tool.kind === "trainer") onInspect({ card: tool });
                  }}
                />
                <span style={attachedToolNameStyle}>
                  {attachedTool.name}{areToolsDisabled(state) ? " (No Effect - Tracen Gym)" : ""}
                </span>
              </div>
            </section>
          )}

          {card.kind === "umamusume" && umamusume && (
            <>
              <button
                type="button"
                disabled={!canUseRetreat}
                onClick={onRetreat}
                onMouseEnter={() => setRetreatHovered(true)}
                onMouseLeave={() => setRetreatHovered(false)}
                onFocus={() => setRetreatHovered(true)}
                onBlur={() => setRetreatHovered(false)}
                style={retreatButtonStyle(canUseRetreat, retreatHovered, previewTone.accent, hasRetreatEffectLines)}
              >
                <div style={retreatTopRowStyle}>
                  <span>Retreat</span>
                  <span style={retreatCostContentStyle(canUseRetreat, retreatHovered, previewTone.accent)}>
                    <RetreatCostDisplay cost={retreatCost} />
                  </span>
                </div>
                {hasRetreatEffectLines && (
                  <div style={{ ...modifierListStyle, marginTop: 6 }}>
                    {retreatEffectLines.map((line) => (
                      <span key={line} style={modifierLineStyle}>{line}</span>
                    ))}
                  </div>
                )}
              </button>
            </>
          )}

          {card.kind === "umamusume" && card.ability && (
            card.ability.moveBenchedEnergyToActive || card.ability.discardToDraw || card.ability.coinFlipDrawOrActiveDamageCounter || card.ability.damageOpponent ? (
              <button
                type="button"
                disabled={!canUseAbility}
                onClick={onAbility}
                onMouseEnter={() => setAbilityHovered(true)}
                onMouseLeave={() => setAbilityHovered(false)}
                onFocus={() => setAbilityHovered(true)}
                onBlur={() => setAbilityHovered(false)}
                style={abilityButtonStyle(canUseAbility, abilityHovered)}
              >
                {canUseAbility && <AbilityReadyBadge corner="topRight" size="sm" />}
                <div style={abilityKickerStyle}>Ability</div>
                <strong style={abilityNameStyle}>{card.ability.name}</strong>
                <span style={abilityTextStyle}>{card.ability.text}</span>
              </button>
            ) : (
              <section style={abilitySectionStyle}>
                <div style={abilityKickerStyle}>Ability</div>
                <strong style={abilityNameStyle}>{card.ability.name}</strong>
                <span style={abilityTextStyle}>{card.ability.text}</span>
              </section>
            )
          )}

          {card.kind === "umamusume" && (
            <section style={previewMovesStyle}>
              {card.attacks.map((attack, index) => {
                const attackPreview = attackPreviews[index] ?? { damage: isNonDamagingAttack(attack) ? null : attack.damage, notes: [] as string[] };
                const attackEnabled = canUseAttack && index === 0;
                const attackAccent = getAttackEnergyAccent(card.type);
                return (
                <PreviewAccentButton
                  key={attack.name}
                  accent={attackAccent}
                  style={({ hovered }) => attackPreviewButtonStyle(attackEnabled, hovered, attackAccent)}
                  disabled={!attackEnabled}
                  onClick={onAttack}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{attack.name}</strong>
                    {attackPreview.damage !== null && <strong>{attackPreview.damage}</strong>}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      color: "inherit",
                      opacity: 0.82,
                      fontSize: 12,
                      lineHeight: 1.25,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {attack.text}
                  </span>
                  {attackPreview.notes.length > 0 && (
                    <div style={{ ...modifierListStyle, marginTop: 6 }}>
                      {attackPreview.notes.map((line, noteIndex) => (
                        <span key={`${attack.name}-${noteIndex}`} style={modifierLineStyle}>{line}</span>
                      ))}
                    </div>
                  )}
                </PreviewAccentButton>
                );
              })}
            </section>
          )}

          {card.kind === "umamusume" && miscEffects.buffs.length > 0 && (
            <section style={previewBlockStyle}>
              <div style={inspectKickerStyle}>Buffs</div>
              <div style={{ ...modifierListStyle, marginTop: 6 }}>
                {miscEffects.buffs.map((line) => (
                  <span key={line} style={modifierLineStyle}>{line}</span>
                ))}
              </div>
            </section>
          )}

          {card.kind === "umamusume" && miscEffects.debuffs.length > 0 && (
            <section style={previewBlockStyle}>
              <div style={inspectKickerStyle}>Debuffs</div>
              <div style={{ ...modifierListStyle, marginTop: 6 }}>
                {miscEffects.debuffs.map((line) => (
                  <span key={line} style={modifierLineStyle}>{line}</span>
                ))}
              </div>
            </section>
          )}

          {card.kind === "trainer" && (
            card.trainerType === "stadium" && card.effect.shuffleHandIntoDeckDraw ? (
              <button
                type="button"
                disabled={!canUseAbility}
                onClick={onAbility}
                onMouseEnter={() => setAbilityHovered(true)}
                onMouseLeave={() => setAbilityHovered(false)}
                onFocus={() => setAbilityHovered(true)}
                onBlur={() => setAbilityHovered(false)}
                style={abilityButtonStyle(canUseAbility, abilityHovered)}
              >
                {canUseAbility && <AbilityReadyBadge corner="topRight" size="sm" />}
                <div style={abilityKickerStyle}>{card.trainerType}</div>
                <strong style={abilityNameStyle}>{card.name}</strong>
                <span style={abilityTextStyle}>{card.text}</span>
              </button>
            ) : (
              <section style={previewBlockStyle}>
                <div style={inspectKickerStyle}>{card.trainerType}</div>
                <p style={{ margin: "6px 0 0", color: colors.black, fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{card.text}</p>
              </section>
            )
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

const previewBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 50,
  color: colors.black,
  textShadow: "none",
};

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
  borderRadius: radius.md,
  objectFit: "contain",
  boxShadow: "0 32px 100px rgba(0, 0, 0, 0.44)",
};

const previewInfoStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  border: borders.neutralStrong,
  background: colors.glassOverlay,
  color: colors.black,
  textShadow: "none",
  padding: 16,
  minWidth: 0,
};

const previewTitleStyle: CSSProperties = {
  margin: "2px 0 14px",
  color: colors.black,
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const previewBlockStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(238, 243, 238, 0.82)",
  padding: 10,
};

const previewEnergyRingStyle: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: radius.circle,
  border: borders.glass,
  background: colors.glassStrong,
  boxShadow: shadows.md,
};

const attachedToolRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 34,
  marginTop: 8,
};

const attachedToolNameStyle: CSSProperties = {
  color: colors.black,
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1.25,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

function retreatButtonStyle(enabled: boolean, hovered: boolean, accent: string, hasModifierLines: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, hovered),
    width: "100%",
    ...(hasModifierLines ? { height: "auto", minHeight: 58 } : { height: 44 }),
    marginTop: 12,
    ...(hasModifierLines
      ? {
          display: "grid",
          gap: 2,
          alignItems: "start",
          padding: "8px 12px",
        }
      : {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
        }),
    textAlign: "left",
    fontSize: 13,
    fontWeight: 900,
    transform: enabled && hovered ? "translateY(-1px)" : undefined,
    boxShadow: enabled && hovered ? "0 14px 30px rgba(23, 33, 28, 0.2)" : undefined,
    transition: `background ${transitions.base}, border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
  };
}

function retreatCostContentStyle(enabled: boolean, hovered: boolean, accent: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 20,
    color: enabled && hovered ? accent : undefined,
    transition: `color ${transitions.base}`,
  };
}

const retreatPipListStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const colorlessPipStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: radius.circle,
  border: "2px solid currentColor",
  background: "radial-gradient(circle at center, rgba(255,255,255,0.98) 0 32%, transparent 36%)",
  boxSizing: "border-box",
};

const abilitySectionStyle: CSSProperties = {
  ...previewBlockStyle,
  position: "relative",
  border: `1px solid ${alphaColor(abilityRuby, 0.74)}`,
  background: abilityRuby,
  color: colors.white,
  boxShadow: `0 10px 24px ${alphaColor(abilityRuby, 0.18)}`,
};

function abilityButtonStyle(enabled: boolean, hovered: boolean): CSSProperties {
  return {
    ...abilitySectionStyle,
    width: "100%",
    marginTop: 10,
    border: enabled
      ? `1px solid ${hovered ? "rgba(255, 214, 107, 0.9)" : alphaColor(abilityRuby, 0.74)}`
      : "1px solid rgba(110, 86, 96, 0.82)",
    background: enabled
      ? hovered
        ? "linear-gradient(180deg, #d61148 0%, #a30f2a 100%)"
        : abilityRuby
      : "linear-gradient(180deg, #675a63 0%, #4c424a 100%)",
    color: enabled ? colors.white : "rgba(255, 255, 255, 0.68)",
    cursor: enabled ? "pointer" : "not-allowed",
    textAlign: "left",
    transform: enabled && hovered ? "translateY(-2px)" : undefined,
    boxShadow: enabled && hovered
      ? `0 0 0 2px rgba(255, 214, 107, 0.28), 0 18px 36px ${alphaColor(abilityRuby, 0.34)}`
      : enabled
        ? abilitySectionStyle.boxShadow
        : "0 8px 18px rgba(17, 24, 39, 0.12)",
    transition: `background ${transitions.base}, border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}, color ${transitions.base}`,
  };
}

const inspectKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

const abilityKickerStyle: CSSProperties = {
  ...inspectKickerStyle,
  color: "rgba(255, 255, 255, 0.78)",
};

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
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const previewMovesStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

function attackPreviewButtonStyle(enabled: boolean, hovered: boolean, accent: string): CSSProperties {
  return {
    padding: 12,
    fontSize: 14,
    ...(enabled
      ? {
          border: `1px solid ${hovered ? "rgba(255, 255, 255, 0.92)" : alphaColor(accent, 0.82)}`,
          background: hovered
            ? `linear-gradient(180deg, ${alphaColor("#ffffff", 0.24)} 0%, ${alphaColor("#ffffff", 0)} 44%), ${accent}`
            : accent,
          color: colors.white,
          transform: hovered ? "translateY(-2px)" : undefined,
          boxShadow: hovered
            ? `0 0 0 2px ${alphaColor(accent, 0.26)}, 0 18px 34px ${alphaColor(accent, 0.34)}`
            : `0 12px 28px ${alphaColor(accent, 0.24)}`,
          transition: `background ${transitions.base}, border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
        }
      : {}),
  };
}

const modifierListStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  width: "100%",
  minWidth: 0,
};

const modifierLineStyle: CSSProperties = {
  display: "block",
  color: colors.black,
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1.25,
  opacity: 0.86,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const retreatTopRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  width: "100%",
};

function getHpEffectLines(state: GameState, sideId: "player" | "opponent", umamusume: NonNullable<InspectTarget["umamusume"]>): string[] {
  const side = state.sides[sideId];
  const card = getUmamusumeCard(umamusume);
  const lines: string[] = [];

  if (state.stadium) {
    const stadiumCard = getTrainerCardFromState(state);
    const basicHpBonus = stadiumCard?.effect.basicHpBonus ?? 0;
    if (basicHpBonus > 0 && card.stage === 0) {
      lines.push(`+${basicHpBonus} HP - ${stadiumCard?.name}`);
    }
  }

  const activeHpBonus = getAllUmamusume(side).reduce((best, ally) => Math.max(best, getUmamusumeCard(ally).ability?.activeHpBonus ?? 0), 0);
  if (side.active?.uid === umamusume.uid && activeHpBonus > 0) {
    const activeHpSource = getAllUmamusume(side)
      .map((ally) => getUmamusumeCard(ally))
      .find((allyCard) => (allyCard.ability?.activeHpBonus ?? 0) === activeHpBonus)
      ?.ability?.name;
    lines.push(`+${activeHpBonus} HP - ${activeHpSource ?? "ally ability"}`);
  }

  return lines;
}

function getMiscEffectGroups(state: GameState, umamusume: NonNullable<InspectTarget["umamusume"]>): { buffs: string[]; debuffs: string[] } {
  const card = getUmamusumeCard(umamusume);
  const buffs: string[] = [];
  const debuffs: string[] = [];

  const abilityDamageReduction = card.ability?.damageReduction ?? 0;
  if (abilityDamageReduction > 0) {
    buffs.push(`-${abilityDamageReduction} Damage Taken - ${card.ability?.name}`);
  }
  if (umamusume.nextTurnDamageReduction > 0) {
    buffs.push(`-${umamusume.nextTurnDamageReduction} Damage Taken - Next Attack This Turn`);
  }
  if (!areToolsDisabled(state) && umamusume.toolCardId) {
    const tool = getCard(umamusume.toolCardId);
    if (tool.kind === "trainer" && tool.effect.toolDamageReduction) buffs.push(`-${tool.effect.toolDamageReduction} Damage Reduction - ${tool.name}`);
    if (tool.kind === "trainer" && tool.effect.toolCounterDamage) buffs.push(`${tool.effect.toolCounterDamage} Counter Damage - ${tool.name}`);
  }

  return { buffs, debuffs };
}

function areToolsDisabled(state: GameState): boolean {
  if (!state.stadium) return false;
  const stadium = getCard(state.stadium.cardId);
  return stadium.kind === "trainer" && Boolean(stadium.effect.disableTools);
}

function getAttackPreview(
  state: GameState,
  sideId: "player" | "opponent",
  umamusume: NonNullable<InspectTarget["umamusume"]>,
  attack: NonNullable<ReturnType<typeof getUmamusumeCard>["attacks"][number]>,
): { damage: number | null; notes: string[] } {
  const side = state.sides[sideId];
  const opposing = state.sides[sideId === "player" ? "opponent" : "player"];
  const card = getUmamusumeCard(umamusume);
  const nonDamagingAttack = isNonDamagingAttack(attack);
  let damage = attack.damage;
  const notes: string[] = [];

  const activeAttackBonus = side.active?.uid === umamusume.uid ? side.activeAttackDamageBonus : 0;
  if (!nonDamagingAttack && activeAttackBonus > 0) {
    damage += activeAttackBonus;
    notes.push(`+${activeAttackBonus} damage - Aoi Kiryuin`);
  }

  if (attack.bonusIfTookDamageLastTurn && umamusume.tookDamageLastTurn) {
    damage += attack.bonusIfTookDamageLastTurn;
    notes.push(`+${attack.bonusIfTookDamageLastTurn} damage - Took damage last turn`);
  }

  if (attack.damagePerAttachedEnergy) {
    const energyCount = attack.damagePerAttachedEnergy.types.reduce((sum, type) => sum + umamusume.energies[type], 0);
    const bonus = energyCount * attack.damagePerAttachedEnergy.amount;
    if (bonus > 0) {
      damage += bonus;
      const energyTypes = formatAttachedEnergyBonusTypes(attack.damagePerAttachedEnergy.types);
      notes.push(`+${bonus} damage - ${energyCount} ${energyTypes}`);
    }
  }

  if (attack.damagePerUmamusumeInPlay) {
    const umamusumeCount = attack.damagePerUmamusumeInPlay.side === "all"
      ? getAllUmamusume(side).length + getAllUmamusume(opposing).length
      : getAllUmamusume(side).length;
    const bonus = umamusumeCount * attack.damagePerUmamusumeInPlay.amount;
    if (bonus > 0) {
      damage += bonus;
      notes.push(`+${bonus} damage - ${umamusumeCount} in play`);
    }
  }

  const conditionalAttackBonus = card.ability?.attackDamageBonusIfAttachedEnergy;
  if (!nonDamagingAttack && conditionalAttackBonus && umamusume.energies[conditionalAttackBonus.type] >= conditionalAttackBonus.min) {
    damage += conditionalAttackBonus.amount;
    notes.push(`+${conditionalAttackBonus.amount} damage - ${card.ability?.name}`);
  }

  if (!nonDamagingAttack && attack.coinBonus) {
    notes.push(`+${attack.coinBonus} damage - Heads`);
  }
  if (attack.drawOnHeads) {
    notes.push(`Draw ${attack.drawOnHeads} ${attack.drawOnHeads === 1 ? "Card" : "Cards"} - Heads`);
  }

  return { damage: nonDamagingAttack ? null : damage, notes };
}

function isNonDamagingAttack(attack: NonNullable<ReturnType<typeof getUmamusumeCard>["attacks"][number]>): boolean {
  return attack.damage <= 0
    && !attack.coinBonus
    && !attack.bonusIfTookDamageLastTurn
    && !attack.damagePerAttachedEnergy
    && !attack.damagePerUmamusumeInPlay;
}

function formatEnergyTypeList(types: EnergyType[]): string {
  const labels = [...new Set(types)].map(energyLabel);
  if (labels.length <= 1) return `${labels[0] ?? "Energy"} Energy`;
  return `${labels.slice(0, -1).join("/")}/${labels[labels.length - 1]} Energy`;
}

function formatAttachedEnergyBonusTypes(types: EnergyType[]): string {
  const labels = [...new Set(types)].map((type) => energyLabel(type).replace(/ Energy$/, ""));
  if (labels.length <= 1) return `${labels[0] ?? "Energy"} Energy`;
  return `${labels.slice(0, -1).join("/")}/${labels[labels.length - 1]} Energy`;
}

function getAttackEnergyAccent(type: UmamusumeType): string {
  return energyAccentColors[UMAMUSUME_TYPE_TO_ENERGY[type]];
}

function getRetreatEffectLines(
  state: GameState,
  sideId: "player" | "opponent",
  umamusume: NonNullable<InspectTarget["umamusume"]>,
): string[] {
  const side = state.sides[sideId];
  const card = getUmamusumeCard(umamusume);
  const baseCost = parseRetreatCost(card.retreat);
  if (baseCost <= 0) return [];

  const lines: string[] = [];
  const stadiumCard = getTrainerCardFromState(state);
  const globalReduction = Math.min(baseCost, stadiumCard?.effect.globalRetreatCostReduction ?? 0);
  if (globalReduction > 0) {
    lines.push(`-${globalReduction} Retreat - ${stadiumCard?.name}`);
  }

  if (side.active?.uid === umamusume.uid && side.retreatCostReduction > 0) {
    const remainingAfterGlobal = Math.max(0, baseCost - globalReduction);
    const localReduction = Math.min(remainingAfterGlobal, side.retreatCostReduction);
    if (localReduction > 0) {
      lines.push(`-${localReduction} Retreat - Carrot Jelly`);
    }
  }

  return lines;
}

function getTrainerCardFromState(state: GameState) {
  if (!state.stadium) return null;
  const card = getCard(state.stadium.cardId);
  return card.kind === "trainer" ? card : null;
}

function parseRetreatCost(retreat: string): number {
  if (retreat === "Empty") return 0;
  const amount = retreat.match(/x(\d+)/)?.[1];
  return amount ? Number(amount) : 1;
}
