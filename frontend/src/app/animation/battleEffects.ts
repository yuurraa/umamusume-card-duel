import { getNewGameEvents } from "../../game/engine";
import type { BattleEffectBoardSnapshot, BattleEffectEvent, BattleEffectRect, BattleEffectSlot } from "../../match/feedback/BattleEffectOverlay";
import type { EnergyType, GameEvent, GameState, SideId, SpecialCondition, UmamusumeInstance } from "../../../../shared/src/types";

export type BattleSnapshotEntry = {
  uid: number;
  sideId: SideId;
  slot: BattleEffectSlot;
  rect?: BattleEffectRect | undefined;
  cardId: string;
  hp: number;
  maxHp: number;
  energyCount: number;
  specialConditions: string;
  toolCardId: string | null;
  umamusume: UmamusumeInstance;
};

export type BattleSnapshot = {
  player: BattleSnapshotEntry[];
  opponent: BattleSnapshotEntry[];
  phase: GameState["phase"];
  gameOver: boolean;
  events: GameEvent[];
};

export type BattleSnapshotOptions = {
  /** Reuse geometry already captured for cards that remain on the board. */
  reuseRects?: ReadonlyMap<number, BattleEffectRect | undefined>;
};

export type PointGainEvent = {
  id: number;
  side: SideId;
  previousPoints: number;
  points: number;
};

export type VisualHpByUid = Record<number, number>;
export type VisualAttachedEnergyByUid = Record<number, EnergyType[]>;
export type KoRetainedBoardBySide = Partial<Record<SideId, BattleEffectBoardSnapshot>>;

export function createBattleSnapshot(state: GameState, options: BattleSnapshotOptions = {}): BattleSnapshot {
  const collect = (sideId: SideId): BattleSnapshotEntry[] => {
    const side = state.sides[sideId];
    const active = side.active ? [{ umamusume: side.active, slot: { zone: "active" } satisfies BattleEffectSlot }] : [];
    const bench = side.bench.map((umamusume, index) => ({ umamusume, slot: { zone: "bench", index } satisfies BattleEffectSlot }));
    return [...active, ...bench].map(({ umamusume: entry, slot }) => ({
      uid: entry.uid,
      sideId,
      slot,
      rect: options.reuseRects?.has(entry.uid)
        ? options.reuseRects.get(entry.uid)
        : readBattleEffectCardRect(entry.uid),
      cardId: entry.cardId,
      hp: entry.hp,
      maxHp: entry.maxHp,
      energyCount: Object.values(entry.energies).reduce((sum, amount) => sum + amount, 0),
      specialConditions: [...entry.specialConditions].sort().join("|"),
      toolCardId: entry.toolCardId,
      umamusume: cloneBattleSnapshotUmamusume(entry),
    }));
  };

  return {
    player: collect("player"),
    opponent: collect("opponent"),
    phase: state.phase,
    gameOver: state.gameOver,
    events: [...(state.events ?? [])],
  };
}

export function cloneBattleSnapshotUmamusume(umamusume: UmamusumeInstance): UmamusumeInstance {
  return {
    ...umamusume,
    energies: { ...umamusume.energies },
    specialConditions: [...umamusume.specialConditions],
    evolutionCardIds: [...(umamusume.evolutionCardIds ?? [])],
  };
}

export function cloneBattleEffectBoardSnapshot(snapshot: BattleEffectBoardSnapshot): BattleEffectBoardSnapshot {
  return {
    active: snapshot.active ? cloneBattleSnapshotUmamusume(snapshot.active) : null,
    bench: snapshot.bench.map((umamusume) => cloneBattleSnapshotUmamusume(umamusume)),
  };
}

function createBattleEffectBoardSnapshot(snapshot: BattleSnapshot, sideId: SideId): BattleEffectBoardSnapshot {
  const entries = snapshot[sideId];
  const active = entries.find((entry) => entry.slot.zone === "active")?.umamusume ?? null;
  const bench = entries
    .filter((entry) => entry.slot.zone === "bench")
    .sort((left, right) => {
      const leftIndex = left.slot.zone === "bench" ? left.slot.index : 0;
      const rightIndex = right.slot.zone === "bench" ? right.slot.index : 0;
      return leftIndex - rightIndex;
    })
    .map((entry) => entry.umamusume);
  return {
    active: active ? cloneBattleSnapshotUmamusume(active) : null,
    bench: bench.map((umamusume) => cloneBattleSnapshotUmamusume(umamusume)),
  };
}

export function getAttachedEnergyFromUmamusume(umamusume: UmamusumeInstance): EnergyType[] {
  const energies = Object.entries(umamusume.energies) as [EnergyType, number][];
  return energies.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
}

