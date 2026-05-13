import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { EnergyType, SideId, SpecialCondition, UmamusumeInstance } from "../../../../shared/src/types";
import { colors, fontStacks, radius, shadows } from "../../styles/shared";

export type BattleEffectKind = "attack" | "damage" | "heal" | "energy" | "status" | "tool" | "evolve" | "ko";
export type BattleEffectSlot = { zone: "active" } | { zone: "bench"; index: number };
export type BattleEffectRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BattleEffectBoardSnapshot = {
  active: UmamusumeInstance | null;
  bench: UmamusumeInstance[];
};

export type BattleEffectEvent = {
  id: number;
  batchKey?: string | undefined;
  kind: BattleEffectKind;
  side: SideId;
  targetUid?: number | undefined;
  sourceUid?: number | undefined;
  sourceSide?: SideId | undefined;
  sourceSlot?: BattleEffectSlot | undefined;
  targetSlot?: BattleEffectSlot | undefined;
  sourceRect?: BattleEffectRect | undefined;
  targetRect?: BattleEffectRect | undefined;
  targetCardId?: string | undefined;
  targetUmamusume?: UmamusumeInstance | undefined;
  targetBoardBefore?: BattleEffectBoardSnapshot | undefined;
  statusCondition?: SpecialCondition | undefined;
  hpBefore?: number | undefined;
  hpAfter?: number | undefined;
  amount?: number | undefined;
  attachedEnergyBefore?: EnergyType[] | undefined;
  attachedEnergyAfter?: EnergyType[] | undefined;
  label: string;
};

type EffectRect = BattleEffectRect;

type EffectTone = {
  primary: string;
  secondary: string;
  soft: string;
  strong: string;
  text: string;
};

export function BattleEffectOverlay({
  event,
  onDone,
  durationMs: requestedDurationMs,
}: {
  event: BattleEffectEvent;
  onDone: () => void;
  durationMs?: number;
}) {
  const durationMs = requestedDurationMs ?? durationForEvent(event.kind);
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const [measuredRects, setMeasuredRects] = useState<{ source?: EffectRect; target?: EffectRect }>({});
  const tone = toneForEvent(event.kind, event.statusCondition);
  const fallbackSourceRect = resolveSlotRect(event.sourceSide ?? (event.side === "player" ? "opponent" : "player"), event.sourceSlot, viewportSize);
  const fallbackTargetRect = resolveSlotRect(event.side, event.targetSlot, viewportSize);
  const sourceRect = measuredRects.source ?? event.sourceRect ?? fallbackSourceRect;
  const targetRect = measuredRects.target ?? event.targetRect ?? fallbackTargetRect;
  const particles = useMemo(() => Array.from({ length: particleCountForKind(event.kind) }, (_, index) => index), [event.kind]);

  useEffect(() => {
    const timeoutId = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, event.id, onDone]);

  useLayoutEffect(() => {
    const measure = () => {
      const nextRects: { source?: EffectRect; target?: EffectRect } = {};
      const source = event.sourceUid !== undefined ? getCardRect(event.sourceUid) : undefined;
      const target = event.targetUid !== undefined ? getCardRect(event.targetUid) : undefined;
      if (source) nextRects.source = source;
      if (target) nextRects.target = target;
      setViewportSize(getViewportSize());
      setMeasuredRects(nextRects);
    };

    measure();
    const rafId = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
    };
  }, [event.sourceUid, event.targetUid]);

  const overlay = (
    <div style={rootStyle} aria-live="polite">
      <style>{KEYFRAMES}</style>
      {event.kind === "attack" && <AttackTrace sourceRect={sourceRect} targetRect={targetRect} tone={tone} durationMs={durationMs} />}
      {event.kind === "energy" && <EnergyTrace targetRect={targetRect} tone={tone} durationMs={durationMs} />}
      {(event.kind === "damage" || event.kind === "heal" || event.kind === "status" || event.kind === "tool" || event.kind === "evolve" || event.kind === "ko") && (
        <TargetFrame event={event} targetRect={targetRect} tone={tone} durationMs={durationMs} particles={particles} />
      )}
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}

