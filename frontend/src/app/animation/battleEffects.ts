import { getCard } from "../../game/engine";
import type { BattleEffectBoardSnapshot, BattleEffectEvent, BattleEffectRect, BattleEffectSlot } from "../../match/feedback/BattleEffectOverlay";
import type { EnergyType, GameState, SideId, SpecialCondition, UmamusumeInstance } from "../../../../shared/src/types";
import { getNewLogHeadEntries } from "../matchLog";

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
  log: string[];
  phase: GameState["phase"];
  gameOver: boolean;
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

export function createBattleSnapshot(state: GameState): BattleSnapshot {
  const collect = (sideId: SideId): BattleSnapshotEntry[] => {
    const side = state.sides[sideId];
    const active = side.active ? [{ umamusume: side.active, slot: { zone: "active" } satisfies BattleEffectSlot }] : [];
    const bench = side.bench.map((umamusume, index) => ({ umamusume, slot: { zone: "bench", index } satisfies BattleEffectSlot }));
    return [...active, ...bench].map(({ umamusume: entry, slot }) => ({
      uid: entry.uid,
      sideId,
      slot,
      rect: readBattleEffectCardRect(entry.uid),
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
    log: [...state.log],
    phase: state.phase,
    gameOver: state.gameOver,
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

function getActorSideFromLog(entry: string): SideId | null {
  if (entry.startsWith("You ") || entry.startsWith("Your ")) return "player";
  if (entry.startsWith("Opponent ") || entry.startsWith("Opponent's ")) return "opponent";
  return null;
}

function getBattleEntryCardName(entry: BattleSnapshotEntry): string | null {
  try {
    return getCard(entry.cardId).name;
  } catch {
    return null;
  }
}

function logMentionsBattleEntry(logEntry: string, entry: BattleSnapshotEntry): boolean {
  const cardName = getBattleEntryCardName(entry);
  if (cardName && logEntry.includes(cardName)) return true;
  return entry.slot.zone === "active" && /\bactive\b/i.test(logEntry);
}

function koLogMatchesBattleEntry(logEntry: string, entry: BattleSnapshotEntry): boolean {
  const logSide: SideId = logEntry.startsWith("Opponent's") ? "opponent" : "player";
  return entry.sideId === logSide && logMentionsBattleEntry(logEntry, entry);
}

function findSupportingLogEntry(
  newEntries: string[],
  entry: BattleSnapshotEntry,
  kind: "damage" | "heal" | "energy" | "status" | "tool" | "evolve",
  claimedLogIndexes: Set<number>,
  before?: BattleSnapshotEntry,
): number | null {
  for (let index = 0; index < newEntries.length; index += 1) {
    if (claimedLogIndexes.has(index)) continue;
    const logEntry = newEntries[index] ?? "";
    const lowered = logEntry.toLowerCase();
    if (kind === "damage" && !lowered.includes("damage")) continue;
    if (kind === "heal" && !lowered.includes("healed")) continue;
    if (kind === "energy" && !lowered.includes("attached 1") && !lowered.includes("moved 1") && !lowered.includes("generated 1")) continue;
    if (kind === "status" && !lowered.includes(" is ") && !lowered.includes("special condition")) continue;
    if (kind === "tool" && !lowered.includes(" attached ")) continue;
    if (kind === "evolve") {
      const previousName = before ? getBattleEntryCardName(before) : null;
      const currentName = getBattleEntryCardName(entry);
      if (!lowered.includes("evolved") && !lowered.includes("skipped stage")) continue;
      if ((currentName && logEntry.includes(currentName)) || (previousName && logEntry.includes(previousName))) return index;
      continue;
    }
    if (logMentionsBattleEntry(logEntry, entry)) return index;
  }
  return null;
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
  const hpBatchKey = `hp-${previous.log.length}-${current.log.length}`;
  const newEntries = getNewLogHeadEntries(previous.log, current.log);
  const attackEntry = newEntries.find((entry) => entry.includes(" attacked with "));
  const attackSourceSide = attackEntry
    ? getActorSideFromLog(attackEntry) ?? (current.log[0] ? getActorSideFromLog(current.log[0]) : null)
    : null;
  const attackDefendingSide = attackSourceSide ? (attackSourceSide === "player" ? "opponent" : "player") : null;
  const koEntries = newEntries.filter((entry) => entry.includes(" was knocked out"));
  const koEntry = koEntries[0];
  const claimedLogIndexes = new Set<number>();
  const knockedSide = koEntry?.startsWith("Opponent's") ? "opponent" : koEntry ? "player" : null;
  const knockedEntries = getBattleEntries(previous).filter((entry) => {
    if (currentByUid.has(entry.uid)) return false;
    return koEntries.some((logEntry) => koLogMatchesBattleEntry(logEntry, entry));
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

  if (attackEntry) {
    const sourceSide = attackSourceSide ?? "player";
    const defendingSide = attackDefendingSide ?? (sourceSide === "player" ? "opponent" : "player");
    const source = current[sourceSide].find((entry) => entry.slot.zone === "active");
    const target = hpDrops.find((change) => change.entry.sideId === defendingSide)?.entry
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
      const logIndex = findSupportingLogEntry(newEntries, entry, "evolve", claimedLogIndexes, before);
      if (logIndex !== null) {
        claimedLogIndexes.add(logIndex);
        effects.push({ id: nextId(), kind: "evolve", side: entry.sideId, targetUid: entry.uid, targetSlot: entry.slot, targetRect: entry.rect ?? before.rect, label: "Evolve" });
      }
    }
    if (entry.energyCount > before.energyCount) {
      const logIndex = findSupportingLogEntry(newEntries, entry, "energy", claimedLogIndexes);
      if (logIndex === null) continue;
      if (logIndex !== null) claimedLogIndexes.add(logIndex);
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
    if (entry.specialConditions !== before.specialConditions && entry.specialConditions) {
      const logIndex = findSupportingLogEntry(newEntries, entry, "status", claimedLogIndexes);
      if (logIndex !== null) {
        const condition = getAddedSpecialCondition(before, entry);
        claimedLogIndexes.add(logIndex);
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
      const logIndex = findSupportingLogEntry(newEntries, entry, "tool", claimedLogIndexes);
      if (logIndex === null) continue;
      if (logIndex !== null) claimedLogIndexes.add(logIndex);
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
    if (entry.hp < before.hp) {
      const alreadyTracked = effects.some(
        (effect) => (effect.kind === "damage" || effect.kind === "ko")
          && effect.targetUid === entry.uid
          && effect.hpAfter === entry.hp,
      );
      if (alreadyTracked) continue;
      const amount = before.hp - entry.hp;
      const sourceSide = attackSourceSide ?? undefined;
      const source = sourceSide ? current[sourceSide].find((sourceEntry) => sourceEntry.slot.zone === "active") : undefined;
      const logIndex = findSupportingLogEntry(newEntries, entry, "damage", claimedLogIndexes);
      const isAttackDamageCandidate = Boolean(attackEntry && attackDefendingSide && entry.sideId === attackDefendingSide);
      const isKnockedOutEntry = Boolean(koEntry && knockedEntries.some((knocked) => knocked.uid === entry.uid));
      if (!isAttackDamageCandidate && !isKnockedOutEntry && logIndex === null) continue;
      if (logIndex !== null) claimedLogIndexes.add(logIndex);
      effects.push({
        id: nextId(),
        batchKey: hpBatchKey,
        kind: koEntries.length > 0 && entry.hp === 0 ? "ko" : "damage",
        side: entry.sideId,
        targetUid: entry.uid,
        sourceUid: source?.uid,
        sourceSide,
        sourceSlot: attackEntry ? { zone: "active" } : undefined,
        sourceRect: source?.rect,
        targetCardId: entry.cardId,
        targetUmamusume: entry.umamusume,
        targetBoardBefore: koEntries.length > 0 && entry.hp === 0 ? previousBoardBySide[entry.sideId] : undefined,
        targetSlot: entry.slot,
        targetRect: entry.rect ?? before.rect,
        amount,
        hpBefore: before.hp,
        hpAfter: entry.hp,
        label: "Damage",
      });
    } else if (entry.hp > before.hp) {
      const alreadyTracked = effects.some(
        (effect) => effect.kind === "heal"
          && effect.targetUid === entry.uid
          && effect.hpAfter === entry.hp,
      );
      if (alreadyTracked) continue;
      const logIndex = findSupportingLogEntry(newEntries, entry, "heal", claimedLogIndexes);
      if (logIndex === null) continue;
      if (logIndex !== null) claimedLogIndexes.add(logIndex);
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

  if (koEntries.length > 0) {
    const sourceSide = attackEntry ? getActorSideFromLog(attackEntry) ?? undefined : undefined;
    const source = sourceSide ? current[sourceSide].find((entry) => entry.slot.zone === "active") : undefined;
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
          sourceSlot: attackEntry ? { zone: "active" } : undefined,
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
        sourceSlot: attackEntry ? { zone: "active" } : undefined,
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