export function withRetainedKoBoard(
  state: GameState,
  queue: BattleEffectEvent[],
  retainedBoardBySide: KoRetainedBoardBySide,
): GameState {
  const queuedBoardBySide: KoRetainedBoardBySide = {};
  queue.forEach((effect) => {
    if (!effect.targetBoardBefore) return;
    queuedBoardBySide[effect.side] = cloneBattleEffectBoardSnapshot(effect.targetBoardBefore);
  });
  const effectiveBySide: KoRetainedBoardBySide = {
    ...retainedBoardBySide,
    ...queuedBoardBySide,
  };
  if (!effectiveBySide.player && !effectiveBySide.opponent) return state;
  const nextSides = { ...state.sides };
  (["player", "opponent"] as SideId[]).forEach((sideId) => {
    const retainedBoard = effectiveBySide[sideId];
    if (!retainedBoard) return;
    const side = nextSides[sideId];
    nextSides[sideId] = {
      ...side,
      active: retainedBoard.active ? cloneBattleSnapshotUmamusume(retainedBoard.active) : null,
      bench: retainedBoard.bench.map((umamusume) => cloneBattleSnapshotUmamusume(umamusume)),
    };
  });
  return {
    ...state,
    sides: nextSides,
  };
}

export function withKoVacantActive(state: GameState, vacancyBySide: Partial<Record<SideId, boolean>>): GameState {
  const playerVacant = Boolean(vacancyBySide.player);
  const opponentVacant = Boolean(vacancyBySide.opponent);
  if (!playerVacant && !opponentVacant) return state;
  return {
    ...state,
    sides: {
      ...state.sides,
      player: playerVacant ? { ...state.sides.player, active: null } : state.sides.player,
      opponent: opponentVacant ? { ...state.sides.opponent, active: null } : state.sides.opponent,
    },
  };
}

export function getBattleEntries(snapshot: BattleSnapshot): BattleSnapshotEntry[] {
  return [...snapshot.player, ...snapshot.opponent];
}