function AttackTrace({
  sourceRect,
  targetRect,
  tone,
  durationMs,
}: {
  sourceRect: EffectRect;
  targetRect: EffectRect;
  tone: EffectTone;
  durationMs: number;
}) {
  const source = centerOf(sourceRect);
  const target = centerOf(targetRect);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  return (
    <>
      <div style={{ ...cardPulseStyle(sourceRect, tone, "source"), ["--battle-effect-duration" as string]: `${durationMs}ms` }} />
      <div
        style={{
          ...attackLineStyle(source, length, angle, tone),
          ["--battle-effect-duration" as string]: `${durationMs}ms`,
        }}
      >
        <span style={attackCoreStyle(tone)} />
      </div>
      <div style={{ ...targetHitStyle(targetRect, tone), ["--battle-effect-duration" as string]: `${durationMs}ms` }} />
    </>
  );
}

function EnergyTrace({ targetRect, tone, durationMs }: { targetRect: EffectRect; tone: EffectTone; durationMs: number }) {
  const target = centerOf(targetRect);
  return (
    <>
      <div
        style={{
          ...energyOrbStyle(target, tone),
          ["--battle-effect-duration" as string]: `${durationMs}ms`,
        }}
      />
      <div style={{ ...cardPulseStyle(targetRect, tone, "target"), ["--battle-effect-duration" as string]: `${durationMs}ms` }} />
      <strong style={{ ...floatingLabelStyle(target, targetRect, tone, "energy", false), ["--battle-effect-duration" as string]: `${durationMs}ms` }}>
        Energy
      </strong>
    </>
  );
}

function TargetFrame({
  event,
  targetRect,
  tone,
  durationMs,
  particles,
}: {
  event: BattleEffectEvent;
  targetRect: EffectRect;
  tone: EffectTone;
  durationMs: number;
  particles: number[];
}) {
  const target = centerOf(targetRect);
  const label = formatLabel(event);
  const isNumber = event.kind !== "damage" && event.kind !== "heal" && event.amount !== undefined;

  return (
    <>
      <div style={{ ...cardPulseStyle(targetRect, tone, "target", event.kind), ["--battle-effect-duration" as string]: `${durationMs}ms` }} />
      {event.kind === "evolve" && (
        <div style={{ ...cardSweepStyle(targetRect, tone, event.kind), ["--battle-effect-duration" as string]: `${durationMs}ms` }}>
          <span style={sweepLineStyle(tone, event.kind)} />
        </div>
      )}
      <div
        style={{
          ...burstFieldStyle(targetRect),
          ["--battle-effect-duration" as string]: `${durationMs}ms`,
          ["--battle-effect-primary" as string]: tone.primary,
          ["--battle-effect-secondary" as string]: tone.secondary,
        }}
      >
        {particles.map((index) => (
          <span
            key={index}
            style={{
              ...particleStyle(index, particles.length, tone, event.kind),
              animationDelay: `${index * 14}ms`,
            }}
          />
        ))}
      </div>
      {(event.kind === "damage" || event.kind === "heal" || event.kind === "ko" || event.kind === "status" || event.kind === "tool" || event.kind === "evolve") && (
        <strong
          style={{
            ...floatingLabelStyle(target, targetRect, tone, event.kind, isNumber),
            ["--battle-effect-duration" as string]: `${durationMs}ms`,
          }}
        >
          {label}
        </strong>
      )}
    </>
  );
}

function getViewportSize(): { width: number; height: number } {
  return {
    width: typeof window === "undefined" ? 1000 : window.innerWidth,
    height: typeof window === "undefined" ? 700 : window.innerHeight,
  };
}

function getCardRect(uid: number): EffectRect | undefined {
  const node = document.querySelector<HTMLElement>(`[data-battle-effect-card="${uid}"]`);
  if (!node) return undefined;
  const visualNode = node.querySelector<HTMLElement>("[data-battle-effect-visual='true']") ?? node.querySelector<HTMLElement>(".pokemon-card-foil") ?? node;
  const rect = visualNode.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function centerOf(rect: EffectRect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function resolveSlotRect(side: SideId, slot: BattleEffectSlot | undefined, viewportSize: { width: number; height: number }): EffectRect {
  const activeWidth = Math.min(464, Math.max(300, viewportSize.width * 0.21));
  const benchWidth = Math.min(178, Math.max(112, viewportSize.width * 0.09));
  const width = !slot || slot.zone === "active" ? activeWidth : benchWidth;
  const height = width * 1.395;
  const xPercent = !slot || slot.zone === "active"
    ? (side === "player" ? 39 : 61)
    : (side === "player" ? 15 : 85);
  const benchY = slot?.zone === "bench" ? [24, 31, 38, 45, 52][Math.max(0, Math.min(4, slot.index))] ?? 38 : 35;
  const yPercent = !slot || slot.zone === "active" ? 35 : benchY;

  return {
    x: viewportSize.width * (xPercent / 100) - width / 2,
    y: viewportSize.height * (yPercent / 100) - height / 2,
    width,
    height,
  };
}

function formatLabel(event: BattleEffectEvent): string {
  if (event.kind === "damage") return "Damage";
  if (event.kind === "heal") return "Heal";
  if (event.kind === "ko") return "KO";
  if (event.amount !== undefined) return `${event.amount}`;
  return event.label;
}

function toneForEvent(kind: BattleEffectKind, statusCondition?: SpecialCondition | undefined): EffectTone {
  switch (kind) {
    case "damage":
      return { primary: "#f43f5e", secondary: "#fb923c", soft: "rgba(244, 63, 94, 0.16)", strong: "rgba(244, 63, 94, 0.46)", text: colors.white };
    case "heal":
      return { primary: "#22c55e", secondary: "#bbf7d0", soft: "rgba(34, 197, 94, 0.16)", strong: "rgba(34, 197, 94, 0.42)", text: "#052e16" };
    case "energy":
      return { primary: "#38bdf8", secondary: "#facc15", soft: "rgba(56, 189, 248, 0.14)", strong: "rgba(56, 189, 248, 0.46)", text: colors.white };
    case "status":
      return toneForStatusCondition(statusCondition);
    case "tool":
      return { primary: "#facc15", secondary: "#ffffff", soft: "rgba(250, 204, 21, 0.16)", strong: "rgba(250, 204, 21, 0.44)", text: "#451a03" };
    case "evolve":
      return { primary: "#facc15", secondary: "#ffffff", soft: "rgba(250, 204, 21, 0.18)", strong: "rgba(250, 204, 21, 0.52)", text: "#451a03" };
    case "ko":
      return { primary: "#ef4444", secondary: "#111827", soft: "rgba(239, 68, 68, 0.18)", strong: "rgba(127, 29, 29, 0.58)", text: colors.white };
    default:
      return { primary: "#29e6bd", secondary: "#f8fafc", soft: "rgba(41, 230, 189, 0.14)", strong: "rgba(41, 230, 189, 0.42)", text: colors.white };
  }
}

function toneForStatusCondition(condition: SpecialCondition | undefined): EffectTone {
  switch (condition) {
    case "paralysed":
      return { primary: "#facc15", secondary: "#fef9c3", soft: "rgba(250, 204, 21, 0.18)", strong: "rgba(202, 138, 4, 0.48)", text: "#422006" };
    case "burned":
      return { primary: "#fb923c", secondary: "#fed7aa", soft: "rgba(251, 146, 60, 0.18)", strong: "rgba(234, 88, 12, 0.48)", text: "#431407" };
    case "poisoned":
      return { primary: "#a855f7", secondary: "#f0abfc", soft: "rgba(168, 85, 247, 0.16)", strong: "rgba(168, 85, 247, 0.44)", text: colors.white };
    case "frozen":
      return { primary: "#22d3ee", secondary: "#cffafe", soft: "rgba(34, 211, 238, 0.18)", strong: "rgba(8, 145, 178, 0.46)", text: "#083344" };
    case "asleep":
      return { primary: "#94a3b8", secondary: "#e2e8f0", soft: "rgba(148, 163, 184, 0.18)", strong: "rgba(71, 85, 105, 0.42)", text: "#0f172a" };
    default:
      return { primary: "#a855f7", secondary: "#f0abfc", soft: "rgba(168, 85, 247, 0.16)", strong: "rgba(168, 85, 247, 0.44)", text: colors.white };
  }
}

function particleCountForKind(kind: BattleEffectKind): number {
  if (kind === "ko") return 24;
  if (kind === "evolve") return 22;
  if (kind === "heal" || kind === "status" || kind === "tool") return 12;
  return 14;
}

function durationForEvent(kind: BattleEffectKind): number {
  if (kind === "ko") return 1360;
  if (kind === "evolve") return 980;
  if (kind === "damage" || kind === "heal") return 840;
  if (kind === "attack") return 780;
  if (kind === "status" || kind === "tool") return 860;
  return 760;
}

const rootStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  pointerEvents: "none",
  overflow: "hidden",
};

function cardPulseStyle(rect: EffectRect, tone: EffectTone, role: "source" | "target", kind: BattleEffectKind = "attack"): CSSProperties {
  const inset = Math.max(4, Math.min(14, rect.width * 0.035));
  const animation = role === "source"
    ? "battle-source-lean"
    : kind === "ko"
      ? "battle-ko-frame"
      : kind === "heal"
        ? "battle-heal-frame"
        : "battle-target-frame";

  return {
    position: "absolute",
    left: rect.x - inset,
    top: rect.y - inset,
    width: rect.width + inset * 2,
    height: rect.height + inset * 2,
    borderRadius: Math.max(radius.md, rect.width * 0.055),
    border: `2px solid ${tone.primary}`,
    background: kind === "ko"
      ? `linear-gradient(135deg, ${tone.strong} 0%, rgba(17, 24, 39, 0.18) 48%, transparent 100%)`
      : `radial-gradient(circle at 50% 44%, ${tone.soft} 0%, transparent 68%)`,
    boxShadow: `0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 34px ${tone.strong}`,
    transformOrigin: "center",
    animation: `${animation} var(--battle-effect-duration) cubic-bezier(0.2, 0.8, 0.2, 1) both`,
    willChange: "opacity, transform, filter",
  };
}

function attackLineStyle(source: { x: number; y: number }, length: number, angle: number, tone: EffectTone): CSSProperties {
  return {
    position: "absolute",
    left: source.x,
    top: source.y,
    width: Math.max(1, length),
    height: 44,
    borderRadius: radius.pill,
    transform: `translateY(-50%) rotate(${angle}rad)`,
    transformOrigin: "left center",
    opacity: 0,
    filter: `drop-shadow(0 0 18px ${tone.strong})`,
    animation: "battle-attack-line var(--battle-effect-duration) cubic-bezier(0.16, 0.82, 0.2, 1) both",
    overflow: "hidden",
  };
}

function attackCoreStyle(tone: EffectTone): CSSProperties {
  return {
    position: "absolute",
    inset: "10px 0",
    borderRadius: radius.pill,
    background: `linear-gradient(90deg, transparent 0%, ${tone.secondary} 26%, ${tone.primary} 50%, ${tone.secondary} 72%, transparent 100%)`,
    boxShadow: `0 0 24px ${tone.strong}`,
  };
}

function targetHitStyle(rect: EffectRect, tone: EffectTone): CSSProperties {
  const center = centerOf(rect);
  const size = Math.max(92, Math.min(rect.width, rect.height) * 0.58);
  return {
    position: "absolute",
    left: center.x,
    top: center.y,
    width: size,
    height: size,
    borderRadius: radius.circle,
    border: `3px solid ${tone.primary}`,
    background: `radial-gradient(circle, ${tone.strong} 0%, ${tone.soft} 42%, transparent 70%)`,
    transform: "translate(-50%, -50%)",
    animation: "battle-hit-ring var(--battle-effect-duration) ease-out both",
  };
}

function energyOrbStyle(target: { x: number; y: number }, tone: EffectTone): CSSProperties {
  return {
    position: "absolute",
    left: target.x,
    top: target.y,
    width: 42,
    height: 42,
    borderRadius: radius.circle,
    background: `radial-gradient(circle at 30% 25%, #ffffff 0%, ${tone.primary} 42%, ${tone.secondary} 72%, rgba(15, 23, 42, 0.18) 100%)`,
    boxShadow: `0 0 28px ${tone.primary}, ${shadows.sm}`,
    animation: "battle-energy-orb var(--battle-effect-duration) cubic-bezier(0.16, 0.82, 0.2, 1) both",
  } as CSSProperties;
}

function burstFieldStyle(rect: EffectRect): CSSProperties {
  const center = centerOf(rect);
  const size = Math.max(116, Math.min(260, Math.max(rect.width, rect.height) * 0.54));
  return {
    position: "absolute",
    left: center.x,
    top: center.y,
    width: size,
    height: size,
    transform: "translate(-50%, -50%)",
  };
}

function particleStyle(index: number, total: number, tone: EffectTone, kind: BattleEffectKind): CSSProperties {
  const angle = (index / total) * Math.PI * 2;
  const distance = kind === "heal" ? 68 + (index % 4) * 10 : kind === "evolve" ? 98 + (index % 3) * 14 : kind === "ko" ? 112 + (index % 5) * 12 : kind === "status" || kind === "tool" ? 86 + (index % 4) * 10 : 78 + (index % 4) * 10;
  const x = `${Math.round(Math.cos(angle) * distance)}px`;
  const y = `${Math.round(Math.sin(angle) * distance)}px`;
  const width = kind === "heal" ? 8 : kind === "evolve" ? 7 : 9;
  const height = kind === "heal" ? 16 : kind === "evolve" ? 27 : 28;

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width,
    height,
    borderRadius: radius.pill,
    background: `linear-gradient(180deg, ${tone.secondary}, ${tone.primary})`,
    boxShadow: `0 0 16px ${tone.strong}`,
    transform: `translate(-50%, -50%) rotate(${angle}rad)`,
    ["--battle-particle-x" as string]: x,
    ["--battle-particle-y" as string]: y,
    animation: `${kind === "heal" ? "battle-heal-particle" : "battle-particle"} var(--battle-effect-duration) cubic-bezier(0.18, 0.8, 0.22, 1) both`,
  } as CSSProperties;
}