function readBattleEffectCardRect(uid: number): BattleEffectRect | undefined {
  if (typeof document === "undefined") return undefined;
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

function getAddedSpecialCondition(before: BattleSnapshotEntry, entry: BattleSnapshotEntry): SpecialCondition | null {
  const beforeConditions = new Set(before.specialConditions.split("|").filter(Boolean));
  const currentConditions = entry.specialConditions.split("|").filter(Boolean) as SpecialCondition[];
  return currentConditions.find((condition) => !beforeConditions.has(condition)) ?? currentConditions[0] ?? null;
}

function statusLabel(condition: SpecialCondition | null): string {
  if (condition === "asleep") return "Asleep";
  if (condition === "burned") return "Burned";
  if (condition === "frozen") return "Frozen";
  if (condition === "paralysed") return "Paralysed";
  if (condition === "poisoned") return "Poisoned";
  return "Status";
}

export function buildBattleEffects(
  previous: BattleSnapshot,
  current: BattleSnapshot,
  nextId: () => number,
): BattleEffectEvent[] {
  if (current.phase !== "play" || (current.gameOver && previous.gameOver)) return [];
  const previousByUid = new Map(getBattleEntries(previous).map((entry) => [entry.uid, entry]));
  const currentByUid = new Map(getBattleEntries(current).map((entry) => [entry.uid, entry]));
  const previousBoardBySide: Record<SideId, BattleEffectBoardSnapshot> = {
    player: createBattleEffectBoardSnapshot(previous, "player"),
    opponent: createBattleEffectBoardSnapshot(previous, "opponent"),
  };
  const effects: BattleEffectEvent[] = [];
  const newEvents = getNewGameEvents(previous.events, current.events);
  const hpBatchKey = `events-${newEvents.map((event) => event.id).join("-") || "none"}`;
  const attackEvent = newEvents.find((event): event is Extract<GameEvent, { kind: "attack" }> => event.kind === "attack");
  const knockoutEvents = newEvents.filter((event): event is Extract<GameEvent, { kind: "knockout" }> => event.kind === "knockout");
  const attackSourceSide = attackEvent?.actorSide ?? null;
  const attackDefendingSide = attackSourceSide ? (attackSourceSide === "player" ? "opponent" : "player") : null;
  const hasKnockout = knockoutEvents.length > 0;
  const knockedSide = knockoutEvents[0]?.knockedSide ?? null;
  const knockedEntries = getBattleEntries(previous).filter((entry) => {
    if (currentByUid.has(entry.uid)) return false;
    return knockoutEvents.some((event) => event.targetUid === entry.uid);
  });
  const knockedEntry = knockedEntries[0] ?? (
    knockedSide
      ? previous[knockedSide].find((entry) => !currentByUid.has(entry.uid))
        ?? previous[knockedSide].find((entry) => entry.slot.zone === "active")
      : undefined
  );
  const hpDrops = getBattleEntries(current)
    .map((entry) => ({ entry, before: previousByUid.get(entry.uid) }))
    .filter((change): change is { entry: BattleSnapshotEntry; before: BattleSnapshotEntry } => Boolean(change.before && change.entry.hp < change.before.hp));

  if (attackEvent) {
    const sourceSide = attackSourceSide ?? "player";
    const defendingSide = attackDefendingSide ?? (sourceSide === "player" ? "opponent" : "player");
    const source = current[sourceSide].find((entry) => entry.uid === attackEvent?.actorUid)
      ?? current[sourceSide].find((entry) => entry.slot.zone === "active")
      ?? previous[sourceSide].find((entry) => entry.uid === attackEvent?.actorUid);
    const structuredTarget = attackEvent
      ? current[attackEvent.targetSide].find((entry) => entry.uid === attackEvent.targetUid)
        ?? previous[attackEvent.targetSide].find((entry) => entry.uid === attackEvent.targetUid)
      : undefined;
    const target = structuredTarget
      ?? hpDrops.find((change) => change.entry.sideId === defendingSide)?.entry
      ?? (knockedEntry?.sideId === defendingSide ? knockedEntry : undefined)
      ?? current[defendingSide].find((entry) => entry.slot.zone === "active");
    effects.push({
      id: nextId(),
      kind: "attack",
      sourceUid: source?.uid,
      targetUid: target?.uid,
      sourceSide,
      sourceSlot: { zone: "active" },
      sourceRect: source?.rect,
      targetCardId: target?.cardId,
      side: target?.sideId ?? defendingSide,
      targetSlot: target?.slot ?? { zone: "active" },
      targetRect: target?.rect,
      label: "Attack",
    });
  }

  for (const entry of getBattleEntries(current)) {
    const before = previousByUid.get(entry.uid);
    if (!before) continue;
    if (entry.cardId !== before.cardId) {
      const structuredEvolution = newEvents.some((event) => event.kind === "evolution" && event.targetUid === entry.uid);
      if (structuredEvolution) {
        effects.push({ id: nextId(), kind: "evolve", side: entry.sideId, targetUid: entry.uid, targetSlot: entry.slot, targetRect: entry.rect ?? before.rect, label: "Evolve" });
      }
    }
    if (entry.energyCount > before.energyCount) {
      const structuredEnergy = newEvents.some((event) => event.kind === "energy" && event.targetUid === entry.uid);
      if (structuredEnergy) {
        effects.push({
          id: nextId(),
          kind: "energy",
          side: entry.sideId,
          targetUid: entry.uid,
          targetSlot: entry.slot,
          targetRect: entry.rect ?? before.rect,
          attachedEnergyBefore: getAttachedEnergyFromUmamusume(before.umamusume),
          attachedEnergyAfter: getAttachedEnergyFromUmamusume(entry.umamusume),
          label: "Energy",
        });
      }
    }
    if (entry.specialConditions !== before.specialConditions && entry.specialConditions) {
      const structuredStatus = newEvents.some((event) => event.kind === "status" && event.targetUid === entry.uid);
      if (structuredStatus) {
        const condition = getAddedSpecialCondition(before, entry);
        effects.push({
          id: nextId(),
          kind: "status",
          side: entry.sideId,
          targetUid: entry.uid,
          targetSlot: entry.slot,
          targetRect: entry.rect ?? before.rect,
          targetCardId: entry.cardId,
          statusCondition: condition ?? undefined,
          label: statusLabel(condition),
        });
      }
    }
    if (entry.toolCardId && entry.toolCardId !== before.toolCardId) {
      const structuredTool = newEvents.some((event) => event.kind === "cardMovement"
        && event.side === entry.sideId
        && event.from === "hand"
        && event.to === "play"
        && event.cardIds?.includes(entry.toolCardId ?? ""));
      if (structuredTool) {
        effects.push({
          id: nextId(),
          kind: "tool",
          side: entry.sideId,
          targetUid: entry.uid,
          targetSlot: entry.slot,
          targetRect: entry.rect ?? before.rect,
          targetCardId: entry.cardId,
          label: "Tool",
        });
      }
    }
    if (entry.hp < before.hp) {
      const alreadyTracked = effects.some(
        (effect) => (effect.kind === "damage" || effect.kind === "ko")
          && effect.targetUid === entry.uid
          && effect.hpAfter === entry.hp,
      );
      if (alreadyTracked) continue;
      const sourceSide = attackSourceSide ?? undefined;
      const source = sourceSide
        ? current[sourceSide].find((sourceEntry) => sourceEntry.uid === attackEvent?.actorUid)
          ?? current[sourceSide].find((sourceEntry) => sourceEntry.slot.zone === "active")
        : undefined;
      const structuredDamage = newEvents.find((event): event is Extract<GameEvent, { kind: "damage" | "heal" }> => (
        event.kind === "damage" && event.targetUid === entry.uid
      ));
      const structuredAttackDamage = attackEvent?.targetUid === entry.uid && attackEvent.hpAfter < attackEvent.hpBefore;
      const isKnockedOutEntry = Boolean(hasKnockout && knockedEntries.some((knocked) => knocked.uid === entry.uid));
      if (!structuredAttackDamage && !isKnockedOutEntry && !structuredDamage) continue;
      const hpBefore = structuredDamage?.hpBefore ?? (structuredAttackDamage ? attackEvent.hpBefore : before.hp);
      const hpAfter = structuredDamage?.hpAfter ?? (structuredAttackDamage ? attackEvent.hpAfter : entry.hp);
      effects.push({
        id: nextId(),
        batchKey: hpBatchKey,
        kind: hasKnockout && entry.hp === 0 ? "ko" : "damage",
        side: entry.sideId,
        targetUid: entry.uid,
        sourceUid: source?.uid,
        sourceSide,
        sourceSlot: attackEvent ? { zone: "active" } : undefined,
        sourceRect: source?.rect,
        targetCardId: entry.cardId,
        targetUmamusume: entry.umamusume,
        targetBoardBefore: hasKnockout && entry.hp === 0 ? previousBoardBySide[entry.sideId] : undefined,
        targetSlot: entry.slot,
        targetRect: entry.rect ?? before.rect,
        amount: structuredDamage?.amount ?? (hpBefore - hpAfter),
        hpBefore,
        hpAfter,
        label: "Damage",
      });
    } else if (entry.hp > before.hp) {
      const alreadyTracked = effects.some(
        (effect) => effect.kind === "heal"
          && effect.targetUid === entry.uid
          && effect.hpAfter === entry.hp,
      );
      if (alreadyTracked) continue;
      const structuredHeal = newEvents.some((event) => event.kind === "heal" && event.targetUid === entry.uid);
      if (!structuredHeal) continue;
      effects.push({
        id: nextId(),
        batchKey: hpBatchKey,
        kind: "heal",
        side: entry.sideId,
        targetUid: entry.uid,
        targetSlot: entry.slot,
        targetRect: entry.rect ?? before.rect,
        targetCardId: entry.cardId,
        amount: entry.hp - before.hp,
        hpBefore: before.hp,
        hpAfter: entry.hp,
        label: "Heal",
      });
    }
  }

  if (hasKnockout) {
    const sourceSide = attackEvent?.actorSide;
    const source = sourceSide
      ? current[sourceSide].find((entry) => entry.uid === attackEvent?.actorUid)
        ?? current[sourceSide].find((entry) => entry.slot.zone === "active")
      : undefined;
    const fallbackKnockedEntries = knockedEntries.length > 0 ? knockedEntries : knockedEntry ? [knockedEntry] : [];
    fallbackKnockedEntries.forEach((knocked) => {
      if (!effects.some((effect) => effect.kind === "damage" && effect.targetUid === knocked.uid)) {
        effects.push({
          id: nextId(),
          batchKey: hpBatchKey,
          kind: "damage",
          side: knocked.sideId,
          targetUid: knocked.uid,
          sourceUid: source?.uid,
          sourceSide,
          sourceSlot: attackEvent ? { zone: "active" } : undefined,
          sourceRect: source?.rect,
          targetCardId: knocked.cardId,
          targetUmamusume: knocked.umamusume,
          targetBoardBefore: previousBoardBySide[knocked.sideId],
          targetSlot: knocked.slot,
          targetRect: knocked.rect,
          amount: knocked.hp,
          hpBefore: knocked.hp,
          hpAfter: 0,
          label: "Damage",
        });
      }
      if (effects.some((effect) => effect.kind === "ko" && effect.targetUid === knocked.uid)) return;
      effects.push({
        id: nextId(),
        kind: "ko",
        side: knocked.sideId,
        targetUid: knocked.uid,
        sourceUid: source?.uid,
        sourceSide,
          sourceSlot: attackEvent ? { zone: "active" } : undefined,
        sourceRect: source?.rect,
        targetCardId: knocked.cardId,
        targetUmamusume: knocked.umamusume,
        targetBoardBefore: previousBoardBySide[knocked.sideId],
        targetSlot: knocked.slot,
        targetRect: knocked.rect,
        hpBefore: knocked.hp,
        hpAfter: 0,
        label: "KO",
      });
    });
  }

  return effects;
}

export function getLeadingBattleEffectBatch(queue: BattleEffectEvent[]): BattleEffectEvent[] {
  const first = queue[0];
  if (!first) return [];
  if (!first.batchKey) return [first];
  const batch: BattleEffectEvent[] = [];
  for (const effect of queue) {
    if (effect.batchKey !== first.batchKey) break;
    batch.push(effect);
  }
  return batch;
}