function floatingLabelStyle(
  center: { x: number; y: number },
  rect: EffectRect,
  tone: EffectTone,
  kind: BattleEffectKind,
  isNumber: boolean,
): CSSProperties {
  const labelWidth = isNumber ? Math.max(58, Math.min(94, rect.width * 0.28)) : Math.max(70, Math.min(112, rect.width * 0.3));
  const x = center.x;
  const y = center.y;
  const fontSize = isNumber ? Math.max(20, Math.min(42, rect.width * 0.11)) : Math.max(16, Math.min(28, rect.width * 0.075));

  return {
    position: "absolute",
    left: x,
    top: y,
    zIndex: 2,
    minWidth: labelWidth,
    padding: isNumber ? "9px 14px" : "8px 16px",
    borderRadius: radius.md,
    border: "1px solid rgba(255, 255, 255, 0.44)",
    background: `linear-gradient(135deg, ${tone.primary} 0%, ${tone.secondary} 100%)`,
    color: tone.text,
    fontFamily: fontStacks.ui,
    textAlign: "center",
    fontSize,
    lineHeight: 0.95,
    fontWeight: 950,
    letterSpacing: 0,
    textShadow: tone.text === colors.white ? "0 3px 10px rgba(0, 0, 0, 0.48)" : "none",
    boxShadow: `0 16px 38px ${tone.strong}`,
    transform: "translate(-50%, -50%)",
    animation: `${kind === "ko" ? "battle-ko-label" : "battle-float-label"} var(--battle-effect-duration) cubic-bezier(0.2, 0.8, 0.2, 1) both`,
    whiteSpace: "nowrap",
  };
}

function cardSweepStyle(rect: EffectRect, tone: EffectTone, kind: BattleEffectKind): CSSProperties {
  return {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    borderRadius: Math.max(radius.md, rect.width * 0.045),
    overflow: "hidden",
    opacity: 0,
    boxShadow: kind === "ko" ? `inset 0 0 42px ${tone.strong}` : `inset 0 0 34px ${tone.strong}`,
    animation: `${kind === "ko" ? "battle-ko-veil" : "battle-evolve-veil"} var(--battle-effect-duration) ease both`,
  };
}

function sweepLineStyle(tone: EffectTone, kind: BattleEffectKind): CSSProperties {
  return {
    position: "absolute",
    left: "-35%",
    top: "-10%",
    width: "34%",
    height: "125%",
    background: kind === "ko"
      ? `linear-gradient(90deg, transparent 0%, ${tone.strong} 48%, transparent 100%)`
      : `linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.86) 48%, ${tone.secondary} 58%, transparent 100%)`,
    transform: "skewX(-14deg)",
    animation: "battle-card-sweep var(--battle-effect-duration) cubic-bezier(0.2, 0.8, 0.2, 1) both",
  };
}

const KEYFRAMES = `
@keyframes battle-source-lean {
  0% { opacity: 0; transform: translateX(0) scale(1); }
  12% { opacity: 1; transform: translateX(0) scale(1.024); filter: saturate(1.16); }
  38% { opacity: 0.96; transform: translateX(11px) scale(1.038); }
  100% { opacity: 0; transform: translateX(0) scale(1); }
}

@keyframes battle-target-frame {
  0% { opacity: 0; transform: scale(0.98); filter: brightness(1); }
  16% { opacity: 1; transform: scale(1.02); filter: brightness(1.12) saturate(1.08); }
  54% { opacity: 0.68; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.035); filter: brightness(1); }
}

@keyframes battle-heal-frame {
  0% { opacity: 0; transform: scale(0.96); filter: brightness(1); }
  18% { opacity: 1; transform: scale(1.018); filter: brightness(1.16) saturate(1.12); }
  70% { opacity: 0.72; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.024); }
}

@keyframes battle-ko-frame {
  0% { opacity: 0; transform: translateX(0) rotate(0deg) scale(1); filter: grayscale(0); }
  13% { opacity: 1; transform: translateX(-5px) rotate(-1.6deg) scale(1.018); filter: grayscale(0.35); }
  25% { transform: translateX(5px) rotate(1.2deg) scale(1.01); }
  42% { transform: translateX(-3px) rotate(-0.8deg) scale(1); filter: grayscale(0.7); }
  100% { opacity: 0; transform: translateX(0) rotate(0deg) scale(0.96); filter: grayscale(1); }
}

@keyframes battle-attack-line {
  0% { opacity: 0; clip-path: inset(0 100% 0 0); }
  12% { opacity: 0.96; clip-path: inset(0 76% 0 0); }
  34% { opacity: 1; clip-path: inset(0 0 0 0); }
  60% { opacity: 0.76; clip-path: inset(0 0 0 54%); }
  100% { opacity: 0; clip-path: inset(0 0 0 100%); }
}

@keyframes battle-hit-ring {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.28); }
  20% { opacity: 1; transform: translate(-50%, -50%) scale(0.74); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.62); }
}

@keyframes battle-energy-orb {
  0% { opacity: 0; transform: translate(-50%, 38vh) scale(0.5); }
  18% { opacity: 1; transform: translate(-50%, 18vh) scale(1.08); }
  58% { opacity: 1; transform: translate(-50%, -50%) scale(0.82); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.46); }
}

@keyframes battle-particle {
  0% { opacity: 0; translate: -50% -50%; scale: 0.24; }
  18% { opacity: 1; }
  100% { opacity: 0; translate: calc(-50% + var(--battle-particle-x)) calc(-50% + var(--battle-particle-y)); scale: 0.82; }
}

@keyframes battle-heal-particle {
  0% { opacity: 0; translate: -50% -20%; scale: 0.24; }
  18% { opacity: 0.95; }
  100% { opacity: 0; translate: calc(-50% + var(--battle-particle-x)) calc(-90% + var(--battle-particle-y)); scale: 0.9; }
}

@keyframes battle-float-label {
  0% { opacity: 0; transform: translate(-50%, calc(-50% + 14px)) rotate(-8deg) scale(0.68); }
  16% { opacity: 1; transform: translate(-50%, calc(-50% - 6px)) rotate(-8deg) scale(1.12); }
  42% { transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  76% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% - 26px)) rotate(-8deg) scale(0.92); }
}

@keyframes battle-ko-label {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(-8deg) scale(1.36); }
  16% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  64% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% - 18px)) rotate(-8deg) scale(0.86); }
}

@keyframes battle-evolve-veil {
  0% { opacity: 0; filter: brightness(1); }
  20% { opacity: 1; filter: brightness(1.16); }
  66% { opacity: 0.82; }
  100% { opacity: 0; filter: brightness(1); }
}

@keyframes battle-ko-veil {
  0% { opacity: 0; }
  18% { opacity: 0.82; }
  66% { opacity: 0.5; }
  100% { opacity: 0; }
}

@keyframes battle-card-sweep {
  0% { transform: translateX(0) skewX(-14deg); }
  58% { transform: translateX(420%) skewX(-14deg); }
  100% { transform: translateX(420%) skewX(-14deg); }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;
