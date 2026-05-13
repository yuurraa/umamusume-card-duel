import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  canAttachEnergy,
  chooseOpeningCoin,
  createGame,
  dealOpeningHands,
  getCard,
  opponentAbandonedMatch,
  playerAttack,
  tickSetupCountdown,
  timeoutEndTurn,
} from "../game/engine";
import type { InspectTarget } from "../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../types/ui";
import { getDeckById, getDeckEnergyTypes, readEquippedDeckId, pickRandomOpponentDeck } from "../utils/deck";
import type { CardFlowItem } from "../match/feedback/CardFlowOverlay";
import type { BattleEffectBoardSnapshot, BattleEffectEvent, BattleEffectRect, BattleEffectSlot } from "../match/feedback/BattleEffectOverlay";
import {
  getPlaymatTextTone,
  getSelectedPlaymat,
  getSelectedSleeve,
  getRandomCustomisationSettings,
  readCustomisationSettings,
  type CustomisationSettings,
} from "../utils/customisation";
import {
  type CoinFlipEvent,
  formatKoActionNotice,
  getActionNoticeTone,
  getKoCauseFromEntries,
  getNewLogEntries,
  getPendingAttackCoinFlip,
  getTopActionBanner,
  isBottomActionNotice,
  toCoinFlipEvent,
} from "./gameUiHelpers";
import { SCREEN_FADE_MS, appStyle, matchBackgroundLayerStyle, screenFadeOverlayStyle } from "./styles";
import { renderNonMatchScreen } from "./nonMatchScreens";
import { useEscapeHotkey } from "./hooks/useEscapeHotkey";
import { useLogNotifications } from "./hooks/useLogNotifications";
import { type PendingCoinAttack, useMatchActions } from "./hooks/useMatchActions";
import { useCardPreviewActions } from "./hooks/useCardPreviewActions";
import { useCoinFlipResolution } from "./hooks/useCoinFlipResolution";
import { useMatchDerivedState } from "./hooks/useMatchDerivedState";
import { useSetupActions } from "./hooks/useSetupActions";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useAppRuntimeEffects } from "./hooks/useAppRuntimeEffects";
import { useMatchUiActions } from "./hooks/useMatchUiActions";
import { useMatchModalActions } from "./hooks/useMatchModalActions";
import { AiTelemetryPanel } from "./AiTelemetryPanel";
import { applyPlayerIntent, type PlayerIntent } from "../pvp/playerIntent";
import { createGuestSyncState, mirrorGameState, mirrorGameStateForGuest } from "../pvp/stateMirror";
import { DEFAULT_ICE_SERVERS, PeerRuntime } from "../pvp/peer";
import type { PvpWireMessage } from "../pvp/protocol";
import type { PvpRole } from "../screens/PvpLobbyScreen";
import {
  createPvpSession,
  getPvpAnswer,
  getPvpCandidates,
  getPvpOffer,
  getPvpRtcConfig,
  submitPvpAnswer,
  submitPvpCandidates,
} from "../pvp/signalApi";
import { getFirebaseAccountSnapshot, linkFirebaseAccountWithGoogle, signOutFirebaseAccount, type FirebaseAccountSnapshot } from "../utils/firebaseAuth";
import { getAccountPlayerName } from "../utils/playerNames";
import type { CoinFlipResult, EnergyType, GameState, SideId, SideState, SpecialCondition, UmamusumeInstance } from "../../../shared/src/types";
import { DiscardPileModal } from "../match/modals/DiscardPileModal";
import { OpponentZonesModal } from "../match/modals/OpponentZonesModal";

const EMPTY_FIREBASE_ACCOUNT: FirebaseAccountSnapshot = {
  configured: false,
  localId: null,
  displayName: null,
  email: null,
  photoUrl: null,
  isGoogleLinked: false,
};

const TURN_RELAY_UNAVAILABLE_TEXT = "TURN relay candidate was not available.";

const loadMatchBoardLayout = () => import("./MatchBoardLayout");

const MatchBoardLayout = lazy(() => loadMatchBoardLayout().then((module) => ({
  default: module.MatchBoardLayout,
})));
const CardPreview = lazy(() => import("../match/modals/CardPreview").then((module) => ({
  default: module.CardPreview,
})));
const DeckChoiceModal = lazy(() => import("../match/modals/DeckChoiceModal").then((module) => ({
  default: module.DeckChoiceModal,
})));
const GameOverModal = lazy(() => import("../match/modals/GameOverModal").then((module) => ({
  default: module.GameOverModal,
})));
const EndTurnWarningModal = lazy(() => import("../match/modals/EndTurnWarningModal").then((module) => ({
  default: module.EndTurnWarningModal,
})));
const SelectionPrompt = lazy(() => import("../match/controls/SelectionPrompt").then((module) => ({
  default: module.SelectionPrompt,
})));
const OpponentActionBanner = lazy(() => import("../match/feedback/OpponentActionBanner").then((module) => ({
  default: module.OpponentActionBanner,
})));
const ActionNotice = lazy(() => import("../match/feedback/ActionNotice").then((module) => ({
  default: module.ActionNotice,
})));
const CoinFlipOverlay = lazy(() => import("../match/feedback/CoinFlipOverlay").then((module) => ({
  default: module.CoinFlipOverlay,
})));
const CardFlowOverlay = lazy(() => import("../match/feedback/CardFlowOverlay").then((module) => ({
  default: module.CardFlowOverlay,
})));
const BattleEffectOverlay = lazy(() => import("../match/feedback/BattleEffectOverlay").then((module) => ({
  default: module.BattleEffectOverlay,
})));
const PointGainOverlay = lazy(() => import("../match/feedback/PointGainOverlay").then((module) => ({
  default: module.PointGainOverlay,
})));

const KO_DISSOLVE_MS = 800;
const KO_ACTIVE_VACANCY_MS = 100;
const ACTIVE_PROMOTION_REVEAL_MS = 300;
const GAME_OVER_REVEAL_DELAY_MS = 100;

function isTurnRelayUnavailableError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes(TURN_RELAY_UNAVAILABLE_TEXT);
}

function hasStunUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.startsWith("stun:"));
}

function toStunFallbackRtcConfig(config: RTCConfiguration | null): RTCConfiguration | null {
  if (!config || config.iceTransportPolicy !== "relay") return null;
  if (!config.iceServers?.some(hasStunUrl)) return null;
  return { ...config, iceTransportPolicy: "all" };
}

function firstCardMoved(fromBefore: string[], fromAfter: string[], toBefore: string[], toAfter: string[]): string | null {
  return allCardsMoved(fromBefore, fromAfter, toBefore, toAfter)[0] ?? null;
}

function subtractCardLists(source: string[], minus: string[]): string[] {
  const minusCounts = new Map<string, number>();
  for (const cardId of minus) minusCounts.set(cardId, (minusCounts.get(cardId) ?? 0) + 1);
  const result: string[] = [];
  for (const cardId of source) {
    const remaining = minusCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      minusCounts.set(cardId, remaining - 1);
      continue;
    }
    result.push(cardId);
  }
  return result;
}

function allCardsMoved(fromBefore: string[], fromAfter: string[], toBefore: string[], toAfter: string[]): string[] {
  const removed = subtractCardLists(fromBefore, fromAfter);
  if (removed.length === 0) return [];
  const added = subtractCardLists(toAfter, toBefore);
  if (added.length === 0) return [];
  const addedCounts = new Map<string, number>();
  for (const cardId of added) addedCounts.set(cardId, (addedCounts.get(cardId) ?? 0) + 1);
  const moved: string[] = [];
  for (const cardId of removed) {
    const remaining = addedCounts.get(cardId) ?? 0;
    if (remaining <= 0) continue;
    moved.push(cardId);
    addedCounts.set(cardId, remaining - 1);
  }
  return moved;
}

function getInPlayCardIds(side: SideState): string[] {
  const collectFromUmamusume = (umamusume: SideState["active"]): string[] => {
    if (!umamusume) return [];
    return [...(umamusume.evolutionCardIds ?? []), umamusume.cardId, ...(umamusume.toolCardId ? [umamusume.toolCardId] : [])];
  };
  return [
    ...collectFromUmamusume(side.active),
    ...side.bench.flatMap((umamusume) => collectFromUmamusume(umamusume)),
  ];
}

type BattleSnapshotEntry = {
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

type BattleSnapshot = {
  player: BattleSnapshotEntry[];
  opponent: BattleSnapshotEntry[];
  log: string[];
  phase: GameState["phase"];
  gameOver: boolean;
};

type PointGainEvent = {
  id: number;
  side: SideId;
  previousPoints: number;
  points: number;
};

type VisualHpByUid = Record<number, number>;
type VisualAttachedEnergyByUid = Record<number, EnergyType[]>;
type KoRetainedBoardBySide = Partial<Record<SideId, BattleEffectBoardSnapshot>>;

function createBattleSnapshot(state: GameState): BattleSnapshot {
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

function cloneBattleSnapshotUmamusume(umamusume: UmamusumeInstance): UmamusumeInstance {
  return {
    ...umamusume,
    energies: { ...umamusume.energies },
    specialConditions: [...umamusume.specialConditions],
    evolutionCardIds: [...(umamusume.evolutionCardIds ?? [])],
  };
}

function cloneBattleEffectBoardSnapshot(snapshot: BattleEffectBoardSnapshot): BattleEffectBoardSnapshot {
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

function getAttachedEnergyFromUmamusume(umamusume: UmamusumeInstance): EnergyType[] {
  const energies = Object.entries(umamusume.energies) as [EnergyType, number][];
  return energies.flatMap(([type, amount]) => Array.from({ length: amount }, () => type)).reverse();
}

function withRetainedKoBoard(
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

function withKoVacantActive(state: GameState, vacancyBySide: Partial<Record<SideId, boolean>>): GameState {
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

function getBattleEntries(snapshot: BattleSnapshot): BattleSnapshotEntry[] {
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

function buildBattleEffects(
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

function getLeadingBattleEffectBatch(queue: BattleEffectEvent[]): BattleEffectEvent[] {
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

function getNewLogHeadEntries(previousLog: string[], currentLog: string[]): string[] {
  if (previousLog.length === 0) return currentLog;
  for (let start = 0; start < currentLog.length; start += 1) {
    const overlap = Math.min(previousLog.length, currentLog.length - start);
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (currentLog[start + index] !== previousLog[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return currentLog.slice(0, start);
  }
  // The game log is capped. If enough entries are emitted at once, the previous
  // overlap can be truncated away; treating the whole log as new replays old UI
  // effects, so prefer dropping that ambiguous batch.
  return [];
}

function hasPlayLogEntry(previousLog: string[], currentLog: string[], cardName: string): boolean {
  const newEntries = getNewLogHeadEntries(previousLog, currentLog);
  return newEntries.some((entry) => entry.includes(`played ${cardName}.`));
}

function hasHandGainLogEntry(newEntries: string[], sideId: SideId): boolean {
  const actor = sideId === "player" ? "You" : "Opponent";
  return newEntries.some((entry) => (
    entry.startsWith(`${actor} drew `)
    || (entry.startsWith(`${actor} added `) && entry.includes(" hand"))
    || (entry.startsWith(`${actor} revealed `) && entry.includes("added it to") && entry.includes(" hand"))
    || (entry.startsWith(`${actor} put `) && entry.includes(" into ") && entry.includes(" hand"))
  ));
}

function hasHandDiscardLogEntry(newEntries: string[], sideId: SideId, cardName: string | null): boolean {
  const actor = sideId === "player" ? "You" : "Opponent";
  return newEntries.some((entry) => {
    if (!entry.startsWith(`${actor} discarded `)) return false;
    return !cardName || entry.includes(cardName) || /\bdiscarded \d+ cards?\b/i.test(entry) || entry.includes("discarded 1 card");
  });
}

function isAutomaticTurnDraw(
  previous: { currentSide: GameState["currentSide"]; player: { deck: string[] }; opponent: { deck: string[] } },
  current: { currentSide: GameState["currentSide"]; player: { deck: string[] }; opponent: { deck: string[] } },
  sideId: SideId,
  gainedCards: string[],
): boolean {
  return gainedCards.length === 1
    && previous.currentSide !== current.currentSide
    && current.currentSide === sideId
    && current[sideId].deck.length === previous[sideId].deck.length - 1;
}

function getShuffleHandDrawCount(previousLog: string[], currentLog: string[], sideId: SideId): number | null {
  const actor = sideId === "player" ? "You" : "Opponent";
  const newEntries = getNewLogHeadEntries(previousLog, currentLog);
  const entry = newEntries.find((line) => line.startsWith(`${actor} used `) && line.includes(" shuffled ") && line.includes(" and drew "));
  if (!entry) return null;
  const match = entry.match(/ and drew (\d+) cards?\./);
  if (!match?.[1]) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function splitCardFlowIntoBatches(items: CardFlowItem[]): CardFlowItem[][] {
  return [items];
}

function cardFlowBatchKey(items: CardFlowItem[]): string {
  return items
    .map((item) => [
      item.group ?? "unknown",
      item.label ?? "",
      item.cardId,
      item.enterFrom,
      item.exitTo,
      item.faceDownImage ? "face-down" : "face-up",
    ].join(":"))
    .join("|");
}

function tryGetCardName(cardId: string): string | null {
  try {
    return getCard(cardId).name;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [pendingScreen, setPendingScreen] = useState<AppScreen | null>(null);
  const [screenFadeOverlayOpacity, setScreenFadeOverlayOpacity] = useState(0);
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
  const [matchMode, setMatchMode] = useState<MatchMode>("playerVsAi");
  const showAiTelemetryPanel = import.meta.env.DEV && matchMode !== "playerVsPlayer";
  const [aiPerspective, setAiPerspective] = useState<SideId>("player");
  const [pvpRole, setPvpRole] = useState<PvpRole | null>(null);
  const [pvpStatusDetail, setPvpStatusDetail] = useState("Pick Host or Join to begin.");
  const [pvpLocalSignal, setPvpLocalSignal] = useState("");
  const [pvpRemoteSignal, setPvpRemoteSignal] = useState("");
  const [pvpConnected, setPvpConnected] = useState(false);
  const [firebaseAccount, setFirebaseAccount] = useState<FirebaseAccountSnapshot>(EMPTY_FIREBASE_ACCOUNT);
  const [accountBusy, setAccountBusy] = useState(false);
  const [customisation, setCustomisation] = useState<CustomisationSettings>(() => readCustomisationSettings());
  const [opponentCustomisation, setOpponentCustomisation] = useState<CustomisationSettings>(() => getRandomCustomisationSettings());
  const [game, setGame] = useState(() => {
    const playerDeck = getDeckById(readEquippedDeckId());
    const opponent = pickRandomOpponentDeck();
    return createGame(playerDeck.cardIds, opponent.cardIds, opponent.name, "hard", false, "Guest", getDeckEnergyTypes(playerDeck), getDeckEnergyTypes(opponent));
  });
  const [previewTarget, setPreviewTarget] = useState<InspectTarget | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [endTurnWarningActions, setEndTurnWarningActions] = useState<string[] | null>(null);
  const [suppressEndTurnWarningForGame, setSuppressEndTurnWarningForGame] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [revealedOpponentHandOpen, setRevealedOpponentHandOpen] = useState(false);
  const [revealedOpponentHandCardIds, setRevealedOpponentHandCardIds] = useState<string[]>([]);
  const [opponentZonesOpen, setOpponentZonesOpen] = useState(false);
  const [discardViewSide, setDiscardViewSide] = useState<SideId>("player");
  const [coinFlipQueue, setCoinFlipQueue] = useState<CoinFlipEvent[]>([]);
  const [activeCoinFlip, setActiveCoinFlip] = useState<CoinFlipEvent | null>(null);
  const [acknowledgedCoinLogMessage, setAcknowledgedCoinLogMessage] = useState<string | null>(null);
  const [pendingCoinAttack, setPendingCoinAttack] = useState<PendingCoinAttack | null>(null);
  const [cardFlowQueue, setCardFlowQueue] = useState<CardFlowItem[][]>([]);
  const [openingHandDeferredRevealCardIds, setOpeningHandDeferredRevealCardIds] = useState<string[]>([]);
  const [battleEffectQueue, setBattleEffectQueue] = useState<BattleEffectEvent[]>([]);
  const [koCrumblingUids, setKoCrumblingUids] = useState<Set<number>>(new Set());
  const [koRetainedActiveBySide, setKoRetainedActiveBySide] = useState<Partial<Record<SideId, UmamusumeInstance>>>({});
  const [koRetainedBoardBySide, setKoRetainedBoardBySide] = useState<KoRetainedBoardBySide>({});
  const [koVacancyBySide, setKoVacancyBySide] = useState<Partial<Record<SideId, boolean>>>({});
  const [koPromotionLockedBySide, setKoPromotionLockedBySide] = useState<Partial<Record<SideId, boolean>>>({});
  const [activePromotionRevealingBySide, setActivePromotionRevealingBySide] = useState<Partial<Record<SideId, boolean>>>({});
  const [pointGainQueue, setPointGainQueue] = useState<PointGainEvent[]>([]);
  const [scorePointsOverrideBySide, setScorePointsOverrideBySide] = useState<Partial<Record<SideId, number>>>({});
  const [gameOverModalVisible, setGameOverModalVisible] = useState(false);
  const [visualHpByUid, setVisualHpByUid] = useState<VisualHpByUid>({});
  const [visualAttachedEnergyByUid, setVisualAttachedEnergyByUid] = useState<VisualAttachedEnergyByUid>({});
  const [openingCoinChoicePending, setOpeningCoinChoicePending] = useState(false);
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const telemetryFlag = globalThis as typeof globalThis & { __UMA_AI_TELEMETRY__?: boolean };
    if (telemetryFlag.__UMA_AI_TELEMETRY__ === undefined) {
      telemetryFlag.__UMA_AI_TELEMETRY__ = import.meta.env.DEV;
    }
  }, []);
  const [opponentSetupRevealToken, setOpponentSetupRevealToken] = useState(0);
  const [povSwitchAnimationToken, setPovSwitchAnimationToken] = useState(0);
  const [pvpTimerNowMs, setPvpTimerNowMs] = useState(() => Date.now());
  const [suppressOpponentPlaymatLayer, setSuppressOpponentPlaymatLayer] = useState(true);
  const [hasSeenMatchSetupPhase, setHasSeenMatchSetupPhase] = useState(false);
  const pvpDeadlineTurnKeyRef = useRef<string | null>(null);
  const previousLogRef = useRef<string[]>([]);
  const previousBattleSnapshotRef = useRef<BattleSnapshot | null>(null);
  const battleEffectIdRef = useRef(1);
  const pointGainIdRef = useRef(1);
  const pendingKoPromotionReleaseSidesRef = useRef<SideId[]>([]);
  const koVacancyTimeoutBySideRef = useRef<Partial<Record<SideId, number>>>({});
  const koCrumbleTimeoutIdsRef = useRef<number[]>([]);
  const activePromotionRevealTimeoutBySideRef = useRef<Partial<Record<SideId, number>>>({});
  const gameOverRevealTimeoutRef = useRef<number | null>(null);
  const previousPlayerZonesRef = useRef<{
    player: { hand: string[]; deck: string[]; discard: string[]; inPlay: string[] };
    opponent: { hand: string[]; deck: string[]; discard: string[]; inPlay: string[] };
    currentSide: GameState["currentSide"];
    turnNumber: number;
    phase: GameState["phase"];
    log: string[];
  } | null>(null);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
  const openingHandAnimationKeyRef = useRef<string | null>(null);
  const openingHandDeferredRevealTimeoutRef = useRef<number | null>(null);
  const shouldDealOpeningHandsAfterFlowRef = useRef(false);
  const queuedVisualActionsRef = useRef<Array<() => void>>([]);
  const skipNextCoinLogMessageRef = useRef<string | null>(null);
  const pvpPeerRef = useRef<PeerRuntime | null>(null);
  const pvpRtcConfigRef = useRef<RTCConfiguration | null>(null);
  const pvpAnswerPollTokenRef = useRef(0);
  const pvpHelloAckRef = useRef(false);
  const pvpLocalCloseIntentRef = useRef(false);
  const pvpCandidatePollTokenRef = useRef(0);
  const pvpCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const pvpCandidateFlushTimeoutRef = useRef<number | null>(null);
  const pvpActiveCodeRef = useRef<string | null>(null);
  const pvpRoleRef = useRef<PvpRole | null>(null);
  const matchModeRef = useRef<MatchMode>("playerVsAi");
  const screenRef = useRef<AppScreen>("mainMenu");
  const gameRef = useRef(game);
  const lastVisiblePlaymatSideRef = useRef<SideId>("player");
  const equippedDeckCardIdsRef = useRef<string[]>([]);
  const equippedDeckEnergyTypesRef = useRef<EnergyType[]>([]);
  const remoteDeckRef = useRef<string[] | null>(null);
  const remoteEnergyTypesRef = useRef<EnergyType[] | null>(null);
  const remoteNameRef = useRef<string>("Opponent");
  const appliedVisibleHpBatchRef = useRef<string>("");
  const equippedDeck = getDeckById(equippedDeckId);
  const selectedPlaymat = getSelectedPlaymat(customisation);
  const uiTextTone = getPlaymatTextTone(customisation);
  const selectedSleeve = getSelectedSleeve(customisation);
  const opponentPlaymat = getSelectedPlaymat(opponentCustomisation);
  const opponentSleeve = getSelectedSleeve(opponentCustomisation);
  const isAiVsAi = matchMode === "aiVsAi";
  const isNetworkMatch = matchMode === "playerVsPlayer";
  const isPvpHost = isNetworkMatch && pvpRole === "host";
  const isPvpGuest = isNetworkMatch && pvpRole === "guest";
  // During preparation we always show the player's playmat to avoid a one-frame flash
  // if the POV was previously switched in AI-vs-AI.
  const displayPerspective: SideId = isAiVsAi ? (game.phase === "setup" ? "player" : aiPerspective) : "player";
  const baseDisplayGame = isNetworkMatch ? game : toPerspectiveGame(game, displayPerspective);
  const retainedKoDisplayGame = withRetainedKoBoard(baseDisplayGame, battleEffectQueue, koRetainedBoardBySide);
  const displayGame = withKoVacantActive(retainedKoDisplayGame, koVacancyBySide);
  const player = game.sides.player;
  const displayPlayer = displayGame.sides.player;
  const localPlayerName = getAccountPlayerName(firebaseAccount);
  const formatMatchText = (text: string): string => {
    if (isNetworkMatch) return redactHiddenSidePrivateInfo(text);
    const perspectiveText = displayPerspective === "opponent" ? swapBattlePerspectiveText(text) : text;
    return redactHiddenSidePrivateInfo(perspectiveText);
  };
  const displayLog = game.log.map(formatMatchText);
  const hasLocalPendingChoice = game.pendingPlayerChoice?.sideId === "player";
  const nextPlayerEnergy = displayPlayer.energyZone[0] ?? null;
  const {
    activePendingSelection,
    playerSelectableUmamusumeUids,
    opponentSelectableUmamusumeUids,
    selectableHandIndexes,
    abilityEnergyTypes,
    hiddenOpponent,
    isBusyWithChoice,
    isCoinFlipBlocking,
    isTurnFlowBlocked,
    opponentBoardHidden,
    displayedPlayerSide,
    displayedOpponentSide,
    hiddenOpponentBenchCount,
    setupDragHandIndexByUid,
    abilityReadyUmamusumeUids,
    stadiumAbilityReady,
  } = useMatchDerivedState({
    game: displayGame,
    player: displayPlayer,
    isNetworkMatch,
    timerNowMs: pvpTimerNowMs,
    pendingSelection,
    setupActiveIndex,
    setupBenchIndexes,
    endTurnWarningActions,
    activeCoinFlip,
    coinFlipQueue,
    acknowledgedCoinLogMessage,
  });
  const hasKoVacancy = Boolean(koVacancyBySide.player || koVacancyBySide.opponent);
  const hasKoPromotionLock = Boolean(koPromotionLockedBySide.player || koPromotionLockedBySide.opponent);
  const hasActivePromotionReveal = Boolean(activePromotionRevealingBySide.player || activePromotionRevealingBySide.opponent);
  const visualFlowBlocked = battleEffectQueue.length > 0 || koCrumblingUids.size > 0 || pointGainQueue.length > 0 || hasKoVacancy || hasKoPromotionLock || hasActivePromotionReveal || (cardFlowQueue.length > 0 && !game.pendingPlayerChoice);

  useEffect(() => {
    pvpRoleRef.current = pvpRole;
  }, [pvpRole]);

  useEffect(() => {
    matchModeRef.current = matchMode;
  }, [matchMode]);

  useEffect(() => () => {
    const timeouts = koVacancyTimeoutBySideRef.current;
    (["player", "opponent"] as SideId[]).forEach((sideId) => {
      const timeoutId = timeouts[sideId];
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      const revealTimeoutId = activePromotionRevealTimeoutBySideRef.current[sideId];
      if (revealTimeoutId !== undefined) window.clearTimeout(revealTimeoutId);
    });
    koCrumbleTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    koCrumbleTimeoutIdsRef.current = [];
    if (gameOverRevealTimeoutRef.current !== null) {
      window.clearTimeout(gameOverRevealTimeoutRef.current);
      gameOverRevealTimeoutRef.current = null;
    }
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getFirebaseAccountSnapshot()
      .then((snapshot) => {
        if (active) setFirebaseAccount(snapshot);
      })
      .catch(() => {
        if (active) setFirebaseAccount(EMPTY_FIREBASE_ACCOUNT);
      });
    return () => {
      active = false;
    };
  }, []);

  const linkGoogleAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      setFirebaseAccount(await linkFirebaseAccountWithGoogle());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Failed to link Google account.");
    } finally {
      setAccountBusy(false);
    }
  };

  const logoutAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      setFirebaseAccount(await signOutFirebaseAccount());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Failed to log out.");
    } finally {
      setAccountBusy(false);
    }
  };

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useLayoutEffect(() => {
    // Prevent a one-frame flash of the opponent playmat when entering the match screen
    // while the game state is being replaced (e.g. starting a new game).
    if (screen !== "match") {
      setSuppressOpponentPlaymatLayer(true);
      setHasSeenMatchSetupPhase(false);
      return;
    }
    setSuppressOpponentPlaymatLayer(true);
    setHasSeenMatchSetupPhase(false);
  }, [screen]);

  useEffect(() => {
    if (screen !== "match") return;
    if (game.phase === "setup") {
      setHasSeenMatchSetupPhase(true);
      setSuppressOpponentPlaymatLayer(true);
      return;
    }
    if (game.phase === "play" && (!isAiVsAi || hasSeenMatchSetupPhase)) {
      setSuppressOpponentPlaymatLayer(false);
    }
  }, [game.phase, hasSeenMatchSetupPhase, isAiVsAi, screen]);

  useEffect(() => {
    if (!game.gameOver) {
      setGameOverModalVisible(false);
      if (gameOverRevealTimeoutRef.current !== null) {
        window.clearTimeout(gameOverRevealTimeoutRef.current);
        gameOverRevealTimeoutRef.current = null;
      }
      return;
    }
    queuedVisualActionsRef.current = [];
    setOpeningHandDeferredRevealCardIds([]);
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  }, [game.gameOver]);

  useEffect(() => {
    if (!game.gameOver) return;
    if (gameOverModalVisible) return;
    if (battleEffectQueue.length > 0 || koCrumblingUids.size > 0 || pointGainQueue.length > 0 || cardFlowQueue.length > 0 || activeCoinFlip) return;
    if (gameOverRevealTimeoutRef.current !== null) return;

    gameOverRevealTimeoutRef.current = window.setTimeout(() => {
      setGameOverModalVisible(true);
      gameOverRevealTimeoutRef.current = null;
    }, GAME_OVER_REVEAL_DELAY_MS);

    return () => {
      if (gameOverRevealTimeoutRef.current !== null) {
        window.clearTimeout(gameOverRevealTimeoutRef.current);
        gameOverRevealTimeoutRef.current = null;
      }
    };
  }, [activeCoinFlip, battleEffectQueue.length, cardFlowQueue.length, game.gameOver, gameOverModalVisible, koCrumblingUids.size, pointGainQueue.length]);

  useEffect(() => {
    equippedDeckCardIdsRef.current = equippedDeck.cardIds;
    equippedDeckEnergyTypesRef.current = getDeckEnergyTypes(equippedDeck);
  }, [equippedDeck]);

  const resetTransientMatchUi = () => {
    previousLogRef.current = [];
    previousBattleSnapshotRef.current = null;
    previousPlayerZonesRef.current = null;
    queuedVisualActionsRef.current = [];
    setCoinFlipQueue([]);
    setActiveCoinFlip(null);
    setAcknowledgedCoinLogMessage(null);
    setPendingCoinAttack(null);
    setCardFlowQueue([]);
    setOpeningHandDeferredRevealCardIds([]);
    if (openingHandDeferredRevealTimeoutRef.current !== null) {
      window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
      openingHandDeferredRevealTimeoutRef.current = null;
    }
    setBattleEffectQueue([]);
    setKoCrumblingUids(new Set());
    setKoRetainedActiveBySide({});
    setKoRetainedBoardBySide({});
    setKoVacancyBySide({});
    setKoPromotionLockedBySide({});
    setActivePromotionRevealingBySide({});
    setPointGainQueue([]);
    setScorePointsOverrideBySide({});
    pendingKoPromotionReleaseSidesRef.current = [];
    setGameOverModalVisible(false);
    setVisualHpByUid({});
    setVisualAttachedEnergyByUid({});
    (["player", "opponent"] as SideId[]).forEach((sideId) => {
      const timeoutId = koVacancyTimeoutBySideRef.current[sideId];
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      delete koVacancyTimeoutBySideRef.current[sideId];
      const revealTimeoutId = activePromotionRevealTimeoutBySideRef.current[sideId];
      if (revealTimeoutId !== undefined) window.clearTimeout(revealTimeoutId);
      delete activePromotionRevealTimeoutBySideRef.current[sideId];
    });
    if (gameOverRevealTimeoutRef.current !== null) {
      window.clearTimeout(gameOverRevealTimeoutRef.current);
      gameOverRevealTimeoutRef.current = null;
    }
    skipNextCoinLogMessageRef.current = null;
    setSetupActiveIndex(null);
    setSetupBenchIndexes([]);
    setPendingSelection(null);
    setEndTurnWarningActions(null);
    setPreviewTarget(null);
    setSuppressEndTurnWarningForGame(false);
    setActionNotice(null);
    setDiscardOpen(false);
    setMenuOpen(false);
    openingHandAnimationKeyRef.current = null;
    shouldDealOpeningHandsAfterFlowRef.current = false;
  };

  const syncToGuest = (state: typeof game) => {
    if (matchModeRef.current !== "playerVsPlayer" || pvpRoleRef.current !== "host") return;
    pvpPeerRef.current?.send({ type: "sync", state: createGuestSyncState(state) });
  };

  const applyIntentForHost = (intent: PlayerIntent) => {
    setGame((current) => {
      const timed = current.turnDeadlineMs !== null
        && Date.now() >= current.turnDeadlineMs
        && !current.pendingPlayerChoice
        && current.phase === "play"
        && !current.gameOver
        && current.currentSide !== "done"
        ? timeoutEndTurn(current)
        : current;
      const next = applyPlayerIntent(timed, intent);
      syncToGuest(next);
      return next;
    });
  };

  const handlePvpMessage = (message: PvpWireMessage) => {
    const currentRole = pvpRoleRef.current;
    const currentMode = matchModeRef.current;
    const currentScreen = screenRef.current;
    const isHostNow = currentMode === "playerVsPlayer" && currentRole === "host";
    const isGuestNow = currentMode === "playerVsPlayer" && currentRole === "guest";

    if (message.type === "hello") {
      if (!isHostNow) return;
      pvpPeerRef.current?.send({ type: "helloAck" });
      remoteDeckRef.current = message.deckCardIds;
      remoteEnergyTypesRef.current = message.energyTypes ?? null;
      remoteNameRef.current = message.playerName || "Opponent";
      if (currentScreen === "match") {
        syncToGuest(gameRef.current);
        return;
      }
      if (currentScreen !== "pvpLobby") return;
      resetTransientMatchUi();
      const starting = createGame(
        equippedDeckCardIdsRef.current,
        message.deckCardIds,
        remoteNameRef.current,
        "hard",
        true,
        localPlayerName,
        equippedDeckEnergyTypesRef.current,
        message.energyTypes,
      );
      gameRef.current = starting;
      setGame(starting);
      setMatchMode("playerVsPlayer");
      setScreen("match");
      setPendingScreen(null);
      syncToGuest(starting);
      return;
    }

    if (message.type === "helloAck") {
      if (!isGuestNow) return;
      pvpHelloAckRef.current = true;
      return;
    }

    if (message.type === "sync") {
      if (!isGuestNow) return;
      if (currentScreen !== "match") resetTransientMatchUi();
      setGame(mirrorGameStateForGuest(message.state));
      setMatchMode("playerVsPlayer");
      setScreen("match");
      setPendingScreen(null);
      return;
    }

    if (message.type === "intent") {
      if (!isHostNow) return;
      setGame((current) => {
        const timed = current.turnDeadlineMs !== null
          && Date.now() >= current.turnDeadlineMs
          && !current.pendingPlayerChoice
          && current.phase === "play"
          && !current.gameOver
          && current.currentSide !== "done"
          ? timeoutEndTurn(current)
          : current;
        const mirrored = mirrorGameState(timed);
        const nextMirrored = applyPlayerIntent(mirrored, message.intent);
        const canonical = mirrorGameState(nextMirrored);
        syncToGuest(canonical);
        return canonical;
      });
    }
  };

  useEffect(() => {
    if (!isNetworkMatch || game.phase !== "play" || game.gameOver) return;
    const intervalId = window.setInterval(() => setPvpTimerNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [isNetworkMatch, game.phase, game.gameOver]);

  useEffect(() => {
    if (!isNetworkMatch || !isPvpHost || game.phase !== "play" || game.gameOver) return;
    if (game.currentSide === "done") return;
    const turnKey = `${game.turnNumber}:${game.currentSide}`;
    if (pvpDeadlineTurnKeyRef.current === turnKey && game.turnDeadlineMs !== null) return;
    const deadline = Date.now() + 30_000;
    pvpDeadlineTurnKeyRef.current = turnKey;
    setGame((current) => {
      if (current.phase !== "play" || current.gameOver || current.currentSide === "done") return current;
      const currentTurnKey = `${current.turnNumber}:${current.currentSide}`;
      if (currentTurnKey !== turnKey) return current;
      const next = { ...current, turnDeadlineMs: deadline };
      syncToGuest(next);
      return next;
    });
  }, [isNetworkMatch, isPvpHost, game.phase, game.gameOver, game.currentSide, game.turnNumber, game.turnDeadlineMs]);

  useEffect(() => {
    if (!isNetworkMatch || !isPvpHost || game.phase !== "play" || game.gameOver) return;
    if (game.pendingPlayerChoice || game.currentSide === "done") return;
    const deadline = game.turnDeadlineMs;
    if (deadline === null) return;
    const delayMs = Math.max(0, deadline - Date.now());
    const timeoutId = window.setTimeout(() => {
      setGame((current) => {
        if (
          current.phase !== "play"
          || current.gameOver
          || current.pendingPlayerChoice
          || current.currentSide === "done"
          || current.turnDeadlineMs === null
          || Date.now() < current.turnDeadlineMs
        ) return current;
        const next = timeoutEndTurn(current);
        syncToGuest(next);
        return next;
      });
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [
    isNetworkMatch,
    isPvpHost,
    game.phase,
    game.gameOver,
    game.pendingPlayerChoice,
    game.currentSide,
    game.turnNumber,
    game.turnDeadlineMs,
  ]);

  const submitPlayerIntent = (intent: PlayerIntent) => {
    if (!isNetworkMatch) {
      setGame((current) => applyPlayerIntent(current, intent));
      return;
    }
    if (isPvpHost) {
      applyIntentForHost(intent);
      return;
    }
    if (isPvpGuest) {
      pvpPeerRef.current?.send({ type: "intent", intent });
    }
  };

  const loadPvpRtcConfig = async (): Promise<RTCConfiguration> => {
    if (pvpRtcConfigRef.current) return pvpRtcConfigRef.current;
    const serverConfig = await getPvpRtcConfig();
    const rtcConfig = {
      ...serverConfig,
      iceServers: serverConfig.iceServers && serverConfig.iceServers.length > 0
        ? serverConfig.iceServers
        : DEFAULT_ICE_SERVERS,
    };
    pvpRtcConfigRef.current = rtcConfig;
    return rtcConfig;
  };

  const resetCandidateSync = () => {
    pvpCandidatePollTokenRef.current += 1;
    pvpCandidateQueueRef.current = [];
    pvpActiveCodeRef.current = null;
    if (pvpCandidateFlushTimeoutRef.current !== null) {
      window.clearTimeout(pvpCandidateFlushTimeoutRef.current);
      pvpCandidateFlushTimeoutRef.current = null;
    }
  };

  const flushLocalCandidates = async () => {
    const code = pvpActiveCodeRef.current;
    const role = pvpRoleRef.current;
    if (!code || !role) return;
    const batch = pvpCandidateQueueRef.current.splice(0);
    if (batch.length === 0) return;
    try {
      await submitPvpCandidates(code, role, batch);
    } catch {
      pvpCandidateQueueRef.current = batch.concat(pvpCandidateQueueRef.current);
      if (pvpCandidateFlushTimeoutRef.current === null) {
        pvpCandidateFlushTimeoutRef.current = window.setTimeout(() => {
          pvpCandidateFlushTimeoutRef.current = null;
          void flushLocalCandidates();
        }, 800);
      }
    }
  };

  const scheduleCandidateFlush = () => {
    if (pvpCandidateFlushTimeoutRef.current !== null) return;
    pvpCandidateFlushTimeoutRef.current = window.setTimeout(() => {
      pvpCandidateFlushTimeoutRef.current = null;
      void flushLocalCandidates();
    }, 200);
  };

  const enqueueLocalCandidate = (candidate: RTCIceCandidateInit) => {
    pvpCandidateQueueRef.current.push(candidate);
    if (pvpActiveCodeRef.current) scheduleCandidateFlush();
  };

  const startCandidatePolling = (code: string, role: PvpRole, runtime: PeerRuntime) => {
    const token = ++pvpCandidatePollTokenRef.current;
    void (async () => {
      let since = 0;
      while (pvpCandidatePollTokenRef.current === token && pvpPeerRef.current === runtime) {
        try {
          const result = await getPvpCandidates(code, role, since);
          since = result.nextSince;
          for (const candidate of result.candidates) {
            await runtime.addRemoteCandidate(candidate);
          }
        } catch {
          // Ignore transient candidate polling failures.
        }
        if (runtime.isConnected()) {
          await delay(800);
          if (runtime.isConnected()) return;
        }
        await delay(400);
      }
    })();
  };

  const ensurePeerRuntime = async () => {
    if (pvpPeerRef.current) return pvpPeerRef.current;
    const rtcConfig = await loadPvpRtcConfig();
    const runtime = new PeerRuntime({
      rtcConfig,
      onStatus: (status, detail) => {
        if (status === "connected") {
          setPvpStatusDetail("Opponent found!");
        } else if (status === "creatingOffer" || status === "awaitingAnswer" || status === "joining" || status === "connecting") {
          setPvpStatusDetail("Searching for opponent...");
        } else if (status === "failed") {
          setPvpStatusDetail(detail);
        } else if (status === "closed") {
          setPvpStatusDetail("Connection closed.");
        } else {
          setPvpStatusDetail(detail);
        }
        setPvpConnected(status === "connected");
        if (status === "connected") {
          pvpLocalCloseIntentRef.current = false;
        }
        if (status === "closed") {
          setPvpLocalSignal("");
          resetCandidateSync();
        }
        if (status === "closed" && !pvpLocalCloseIntentRef.current) {
          const activeScreen = screenRef.current;
          const activeMode = matchModeRef.current;
          if (activeScreen === "match" && activeMode === "playerVsPlayer") {
            setGame((current) => opponentAbandonedMatch(current));
            setPvpStatusDetail("Opponent disconnected and forfeited.");
          }
        }
      },
      onMessage: handlePvpMessage,
      onLocalCandidate: enqueueLocalCandidate,
    });
    pvpPeerRef.current = runtime;
    return runtime;
  };

  const runWithRtcFallback = async <T,>(operation: (runtime: PeerRuntime) => Promise<T>): Promise<{ runtime: PeerRuntime; result: T }> => {
    let runtime = await ensurePeerRuntime();
    try {
      const result = await operation(runtime);
      return { runtime, result };
    } catch (error) {
      if (!isTurnRelayUnavailableError(error)) throw error;
      const fallbackConfig = toStunFallbackRtcConfig(pvpRtcConfigRef.current);
      if (!fallbackConfig) throw error;
      setPvpStatusDetail("TURN unavailable on this network. Retrying with STUN...");
      pvpLocalCloseIntentRef.current = true;
      pvpPeerRef.current?.close();
      pvpPeerRef.current = null;
      pvpLocalCloseIntentRef.current = false;
      pvpRtcConfigRef.current = fallbackConfig;
      runtime = await ensurePeerRuntime();
      const result = await operation(runtime);
      return { runtime, result };
    }
  };

  const setPvpRoleAndReset = (role: PvpRole) => {
    setPvpRole(role);
    setPvpStatusDetail(role === "host" ? "Searching for opponent..." : "Waiting for code...");
    setPvpLocalSignal("");
    setPvpRemoteSignal("");
    setPvpConnected(false);
    pvpHelloAckRef.current = false;
    remoteDeckRef.current = null;
    remoteEnergyTypesRef.current = null;
    remoteNameRef.current = "Opponent";
    pvpAnswerPollTokenRef.current += 1;
    resetCandidateSync();
    pvpLocalCloseIntentRef.current = true;
    pvpPeerRef.current?.close();
    pvpPeerRef.current = null;
  };

  const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const createOffer = async () => {
    try {
      setPvpStatusDetail("Loading network relay settings...");
      const { runtime, result: offer } = await runWithRtcFallback((activeRuntime) => {
        const rtcConfig = pvpRtcConfigRef.current;
        if (rtcConfig?.iceTransportPolicy === "relay") return activeRuntime.hostCreateOffer();
        return activeRuntime.hostCreateOffer({ trickle: true });
      });
      const created = await createPvpSession(offer);
      const code = created.code.toUpperCase();
      const pollToken = ++pvpAnswerPollTokenRef.current;
      setPvpLocalSignal(code);
      pvpActiveCodeRef.current = code;
      scheduleCandidateFlush();
      startCandidatePolling(code, "host", runtime);
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // Ignore clipboard failures; host can still read the code from UI.
      }
      setPvpStatusDetail("Waiting for guest answer...");
      void waitForHostAnswer(code, runtime, pollToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create offer.";
      resetCandidateSync();
      setPvpStatusDetail(message);
    }
  };

  const joinWithOffer = async (codeOverride?: string) => {
    const rawCode = codeOverride ?? pvpRemoteSignal;
    if (!rawCode.trim()) {
      setPvpStatusDetail("Waiting for code...");
      return;
    }
    try {
      const code = normalizeCode(rawCode);
      if (!code) {
        setPvpStatusDetail("Code is invalid.");
        return;
      }
      pvpActiveCodeRef.current = code;
      setPvpStatusDetail("Fetching game offer...");
      const { offer } = await getPvpOffer(code);
      setPvpStatusDetail("Loading network relay settings...");
      setPvpStatusDetail("Creating connection answer...");
      const { runtime, result: answer } = await runWithRtcFallback((activeRuntime) => {
        const rtcConfig = pvpRtcConfigRef.current;
        if (rtcConfig?.iceTransportPolicy === "relay") return activeRuntime.joinWithOffer(offer);
        return activeRuntime.joinWithOffer(offer, { trickle: true });
      });
      setPvpStatusDetail("Sending answer to host...");
      await submitPvpAnswer(code, answer);
      scheduleCandidateFlush();
      startCandidatePolling(code, "guest", runtime);
      setPvpStatusDetail("Answer sent. Connecting to host...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join with offer.";
      resetCandidateSync();
      setPvpStatusDetail(message);
    }
  };

  const copyLocalSignal = async () => {
    if (!pvpLocalSignal) return;
    try {
      await navigator.clipboard.writeText(pvpLocalSignal);
      setPvpStatusDetail("Searching for opponent...");
    } catch {
      setPvpStatusDetail("Copy failed. You can copy manually.");
    }
  };

  const clearPvp = () => {
    setPvpRole(null);
    setPvpStatusDetail("Pick Host or Join to begin.");
    setPvpLocalSignal("");
    setPvpRemoteSignal("");
    setPvpConnected(false);
    pvpHelloAckRef.current = false;
    remoteDeckRef.current = null;
    remoteEnergyTypesRef.current = null;
    remoteNameRef.current = "Opponent";
    pvpAnswerPollTokenRef.current += 1;
    resetCandidateSync();
    pvpLocalCloseIntentRef.current = true;
    pvpPeerRef.current?.close();
    pvpPeerRef.current = null;
  };

  const returnToPvpLobbyForRematch = () => {
    resetTransientMatchUi();
    clearPvp();
    setMatchMode("playerVsPlayer");
    navigateToScreen("pvpLobby");
  };

  const waitForHostAnswer = async (code: string, runtime: PeerRuntime, token: number) => {
    try {
      const started = Date.now();
      while (Date.now() - started < 120_000) {
        if (pvpPeerRef.current !== runtime || pvpAnswerPollTokenRef.current !== token) return;
        const answer = await getPvpAnswer(code);
        if (answer) {
          await runtime.hostAcceptAnswer(answer);
          setPvpStatusDetail("Player joined. Finalizing connection...");
          return;
        }
        await delay(1200);
      }
      setPvpStatusDetail("No one joined yet. Keep this code open or create a new one.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed while waiting for player join.";
      setPvpStatusDetail(message);
    }
  };

  useEffect(() => {
    if (!pvpConnected || pvpRole !== "guest" || screen !== "pvpLobby") return;
    const sendHello = () => {
      if (pvpHelloAckRef.current) return;
      const runtime = pvpPeerRef.current;
      if (!runtime || !runtime.isConnected()) return;
      runtime.send({ type: "hello", playerName: localPlayerName, deckCardIds: equippedDeck.cardIds, energyTypes: getDeckEnergyTypes(equippedDeck) });
    };
    sendHello();
    const intervalId = window.setInterval(() => {
      if (screenRef.current !== "pvpLobby") {
        window.clearInterval(intervalId);
        return;
      }
      if (matchModeRef.current !== "playerVsPlayer" || pvpRoleRef.current !== "guest") {
        window.clearInterval(intervalId);
        return;
      }
      if (pvpHelloAckRef.current) {
        window.clearInterval(intervalId);
        return;
      }
      sendHello();
    }, 1200);
    return () => window.clearInterval(intervalId);
  }, [pvpConnected, pvpRole, equippedDeck.cardIds, screen, localPlayerName]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (matchModeRef.current !== "playerVsPlayer" || screenRef.current !== "match") return;
      if (game.gameOver) return;
      pvpLocalCloseIntentRef.current = true;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [game.gameOver]);

  useEffect(() => {
    return () => {
      pvpLocalCloseIntentRef.current = true;
      pvpPeerRef.current?.close();
      pvpPeerRef.current = null;
      resetCandidateSync();
    };
  }, []);

  const isSetupCountdownActive = game.phase === "setup"
    && Boolean(game.setup?.readyBySide.player)
    && Boolean(game.setup?.readyBySide.opponent)
    && game.setup?.countdownSecondsRemaining !== null;

  const {
    applySetupActive,
    promoteSetupBenchToActive,
    applySetupBench,
  } = useSetupActions({
    playerHand: player.hand,
    setupActiveIndex,
    setupBenchIndexes,
    isTurnFlowBlocked: isTurnFlowBlocked || isSetupCountdownActive,
    setSetupActiveIndex,
    setSetupBenchIndexes,
  });

  const {
    startNewGame,
    navigateToScreen,
    playEquippedDeck,
    startWithMode,
    returnToMainMenu,
    quitApp,
    toggleMenu,
    handleSurrender,
    cancelPendingSelection,
    openPreview,
    closePreview,
  } = useAppNavigation({
    screen,
    pendingScreen,
    matchMode,
    equippedDeckCardIds: equippedDeck.cardIds,
    equippedDeckEnergyTypes: getDeckEnergyTypes(equippedDeck),
    playerName: localPlayerName,
    hasPendingPlayerChoice: hasLocalPendingChoice,
    isTurnFlowBlocked,
    previousLogRef,
    skipNextCoinLogMessageRef,
    setMatchMode,
    setPendingScreen,
    setGame,
    setCoinFlipQueue,
    setActiveCoinFlip,
    setAcknowledgedCoinLogMessage,
    setPendingCoinAttack,
    setCardFlowQueue,
    setSetupActiveIndex,
    setSetupBenchIndexes,
    setPendingSelection,
    setPreviewTarget,
    setSuppressEndTurnWarningForGame,
    setActionNotice,
    setDiscardOpen,
    setMenuOpen,
    setOpponentCustomisation,
    setAiPerspective,
    setPovSwitchAnimationToken,
    setEndTurnWarningActions,
    openingHandAnimationKeyRef,
    shouldDealOpeningHandsAfterFlowRef,
    submitPlayerIntent,
  });

  const {
    adjustRetreatDiscard,
    confirmRetreatDiscard,
    handleEndTurn,
    applyPlayerGameUpdate,
  } = useMatchUiActions({
    game,
    player,
    isAiVsAi,
    isTurnFlowBlocked,
    isBusyWithChoice,
    suppressEndTurnWarningForGame,
    setGame,
    setPendingSelection,
    setEndTurnWarningActions,
    submitPlayerIntent,
  });
  const {
    onOpenDiscard,
    onCloseDiscard,
    onDiscardInspect,
    onEndTurnWarningCancel,
    onEndTurnWarningConfirm,
    onDeckScoutClose,
    onActionNoticeClose,
    onSelectionCancel,
    onPlayAgain,
  } = useMatchModalActions({
    isAiVsAi,
    isNetworkMatch,
    pendingSelection,
    hasPendingPlayerChoice: hasLocalPendingChoice,
    startNewGame: async () => {
      // Fade out/in when starting a new local match.
      setScreenFadeOverlayOpacity(1);
      await delay(SCREEN_FADE_MS);
      startNewGame();
      window.requestAnimationFrame(() => setScreenFadeOverlayOpacity(0));
    },
    navigateToScreen,
    cancelPendingSelection,
    setDiscardOpen,
    setEndTurnWarningActions,
    setPreviewTarget,
    setPendingSelection,
    setActionNotice,
    submitPlayerIntent,
  });
  const onOpenPlayerDiscard = () => {
    setDiscardViewSide("player");
    onOpenDiscard();
  };
  const onOpenOpponentDiscard = () => {
    setDiscardViewSide("opponent");
    setOpponentZonesOpen(false);
    setDiscardOpen(true);
  };
  const onOpenOpponentZones = () => {
    setMenuOpen(false);
    setOpponentZonesOpen(true);
  };
  const onChooseAttackShuffleSelf = (shouldShuffle: boolean) => {
    if (!pendingSelection || pendingSelection.kind !== "attackShuffleSelfChoice") return;
    if (isNetworkMatch) {
      submitPlayerIntent({
        type: "attack",
        attackIndex: pendingSelection.attackIndex,
        useShuffleSelfIntoDeck: shouldShuffle,
      });
    } else {
      setGame((current) => playerAttack(
        current,
        undefined,
        undefined,
        undefined,
        undefined,
        pendingSelection.attackIndex,
        undefined,
        undefined,
        undefined,
        shouldShuffle,
      ));
    }
    setPendingSelection(null);
    setPreviewTarget(null);
  };

  const advanceSetupCountdown = () => {
    setGame((current) => {
      const next = tickSetupCountdown(current);
      if (isPvpHost) syncToGuest(next);
      return next;
    });
  };

  const handleChooseOpeningCoin = (choice: CoinFlipResult) => {
    setOpeningCoinChoicePending(true);
    setGame((current) => {
      const next = chooseOpeningCoin(current, choice);
      if (isPvpHost) syncToGuest(next);
      return next;
    });
  };

  useEffect(() => {
    if (game.phase !== "setup") {
      setOpeningCoinChoicePending(false);
      return;
    }
    if (!game.setup?.coinChoice) {
      setOpeningCoinChoicePending(false);
      return;
    }
    if (game.setup.coinFlipResult || activeCoinFlip) setOpeningCoinChoicePending(false);
  }, [activeCoinFlip, game.phase, game.setup?.coinChoice, game.setup?.coinFlipResult]);

  useEffect(() => {
    const setup = game.setup;
    if (game.phase !== "setup" || !setup?.coinFlipResult || setup.openingHandsDealt) return;
    if (isCoinFlipBlocking || cardFlowQueue.length > 0) return;
    const openingHand = setup.openingHands.player.filter(Boolean);
    if (openingHand.length === 0) return;

    const animationKey = `${setup.coinFlipResult}:${openingHand.join("|")}`;
    if (openingHandAnimationKeyRef.current === animationKey) return;
    openingHandAnimationKeyRef.current = animationKey;
    shouldDealOpeningHandsAfterFlowRef.current = true;
    setCardFlowQueue((queue) => [
      ...queue,
      openingHand.map((cardId) => ({
        cardId,
        group: "drawn",
        enterFrom: "leftDeck",
        exitTo: "bottomCenter",
      })),
    ]);
  }, [cardFlowQueue.length, game.phase, game.setup, isCoinFlipBlocking]);

  useAppRuntimeEffects({
    game,
    player,
    isAiVsAi,
    isNetworkMatch,
    shouldDriveSetupCountdown: !isNetworkMatch || isPvpHost,
    advanceSetupCountdown,
    isTurnFlowBlocked: isTurnFlowBlocked || visualFlowBlocked,
    isBattleAnimationBlocking: visualFlowBlocked || Boolean(activeCoinFlip),
    isCoinFlipBlocking,
    hiddenOpponent,
    equippedDeckId: equippedDeck.id,
    customisation,
    screen,
    pendingScreen,
    actionNotice,
    previewTarget,
    endTurnWarningActions,
    pendingSelection,
    activeCoinFlip,
    coinFlipQueue,
    coinFlipIdRef,
    wasSetupCoinFlipBlockingRef,
    setGame,
    setScreen,
    setPendingScreen,
    setScreenFadeOverlayOpacity,
    setActionNotice,
    setPreviewTarget,
    setOpponentSetupRevealToken,
    setPendingSelection,
    setEndTurnWarningActions,
    setSetupActiveIndex,
    setSetupBenchIndexes,
    setDiscardOpen,
    setMenuOpen,
    setPendingCoinAttack,
    setActiveCoinFlip,
    setCoinFlipQueue,
  });

  const handleEscapeFromPvpLobby = () => {
    if (pvpRole) {
      clearPvp();
      return;
    }
    clearPvp();
    navigateToScreen("modeSelect");
  };

  useEscapeHotkey({
    screen,
    gameOver: game.gameOver,
    hasPendingPlayerChoice: hasLocalPendingChoice,
    isTurnFlowBlocked: isTurnFlowBlocked || visualFlowBlocked,
    endTurnWarningActions,
    previewTarget,
    discardOpen,
    opponentZonesOpen,
    pendingSelection,
    actionNotice,
    menuOpen,
    navigateToScreen,
    onEscapeFromPvpLobby: handleEscapeFromPvpLobby,
    setEndTurnWarningActions,
    setPreviewTarget,
    setDiscardOpen,
    setOpponentZonesOpen,
    setPendingSelection,
    setActionNotice,
    setMenuOpen,
    isBottomActionNotice,
  });

  useLogNotifications({
    gameLog: game.log,
    actionNotice,
    activeCoinFlip,
    previousLogRef,
    coinFlipIdRef,
    skipNextCoinLogMessageRef,
    setActionNotice,
    setCoinFlipQueue,
    setActiveCoinFlip,
    setAcknowledgedCoinLogMessage,
    toCoinFlipEvent,
    getNewLogEntries,
    getKoCauseFromEntries,
    formatKoActionNotice,
  });

  useLayoutEffect(() => {
    const current = createBattleSnapshot(baseDisplayGame);
    const previous = previousBattleSnapshotRef.current;
    if (!previous) {
      previousBattleSnapshotRef.current = current;
      return;
    }

    if (current.phase !== "play" || isCoinFlipBlocking) return;

    const effects = buildBattleEffects(previous, current, () => battleEffectIdRef.current++);
    if (effects.length > 0) {
      const koEffects = effects.filter((effect) => effect.kind === "ko" && effect.targetUid !== undefined);
      if (koEffects.length > 0) {
        const totalGainsBySide: Partial<Record<SideId, number>> = {};
        koEffects.forEach((effect) => {
          const scoringSide: SideId = effect.side === "player" ? "opponent" : "player";
          totalGainsBySide[scoringSide] = (totalGainsBySide[scoringSide] ?? 0) + 1;
        });
        setScorePointsOverrideBySide((currentOverrides) => {
          const nextOverrides = { ...currentOverrides };
          (Object.entries(totalGainsBySide) as [SideId, number][]).forEach(([scoringSide, totalGains]) => {
            if (nextOverrides[scoringSide] !== undefined) return;
            nextOverrides[scoringSide] = Math.max(0, baseDisplayGame.sides[scoringSide].points - totalGains);
          });
          return nextOverrides;
        });
      }
      const activeKoSides = effects
        .filter((effect) => effect.kind === "ko" && effect.targetSlot?.zone === "active")
        .map((effect) => effect.side);
      if (activeKoSides.length > 0) {
        setKoPromotionLockedBySide((currentLocks) => {
          const nextLocks = { ...currentLocks };
          activeKoSides.forEach((sideId) => { nextLocks[sideId] = true; });
          return nextLocks;
        });
      }
      setBattleEffectQueue((queue) => [...queue, ...effects]);
      setVisualHpByUid((currentVisualHp) => {
        const nextVisualHp = { ...currentVisualHp };
        effects.forEach((effect) => {
          if (effect.targetUid === undefined || effect.hpBefore === undefined) return;
          if (nextVisualHp[effect.targetUid] === undefined) nextVisualHp[effect.targetUid] = effect.hpBefore;
        });
        return nextVisualHp;
      });
      setVisualAttachedEnergyByUid((currentVisualEnergy) => {
        const nextVisualEnergy = { ...currentVisualEnergy };
        effects.forEach((effect) => {
          if (effect.kind !== "energy" || effect.targetUid === undefined || !effect.attachedEnergyBefore) return;
          if (nextVisualEnergy[effect.targetUid] === undefined) nextVisualEnergy[effect.targetUid] = effect.attachedEnergyBefore;
        });
        return nextVisualEnergy;
      });
    }
    previousBattleSnapshotRef.current = current;
  }, [baseDisplayGame, isCoinFlipBlocking]);

  useLayoutEffect(() => {
    const previous = previousPlayerZonesRef.current;
    const current = {
      player: {
        hand: [...game.sides.player.hand],
        deck: [...game.sides.player.deck],
        discard: [...game.sides.player.discard],
        inPlay: getInPlayCardIds(game.sides.player),
      },
      opponent: {
        hand: [...game.sides.opponent.hand],
        deck: [...game.sides.opponent.deck],
        discard: [...game.sides.opponent.discard],
        inPlay: getInPlayCardIds(game.sides.opponent),
      },
      currentSide: game.currentSide,
      turnNumber: game.turnNumber,
      phase: game.phase,
      log: [...game.log],
    };

    if (!previous) {
      previousPlayerZonesRef.current = current;
      return;
    }

    if (game.phase !== "play" || game.gameOver) {
      previousPlayerZonesRef.current = current;
      return;
    }
    // Defer visual zone-diff animations until coin-flip UI is fully resolved/closed.
    // Keeping the previous snapshot allows the queued diff to animate immediately after unblock.
    if (isCoinFlipBlocking) return;
    const nextFlow: CardFlowItem[] = [];
    const newLogEntries = getNewLogHeadEntries(previous.log, current.log);
    const povSideId: SideId = isAiVsAi ? displayPerspective : "player";
    const flowSleeveBySide: Record<SideId, string | null> = isAiVsAi && displayPerspective === "opponent"
      ? { player: opponentSleeve.image, opponent: selectedSleeve.image }
      : { player: selectedSleeve.image, opponent: opponentSleeve.image };
    const sideIds: SideId[] = ["player", "opponent"];
    for (const sideId of sideIds) {
      const previousSide = previous[sideId];
      const currentSide = current[sideId];
      const isPovSide = sideId === povSideId;
      const actor = isPovSide ? "You" : "Opponent";
      const fadeOutInPlace = !isPovSide;
      const sideOnRight = sideId === "player";
      const discardedFromHandCards = allCardsMoved(
        previousSide.hand,
        currentSide.hand,
        previousSide.discard,
        currentSide.discard,
      );
      const retrievedIntoDeckCards = allCardsMoved(
        previousSide.inPlay,
        currentSide.inPlay,
        previousSide.deck,
        currentSide.deck,
      );
      let obtainedFromDeckCards = subtractCardLists(currentSide.hand, previousSide.hand);
      const shuffleDrawCount = getShuffleHandDrawCount(previous.log, current.log, sideId);
      if (shuffleDrawCount && obtainedFromDeckCards.length < shuffleDrawCount) {
        // For effects like Tracen Academy, a card may leave hand, shuffle into deck, then be redrawn.
        // Diff alone misses those redraws, so take the freshly rebuilt hand tail by drawn count.
        obtainedFromDeckCards = currentSide.hand.slice(-shuffleDrawCount);
      }
      const shouldShowHandGain = hasHandGainLogEntry(newLogEntries, sideId)
        || isAutomaticTurnDraw(previous, current, sideId, obtainedFromDeckCards);
      if (obtainedFromDeckCards.length > 0 && shouldShowHandGain) {
        const label = `${actor} Drew`;
        obtainedFromDeckCards.slice(0, 5).forEach((cardId) => {
          nextFlow.push({
            cardId,
            label,
            group: "drawn",
            enterFrom: sideOnRight ? "leftDeck" : "bottomLeft",
            exitTo: "bottomCenter",
            faceDownImage: isPovSide ? undefined : flowSleeveBySide[sideId],
            fadeOutInPlace,
          });
        });
      }
      if (retrievedIntoDeckCards.length > 0) {
        retrievedIntoDeckCards.slice(0, 8).forEach((cardId) => {
          nextFlow.push({
            cardId,
            label: `${actor} Retrieved`,
            group: "retrieved",
            enterFrom: sideOnRight ? "bottomRight" : "bottomLeft",
            exitTo: "leftDeck",
            faceDownImage: isPovSide ? undefined : flowSleeveBySide[sideId],
            fadeOutInPlace,
          });
        });
      }

      discardedFromHandCards.slice(0, 5).forEach((discardedFromHand) => {
        const cardName = tryGetCardName(discardedFromHand);
        const played = Boolean(cardName && hasPlayLogEntry(previous.log, current.log, cardName));
        const discarded = hasHandDiscardLogEntry(newLogEntries, sideId, cardName);
        if (!played && !discarded) return;

        nextFlow.push({
          cardId: discardedFromHand,
          label: played ? `${actor} Played` : `${actor} Discarded`,
          group: played ? "played" : "discarded",
          enterFrom: sideOnRight ? "rightHand" : "leftHand",
          exitTo: isPovSide ? "rightDiscard" : sideOnRight ? "rightHand" : "leftHand",
          faceDownImage: !played && !isPovSide ? flowSleeveBySide[sideId] : undefined,
          fadeOutInPlace,
        });
      });
    }

    if (nextFlow.length > 0) {
      const flowBatches = splitCardFlowIntoBatches(nextFlow);
      setCardFlowQueue((queue) => [...queue, ...flowBatches]);
    }

    previousPlayerZonesRef.current = current;
  }, [game, isAiVsAi, displayPerspective, isCoinFlipBlocking, opponentSleeve.image, selectedSleeve.image]);

  const showShuffleReveal = (cardId: string) => {
    setCardFlowQueue((queue) => [
      ...queue,
      [{
        cardId,
        label: "You Retrieved",
        group: "retrieved",
        enterFrom: "rightDiscard",
        exitTo: "leftDeck",
      }],
    ]);
  };

  const {
    playHandCardOnCenter,
    playHandCardOnStadiumSpot,
    playHandCardOnUmamusume,
    playHandCardOnBenchSlot,
    attachEnergyByDrop,
    moveAbilityEnergyByDrop,
    chooseHandCard,
    chooseScoutDeckCard,
    selectUmamusume,
    selectStadiumForTrainerTarget,
    selectAttachedToolForTrainerTarget,
    handleSetupReady,
  } = useMatchActions({
    game,
    player,
    isAiVsAi,
    pendingSelection,
    activePendingSelection,
    selectableHandIndexes,
    isTurnFlowBlocked,
    setupActiveIndex,
    setupBenchIndexes,
    coinFlipIdRef,
    setGame,
    setPendingSelection,
    setPreviewTarget,
    setPendingCoinAttack,
    setActiveCoinFlip,
    applyPlayerGameUpdate,
    getPendingAttackCoinFlip,
    submitPlayerIntent,
    isNetworkMatch,
    showShuffleReveal,
    onRevealOpponentHandSnapshot: (cardIds) => {
      setRevealedOpponentHandCardIds(cardIds);
      setRevealedOpponentHandOpen(true);
    },
  });
  const queueVisualAction = (action: () => void) => {
    if (visualFlowBlocked) {
      queuedVisualActionsRef.current.push(action);
      return;
    }
    action();
  };
  useEffect(() => {
    if (visualFlowBlocked || queuedVisualActionsRef.current.length === 0) return;
    const queuedActions = queuedVisualActionsRef.current;
    queuedVisualActionsRef.current = [];
    queuedActions.forEach((action) => action());
  }, [visualFlowBlocked]);
  const queuedPlayHandCardOnCenter = (handIndex: number) => queueVisualAction(() => playHandCardOnCenter(handIndex));
  const queuedPlayHandCardOnStadiumSpot = (handIndex: number) => queueVisualAction(() => playHandCardOnStadiumSpot(handIndex));
  const queuedPlayHandCardOnUmamusume = (handIndex: number, umamusumeUid: number) => queueVisualAction(() => playHandCardOnUmamusume(handIndex, umamusumeUid));
  const queuedPlayHandCardOnBenchSlot = (handIndex: number) => queueVisualAction(() => playHandCardOnBenchSlot(handIndex));
  const queuedAttachEnergyByDrop = (umamusumeUid: number) => queueVisualAction(() => attachEnergyByDrop(umamusumeUid));
  const queuedMoveAbilityEnergyByDrop = (sourceUmamusumeUid: number, energyType: EnergyType) => queueVisualAction(() => moveAbilityEnergyByDrop(sourceUmamusumeUid, energyType));
  const queuedChooseHandCard = (handIndex: number) => queueVisualAction(() => chooseHandCard(handIndex));
  const queuedSelectUmamusume = (umamusume: UmamusumeInstance) => queueVisualAction(() => selectUmamusume(umamusume));
  const queuedSelectStadiumForTrainerTarget = () => queueVisualAction(selectStadiumForTrainerTarget);
  const queuedSelectAttachedToolForTrainerTarget = (umamusumeUid: number) => queueVisualAction(() => selectAttachedToolForTrainerTarget(umamusumeUid));
  const cardPreviewActions = useCardPreviewActions({
    game,
    player,
    previewTarget,
    isTurnFlowBlocked: isTurnFlowBlocked || visualFlowBlocked,
    coinFlipIdRef,
    setGame,
    setPendingSelection,
    setPreviewTarget,
    setPendingCoinAttack,
    setActiveCoinFlip,
    applyPlayerGameUpdate,
    getPendingAttackCoinFlip,
    submitPlayerIntent,
    isNetworkMatch,
    showShuffleReveal,
  });
  const { handleCoinFlipContinue } = useCoinFlipResolution({
    game,
    activeCoinFlip,
    pendingCoinAttack,
    skipNextCoinLogMessageRef,
    setGame,
    setPendingCoinAttack,
    setActiveCoinFlip,
    setCoinFlipQueue,
    setAcknowledgedCoinLogMessage,
    toCoinFlipEvent,
  });
  const canAttachInHeader = !isAiVsAi && canAttachEnergy(game, player) && !isBusyWithChoice && !visualFlowBlocked;
  const canEndTurnInHeader = !isAiVsAi && !game.gameOver && game.currentSide === "player" && !isBusyWithChoice && !visualFlowBlocked;
  const hasLocalSetupReady = game.phase === "setup" ? (game.setup?.readyBySide.player ?? false) : false;
  const openingHandsDealt = game.phase === "setup" ? (game.setup?.openingHandsDealt ?? false) : true;
  const canChooseOpeningCoin = game.phase === "setup"
    && !game.setup?.coinFlipResult
    && !isAiVsAi
    && (!isNetworkMatch || isPvpHost);
  const canSetupReady = !isAiVsAi && openingHandsDealt && !hasLocalSetupReady && !isSetupCountdownActive;
  const canSurrenderInPanels = !game.gameOver && !isTurnFlowBlocked;
  const playerExtraEnergyCount = Math.max(0, displayPlayer.energyZone.length - 1);
  const topBanner = getTopActionBanner(game);
  const displayTopBanner = topBanner
    ? {
        ...topBanner,
        title: formatMatchText(topBanner.title),
        message: formatMatchText(topBanner.message),
      }
    : null;
  const activeBattleEffects = battleEffectQueue[0]?.batchKey
    ? getLeadingBattleEffectBatch(battleEffectQueue)
    : battleEffectQueue[0]
      ? [battleEffectQueue[0]]
      : [];
  const scheduleKoPromotionRelease = (sideIds: SideId[]) => {
    const uniqueSideIds = Array.from(new Set(sideIds));
    uniqueSideIds.forEach((sideId) => {
      const existingTimeout = koVacancyTimeoutBySideRef.current[sideId];
      if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
      koVacancyTimeoutBySideRef.current[sideId] = window.setTimeout(() => {
        setKoVacancyBySide((current) => {
          const next = { ...current };
          delete next[sideId];
          return next;
        });
        setKoPromotionLockedBySide((current) => {
          const next = { ...current };
          delete next[sideId];
          return next;
        });
        setKoRetainedBoardBySide((current) => {
          const next = { ...current };
          delete next[sideId];
          return next;
        });
        setActivePromotionRevealingBySide((current) => ({ ...current, [sideId]: true }));
        const existingRevealTimeout = activePromotionRevealTimeoutBySideRef.current[sideId];
        if (existingRevealTimeout !== undefined) window.clearTimeout(existingRevealTimeout);
        activePromotionRevealTimeoutBySideRef.current[sideId] = window.setTimeout(() => {
          setActivePromotionRevealingBySide((current) => {
            const next = { ...current };
            delete next[sideId];
            return next;
          });
          delete activePromotionRevealTimeoutBySideRef.current[sideId];
        }, ACTIVE_PROMOTION_REVEAL_MS);
        delete koVacancyTimeoutBySideRef.current[sideId];
      }, KO_ACTIVE_VACANCY_MS);
    });
  };

  const createPointGainEvents = (koEffects: BattleEffectEvent[]): PointGainEvent[] => {
    const totalGainsBySide: Partial<Record<SideId, number>> = {};
    koEffects.forEach((effect) => {
      const scoringSide: SideId = effect.side === "player" ? "opponent" : "player";
      totalGainsBySide[scoringSide] = (totalGainsBySide[scoringSide] ?? 0) + 1;
    });

    const seenGainsBySide: Partial<Record<SideId, number>> = {};
    return koEffects.map((effect) => {
      const scoringSide: SideId = effect.side === "player" ? "opponent" : "player";
      const seen = (seenGainsBySide[scoringSide] ?? 0) + 1;
      seenGainsBySide[scoringSide] = seen;
      const totalGains = totalGainsBySide[scoringSide] ?? 1;
      const currentPoints = baseDisplayGame.sides[scoringSide].points;
      const previousPoints = Math.max(0, currentPoints - totalGains + seen - 1);
      return {
        id: pointGainIdRef.current++,
        side: scoringSide,
        previousPoints,
        points: previousPoints + 1,
      };
    });
  };

  const completeBattleEffect = () => {
    const completedEffects = getLeadingBattleEffectBatch(battleEffectQueue);
    const remaining = battleEffectQueue.slice(completedEffects.length || 1);
    const completedKoEffects = completedEffects.filter((effect) => effect.kind === "ko" && effect.targetUid !== undefined);
    const completedKoUids = completedKoEffects.map((effect) => effect.targetUid as number);
    const completedActiveKoEffects = completedKoEffects.filter((effect) => effect.targetSlot?.zone === "active");
    const pointGainEvents = createPointGainEvents(completedKoEffects);
    if (pointGainEvents.length > 0) {
      setScorePointsOverrideBySide((current) => {
        const next = { ...current };
        pointGainEvents.forEach((event) => {
          if (next[event.side] === undefined) next[event.side] = event.previousPoints;
        });
        return next;
      });
    }
    setBattleEffectQueue(remaining);
    setVisualHpByUid((currentVisualHp) => {
      const nextVisualHp = { ...currentVisualHp };
      completedEffects.forEach((effect) => {
        if (effect.targetUid === undefined || effect.hpAfter === undefined) return;
        if (completedKoUids.includes(effect.targetUid)) return;
        const hasFutureHpEvent = remaining.some((futureEffect) => futureEffect.targetUid === effect.targetUid && futureEffect.hpAfter !== undefined);
        if (!hasFutureHpEvent) delete nextVisualHp[effect.targetUid];
      });
      return nextVisualHp;
    });
    setVisualAttachedEnergyByUid((currentVisualEnergy) => {
      const nextVisualEnergy = { ...currentVisualEnergy };
      completedEffects.forEach((effect) => {
        if (effect.kind !== "energy" || effect.targetUid === undefined) return;
        if (effect.attachedEnergyAfter) nextVisualEnergy[effect.targetUid] = effect.attachedEnergyAfter;
        const hasFutureEnergyEvent = remaining.some((futureEffect) => futureEffect.kind === "energy" && futureEffect.targetUid === effect.targetUid);
        if (!hasFutureEnergyEvent) delete nextVisualEnergy[effect.targetUid];
      });
      return nextVisualEnergy;
    });
    if (completedKoUids.length > 0) {
      setKoCrumblingUids((current) => {
        const next = new Set(current);
        completedKoUids.forEach((uid) => next.add(uid));
        return next;
      });
      setKoRetainedActiveBySide((current) => {
        const next = { ...current };
        completedActiveKoEffects.forEach((effect) => {
          if (effect.targetUmamusume) next[effect.side] = cloneBattleSnapshotUmamusume(effect.targetUmamusume);
        });
        return next;
      });
      setKoRetainedBoardBySide((current) => {
        const next = { ...current };
        completedKoEffects.forEach((effect) => {
          if (effect.targetBoardBefore) next[effect.side] = cloneBattleEffectBoardSnapshot(effect.targetBoardBefore);
        });
        return next;
      });
      const crumbleTimeout = window.setTimeout(() => {
        setKoCrumblingUids((current) => {
          const next = new Set(current);
          completedKoUids.forEach((uid) => next.delete(uid));
          return next;
        });
        setVisualHpByUid((currentVisualHp) => {
          const nextVisualHp = { ...currentVisualHp };
          completedKoUids.forEach((uid) => {
            const hasFutureHpEvent = remaining.some((futureEffect) => futureEffect.targetUid === uid && futureEffect.hpAfter !== undefined);
            if (!hasFutureHpEvent) delete nextVisualHp[uid];
          });
          return nextVisualHp;
        });
        if (completedActiveKoEffects.length > 0) {
          const activeSides = Array.from(new Set(completedActiveKoEffects.map((effect) => effect.side)));
          const activeSideSet = new Set(activeSides);
          const benchOnlySides = completedKoEffects
            .map((effect) => effect.side)
            .filter((sideId) => !activeSideSet.has(sideId));
          if (benchOnlySides.length > 0) {
            setKoRetainedBoardBySide((current) => {
              const next = { ...current };
              benchOnlySides.forEach((sideId) => {
                delete next[sideId];
              });
              return next;
            });
          }
          setKoRetainedActiveBySide((current) => {
            const next = { ...current };
            activeSides.forEach((sideId) => {
              delete next[sideId];
            });
            return next;
          });
          setKoVacancyBySide((current) => {
            const next = { ...current };
            activeSides.forEach((sideId) => { next[sideId] = true; });
            return next;
          });
          if (pointGainEvents.length > 0) {
            pendingKoPromotionReleaseSidesRef.current = Array.from(new Set([...pendingKoPromotionReleaseSidesRef.current, ...activeSides]));
          } else {
            scheduleKoPromotionRelease(activeSides);
          }
        } else {
          const koSides = completedKoEffects.map((effect) => effect.side);
          setKoRetainedBoardBySide((current) => {
            const next = { ...current };
            koSides.forEach((sideId) => {
              delete next[sideId];
            });
            return next;
          });
        }
        if (pointGainEvents.length > 0) {
          setPointGainQueue((queue) => [...queue, ...pointGainEvents]);
        }
      }, KO_DISSOLVE_MS + 20);
      koCrumbleTimeoutIdsRef.current.push(crumbleTimeout);
    }
  };
  const activeKoImpactUidBySide: Partial<Record<SideId, number>> = {};
  activeBattleEffects.forEach((effect) => {
    if (effect.kind !== "ko" || effect.targetSlot?.zone !== "active" || effect.targetUid === undefined) return;
    activeKoImpactUidBySide[effect.side] = effect.targetUid;
  });
  const activeKoAnimatingUidBySide: Partial<Record<SideId, number>> = {};
  const koAnimatingUids = new Set<number>(koCrumblingUids);
  const suppressActiveReplacementBySide: Partial<Record<SideId, boolean>> = {};
  (["player", "opponent"] as SideId[]).forEach((sideId) => {
    const retainedActive = koRetainedActiveBySide[sideId];
    if (retainedActive && koAnimatingUids.has(retainedActive.uid)) {
      activeKoAnimatingUidBySide[sideId] = retainedActive.uid;
      suppressActiveReplacementBySide[sideId] = true;
    }
    if (koVacancyBySide[sideId]) suppressActiveReplacementBySide[sideId] = true;
  });
  const battleQueueHasKo = battleEffectQueue.some((effect) => effect.kind === "ko");
  const cardFlowHasPriority = !battleQueueHasKo && (cardFlowQueue[0]?.some((item) => item.group === "played" || item.group === "discarded") ?? false);
  const canShowCardFlowOverlay = cardFlowQueue.length > 0
    && (battleEffectQueue.length === 0 || cardFlowHasPriority)
    && koCrumblingUids.size === 0
    && pointGainQueue.length === 0
    && !hasKoVacancy
    && !hasKoPromotionLock
    && !hasActivePromotionReveal
    && !activeCoinFlip
    && !game.pendingPlayerChoice;
  const canShowBattleEffects = activeBattleEffects.length > 0
    && !activeCoinFlip
    && koCrumblingUids.size === 0
    && pointGainQueue.length === 0
    && !hasKoVacancy
    && !hasKoPromotionLock
    && !hasActivePromotionReveal
    && (!cardFlowHasPriority || battleQueueHasKo);
  useEffect(() => {
    if (!canShowBattleEffects) return;
    const hpEffects = activeBattleEffects.filter((effect) => effect.targetUid !== undefined && effect.hpAfter !== undefined);
    if (hpEffects.length === 0) return;
    const hpBatchSignature = hpEffects.map((effect) => `${effect.id}:${effect.targetUid}:${effect.hpAfter}`).join("|");
    if (appliedVisibleHpBatchRef.current === hpBatchSignature) return;
    appliedVisibleHpBatchRef.current = hpBatchSignature;
    setVisualHpByUid((currentVisualHp) => {
      const nextVisualHp = { ...currentVisualHp };
      hpEffects.forEach((effect) => {
        nextVisualHp[effect.targetUid!] = effect.hpAfter!;
      });
      return nextVisualHp;
    });
  }, [canShowBattleEffects, activeBattleEffects]);
  const canShowSelectionPrompt = Boolean(activePendingSelection)
    && battleEffectQueue.length === 0
    && koCrumblingUids.size === 0
    && !hasKoVacancy
    && !activeCoinFlip;
  const pvpSecondsRemaining = game.turnDeadlineMs === null
    ? 30
    : Math.max(0, Math.ceil((game.turnDeadlineMs - pvpTimerNowMs) / 1000));
  const turnLabel = isNetworkMatch && game.phase === "play"
    ? `Turn ${game.turnNumber} • ${pvpSecondsRemaining}s`
    : isAiVsAi && game.phase === "play"
      ? `Turn ${game.turnNumber} • ${game.currentSide === displayPerspective ? "Your turn" : "Opponent's turn"}`
      : undefined;
  const turnAlert = isNetworkMatch && game.phase === "play" && game.currentSide === "player";
  const switchPov = isAiVsAi
    ? () => {
        setPovSwitchAnimationToken((current) => current + 1);
        setAiPerspective((current) => (current === "player" ? "opponent" : "player"));
      }
    : undefined;
  const displayPlayerSleeveImage = isAiVsAi && displayPerspective === "opponent" ? opponentSleeve.image : selectedSleeve.image;
  const displayOpponentSleeveImage = isAiVsAi && displayPerspective === "opponent" ? selectedSleeve.image : opponentSleeve.image;
  const activePointGain = pointGainQueue[0];
  const visualScorePointsBySide: Partial<Record<SideId, number>> = { ...scorePointsOverrideBySide };
  const scorePointGainAnimatingBySide: Partial<Record<SideId, number>> = {};
  if (activePointGain) {
    visualScorePointsBySide[activePointGain.side] = activePointGain.points;
    scorePointGainAnimatingBySide[activePointGain.side] = activePointGain.points;
  }
  const deferredHandRevealCardIds = (cardFlowQueue[0] ?? [])
    .filter((item) => item.group === "drawn" && item.exitTo === "bottomCenter")
    .map((item) => item.cardId)
    .concat(openingHandDeferredRevealCardIds);
  const isPlayPhase = game.phase === "play";
  if (isPlayPhase && game.currentSide !== "done") {
    lastVisiblePlaymatSideRef.current = game.currentSide;
  }
  const playmatSide: SideId = isPlayPhase && game.currentSide === "done"
    ? lastVisiblePlaymatSideRef.current
    : game.currentSide === "opponent"
      ? "opponent"
      : "player";
  const showSelectedPlaymat = isPlayPhase
    ? playmatSide === "player"
    : displayPerspective === "player";
  const showOpponentPlaymat = isPlayPhase
    ? playmatSide === "opponent" && !suppressOpponentPlaymatLayer
    : displayPerspective === "opponent";

  const nonMatchScreen = renderNonMatchScreen({
    screen,
    selectedPlaymatImage: selectedPlaymat.image,
    uiTextTone,
    screenFadeOverlayOpacity,
    equippedDeck,
    account: firebaseAccount,
    accountBusy,
    customisation,
    navigateToScreen,
    setEquippedDeckId,
    setCustomisation,
    startWithMode,
    playEquippedDeck,
    linkGoogleAccount,
    logoutAccount,
    quitApp,
    pvpRole,
    pvpStatusDetail,
    pvpLocalSignal,
    pvpRemoteSignal,
    pvpConnected,
    onPvpSetRole: setPvpRoleAndReset,
    onPvpCreateOffer: createOffer,
    onPvpJoinWithOffer: joinWithOffer,
    onPvpRemoteSignalChange: setPvpRemoteSignal,
    onPvpCopyLocalSignal: copyLocalSignal,
    onPvpClear: clearPvp,
  });
  if (nonMatchScreen) return nonMatchScreen;

  const matchFallback = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
        color: "var(--ui-text-color)",
        textShadow: "var(--ui-text-shadow)",
        fontSize: "0.85rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        background: "rgba(7, 12, 16, 0.35)",
        pointerEvents: "none",
      }}
    >
      Loading match...
    </div>
  );

  return (
    <main style={appStyle(false, undefined, uiTextTone)}>
      <div style={matchBackgroundLayerStyle(selectedPlaymat.image, showSelectedPlaymat ? 1 : 0)} />
      <div style={matchBackgroundLayerStyle(opponentPlaymat.image, showOpponentPlaymat ? 1 : 0, suppressOpponentPlaymatLayer)} />
      <Suspense fallback={matchFallback}>
        <MatchBoardLayout
          game={displayGame}
          displayedPlayerSide={displayedPlayerSide}
          displayedOpponentSide={displayedOpponentSide}
          hiddenOpponent={hiddenOpponent}
          opponentBoardHidden={opponentBoardHidden}
          opponentSetupRevealToken={opponentSetupRevealToken}
          povSwitchAnimationToken={povSwitchAnimationToken}
          hiddenOpponentBenchCount={hiddenOpponentBenchCount}
          abilityReadyUmamusumeUids={abilityReadyUmamusumeUids}
          playerSelectableUmamusumeUids={playerSelectableUmamusumeUids}
          opponentSelectableUmamusumeUids={opponentSelectableUmamusumeUids}
          abilityEnergyTypes={abilityEnergyTypes}
          setupDragHandIndexByUid={setupDragHandIndexByUid}
          onInspect={openPreview}
          onUmamusumeSelect={queuedSelectUmamusume}
          onAttachedToolSelect={pendingSelection?.kind === "masterCleatHammerTarget" ? queuedSelectAttachedToolForTrainerTarget : undefined}
          onSetupDropActive={applySetupActive}
          onSetupDropBench={applySetupBench}
          onSetupPromoteToActive={promoteSetupBenchToActive}
          onHandCardDropOnUmamusume={queuedPlayHandCardOnUmamusume}
          onHandCardDropOnBenchSlot={queuedPlayHandCardOnBenchSlot}
          onEnergyDropOnUmamusume={queuedAttachEnergyByDrop}
          onAbilityEnergyDropOnActive={queuedMoveAbilityEnergyByDrop}
          opponentSleeveImage={displayOpponentSleeveImage}
          stadiumAbilityReady={stadiumAbilityReady}
          onDropHandCardOnStadium={queuedPlayHandCardOnStadiumSpot}
          onSelectStadiumTarget={queuedSelectStadiumForTrainerTarget}
          stadiumSelectable={pendingSelection?.kind === "masterCleatHammerTarget"}
          onDropHandCardOnCenter={queuedPlayHandCardOnCenter}
          setupActiveIndex={setupActiveIndex}
          setupBenchIndexes={setupBenchIndexes}
          menuOpen={menuOpen}
          canSurrender={canSurrenderInPanels}
          onToggleMenu={toggleMenu}
          onSurrender={handleSurrender}
          onSetupReady={handleSetupReady}
          canSetupReady={canSetupReady}
          canSetupInteract={openingHandsDealt && !isSetupCountdownActive}
          onSwitchPov={switchPov}
          selectedSleeveImage={displayPlayerSleeveImage}
          canPlayHandCards={
            !isAiVsAi
            && displayGame.phase === "play"
            && !displayGame.gameOver
            && !displayGame.pendingPlayerChoice
            && displayGame.currentSide === "player"
            && !isTurnFlowBlocked
          }
          handDrawRevealEnabled={cardFlowQueue.length === 0}
          handDeferredRevealCardIds={deferredHandRevealCardIds}
          canAttach={canAttachInHeader}
          nextPlayerEnergy={nextPlayerEnergy}
          playerExtraEnergyCount={playerExtraEnergyCount}
          canEndTurn={canEndTurnInHeader}
          turnLabel={turnLabel}
          turnAlert={turnAlert}
          onEndTurn={handleEndTurn}
          selectableHandIndexes={selectableHandIndexes}
          onChooseHandCard={queuedChooseHandCard}
          onOpenDiscard={onOpenPlayerDiscard}
          onOpenOpponentZones={onOpenOpponentZones}
          displayLog={displayLog}
          visualHpByUid={visualHpByUid}
          visualAttachedEnergyByUid={visualAttachedEnergyByUid}
          koAnimatingUids={koAnimatingUids}
          suppressActiveReplacementBySide={suppressActiveReplacementBySide}
          activeKoImpactUidBySide={activeKoImpactUidBySide}
          activeKoAnimatingUidBySide={activeKoAnimatingUidBySide}
          visualScorePointsBySide={visualScorePointsBySide}
          scorePointGainAnimatingBySide={scorePointGainAnimatingBySide}
        />
        {displayTopBanner && (
          <Suspense fallback={null}>
            <OpponentActionBanner title={displayTopBanner.title} message={displayTopBanner.message} paused={displayTopBanner.paused} />
          </Suspense>
        )}
        {canShowBattleEffects && (
          <Suspense fallback={null}>
            {activeBattleEffects.map((effect, index) => (
              <BattleEffectOverlay
                key={effect.id}
                event={effect}
                onDone={index === activeBattleEffects.length - 1 ? completeBattleEffect : () => undefined}
              />
            ))}
          </Suspense>
        )}
        {pointGainQueue[0] && (
          <Suspense fallback={null}>
            <PointGainOverlay
              event={pointGainQueue[0]}
              onDone={() => {
                const remainingPointGains = pointGainQueue.slice(1);
                setPointGainQueue(remainingPointGains);
                setScorePointsOverrideBySide((current) => {
                  const next = { ...current };
                  const completedPointGain = pointGainQueue[0];
                  if (completedPointGain) {
                    const nextForSide = remainingPointGains.find((event) => event.side === completedPointGain.side);
                    if (nextForSide) next[completedPointGain.side] = nextForSide.previousPoints;
                    else delete next[completedPointGain.side];
                  }
                  return next;
                });
                if (remainingPointGains.length > 0) return;
                const releaseSides = pendingKoPromotionReleaseSidesRef.current;
                if (releaseSides.length === 0) return;
                pendingKoPromotionReleaseSidesRef.current = [];
                scheduleKoPromotionRelease(releaseSides);
              }}
            />
          </Suspense>
        )}
        {game.phase === "setup" && (!game.setup?.coinFlipResult || (openingCoinChoicePending && !activeCoinFlip)) && (
          <CoinFlipOverlay
            key="opening-coin-choice"
            mode="prompt"
            message={openingCoinChoicePending
              ? "Flipping coin..."
              : isAiVsAi
                ? "AI choosing heads or tails..."
                : canChooseOpeningCoin
                  ? "Choose heads or tails"
                  : "Waiting for host to choose heads or tails..."}
            canChoose={canChooseOpeningCoin && !openingCoinChoicePending}
            onChoose={handleChooseOpeningCoin}
          />
        )}
        {activeCoinFlip && (
          <CoinFlipOverlay
            key={activeCoinFlip.id}
            result={activeCoinFlip.result}
            results={activeCoinFlip.results}
            message={formatMatchText(activeCoinFlip.message)}
            onContinue={handleCoinFlipContinue}
          />
        )}
        {canShowCardFlowOverlay && cardFlowQueue[0] && (
          <Suspense fallback={null}>
            <CardFlowOverlay
              key={cardFlowBatchKey(cardFlowQueue[0])}
              items={cardFlowQueue[0]}
              durationMs={game.phase === "setup" ? 1500 : 2100}
              onDone={() => {
                const completedFlow = cardFlowQueue[0] ?? [];
                setCardFlowQueue((queue) => queue.slice(1));
                if (!shouldDealOpeningHandsAfterFlowRef.current) return;
                shouldDealOpeningHandsAfterFlowRef.current = false;
                const openingRevealCardIds = completedFlow
                  .filter((item) => item.group === "drawn" && item.exitTo === "bottomCenter")
                  .map((item) => item.cardId);
                setOpeningHandDeferredRevealCardIds(openingRevealCardIds);
                if (openingHandDeferredRevealTimeoutRef.current !== null) window.clearTimeout(openingHandDeferredRevealTimeoutRef.current);
                openingHandDeferredRevealTimeoutRef.current = window.setTimeout(() => {
                  setOpeningHandDeferredRevealCardIds([]);
                  openingHandDeferredRevealTimeoutRef.current = null;
                }, 120);
                setGame((current) => {
                  const next = dealOpeningHands(current);
                  if (isPvpHost) syncToGuest(next);
                  return next;
                });
              }}
            />
          </Suspense>
        )}
        {canShowSelectionPrompt && activePendingSelection && (
          <SelectionPrompt
            pending={activePendingSelection}
            onCancel={onSelectionCancel}
            onChooseAttackShuffleSelf={onChooseAttackShuffleSelf}
            nextEnergyType={nextPlayerEnergy}
            onRetreatDiscardAdjust={adjustRetreatDiscard}
            onConfirmRetreatDiscard={confirmRetreatDiscard}
          />
        )}
        <CardPreview
          state={displayGame}
          target={previewTarget}
          canUseAttack={cardPreviewActions.canUseAttack}
          canUseRetreat={cardPreviewActions.canUseRetreat}
          canUseAbility={cardPreviewActions.canUseAbility}
          onAttack={cardPreviewActions.onAttack}
          onRetreat={cardPreviewActions.onRetreat}
          onAbility={cardPreviewActions.onAbility}
          onInspect={openPreview}
          onClose={closePreview}
        />
        <EndTurnWarningModal
          actions={endTurnWarningActions}
          suppressForGame={suppressEndTurnWarningForGame}
          onSuppressForGameChange={setSuppressEndTurnWarningForGame}
          onCancel={onEndTurnWarningCancel}
          onConfirm={onEndTurnWarningConfirm}
        />
        {discardOpen && (
          <DiscardPileModal
            cardIds={displayGame.sides[discardViewSide].discard}
            pileLabel={discardViewSide === "opponent" ? "Opponent Discard Pile" : "Your Discard Pile"}
            onInspect={onDiscardInspect}
            onClose={onCloseDiscard}
          />
        )}
        {revealedOpponentHandOpen && (
          <DiscardPileModal
            cardIds={revealedOpponentHandCardIds}
            pileLabel="Opponent Hand (Revealed)"
            onInspect={(card) => setPreviewTarget({ card })}
            onClose={() => setRevealedOpponentHandOpen(false)}
          />
        )}
        {opponentZonesOpen && (
          <OpponentZonesModal
            handCount={displayGame.sides.opponent.hand.length}
            deckCount={displayGame.sides.opponent.deck.length}
            discardCount={displayGame.sides.opponent.discard.length}
            onOpenDiscard={onOpenOpponentDiscard}
            onClose={() => setOpponentZonesOpen(false)}
          />
        )}
        {(pendingSelection?.kind === "deckForScout" || pendingSelection?.kind === "deckForEvolutionSearch" || pendingSelection?.kind === "deckForAttackEvolution") && (
          <DeckChoiceModal
            cardIds={player.deck}
            filter={pendingSelection.kind === "deckForEvolutionSearch" || pendingSelection.kind === "deckForAttackEvolution" ? "evolutionUmamusume" : "umamusume"}
            evolvesFrom={pendingSelection.kind === "deckForAttackEvolution" ? pendingSelection.evolvesFrom : undefined}
            stage={pendingSelection.kind === "deckForAttackEvolution" ? pendingSelection.stage : undefined}
            onChoose={chooseScoutDeckCard}
            onClose={onDeckScoutClose}
          />
        )}
        {actionNotice && (
          <ActionNotice
            notice={formatMatchText(actionNotice)}
            tone={getActionNoticeTone(actionNotice)}
            placement={isBottomActionNotice(actionNotice) ? "bottom" : "top"}
            interactive={isBottomActionNotice(actionNotice)}
            onClose={onActionNoticeClose}
          />
        )}
        {game.gameOver && gameOverModalVisible && (
          <Suspense fallback={null}>
            <GameOverModal
              game={displayGame}
              playerName="You"
              opponentName="Opponent"
              onPlayAgain={isNetworkMatch ? returnToPvpLobbyForRematch : onPlayAgain}
              onMainMenu={returnToMainMenu}
            />
          </Suspense>
        )}
      </Suspense>
      <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
      {showAiTelemetryPanel && <AiTelemetryPanel />}
    </main>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function toPerspectiveGame(game: GameState, perspective: SideId): GameState {
  if (perspective === "player") {
    return {
      ...game,
      sides: {
        player: toDisplaySide(game.sides.player, "player", "You"),
        opponent: toDisplaySide(game.sides.opponent, "opponent", "Opponent"),
      },
    };
  }

  return {
    ...game,
    currentSide: swapSideId(game.currentSide),
    firstPlayer: swapSideId(game.firstPlayer) as SideId,
    winner: game.winner ? swapSideId(game.winner) as SideId : null,
    pendingPlayerChoice: game.pendingPlayerChoice
      ? { ...game.pendingPlayerChoice, sideId: swapSideId(game.pendingPlayerChoice.sideId) as SideId }
      : null,
    stadium: game.stadium ? { ...game.stadium, owner: swapSideId(game.stadium.owner) as SideId } : null,
    setup: game.setup
      ? {
          ...game.setup,
          openingHands: {
            player: game.setup.openingHands.opponent,
            opponent: game.setup.openingHands.player,
          },
          readyBySide: {
            player: game.setup.readyBySide.opponent,
            opponent: game.setup.readyBySide.player,
          },
        }
      : null,
    turnsTakenBySide: {
      player: game.turnsTakenBySide.opponent,
      opponent: game.turnsTakenBySide.player,
    },
    sides: {
      player: toDisplaySide(game.sides.opponent, "player", "You"),
      opponent: toDisplaySide(game.sides.player, "opponent", "Opponent"),
    },
  };
}

function toDisplaySide(side: SideState, id: SideId, title: string): SideState {
  return { ...side, id, title };
}

function swapSideId(sideId: SideId | "done"): SideId | "done" {
  if (sideId === "player") return "opponent";
  if (sideId === "opponent") return "player";
  return sideId;
}

function swapBattlePerspectiveText(text: string): string {
  const replacements: Array<[string, string]> = [
    ["Opponent is", "§YOU_CAP§ are"],
    ["opponent is", "§YOU_LOW§ are"],
    ["Opponent was", "§YOU_CAP§ were"],
    ["opponent was", "§YOU_LOW§ were"],
    ["Opponent has", "§YOU_CAP§ have"],
    ["opponent has", "§YOU_LOW§ have"],
    ["Opponent's", "§YOU_POS_CAP§"],
    ["opponent's", "§YOU_POS_LOW§"],
    ["Your", "§OPP_POS_CAP§"],
    ["your", "§OPP_POS_LOW§"],
    ["Opponent", "§YOU_CAP§"],
    ["opponent", "§YOU_LOW§"],
    ["You are", "§OPP_CAP§ is"],
    ["you are", "§OPP_LOW§ is"],
    ["You were", "§OPP_CAP§ was"],
    ["you were", "§OPP_LOW§ was"],
    ["You have", "§OPP_CAP§ has"],
    ["you have", "§OPP_LOW§ has"],
    ["You ", "§OPP_CAP§ "],
    ["you ", "§OPP_LOW§ "],
  ];

  let formatted = text;
  replacements.forEach(([search, replacement]) => {
    formatted = formatted.split(search).join(replacement);
  });

  return formatted
    .split("§YOU_POS_CAP§").join("Your")
    .split("§YOU_POS_LOW§").join("your")
    .split("§OPP_POS_CAP§").join("Opponent's")
    .split("§OPP_POS_LOW§").join("opponent's")
    .split("§YOU_CAP§").join("You")
    .split("§YOU_LOW§").join("you")
    .split("§OPP_CAP§").join("Opponent")
    .split("§OPP_LOW§").join("opponent");
}

function redactHiddenSidePrivateInfo(entry: string): string {
  if (!entry.startsWith("Opponent")) return entry;
  if (/^Opponent added .+ from .*deck to .*hand\.?$/.test(entry)) return "Opponent added 1 card from their deck to their hand.";
  if (/^Opponent put .+ from .*discard into .*hand\.?$/.test(entry)) return "Opponent put 1 card from discard into their hand.";
  if (/^Opponent revealed .+ and added it to .*hand\.?$/.test(entry)) return "Opponent revealed a card and added it to their hand.";
  const drawnCountMatch = entry.match(/^Opponent drew (\d+) cards?\./);
  if (drawnCountMatch?.[1]) {
    const count = Number(drawnCountMatch[1]);
    return `Opponent drew ${count} ${count === 1 ? "card" : "cards"}.`;
  }
  if (entry.startsWith("Opponent drew ")) return "Opponent drew cards.";
  if (entry.includes(" discarded ") && entry.includes(" and drew ")) {
    const drawCount = entry.match(/ and drew (\d+) cards?\./);
    if (drawCount?.[1]) {
      const count = Number(drawCount[1]);
      return `Opponent discarded a card and drew ${count} ${count === 1 ? "card" : "cards"}.`;
    }
    return "Opponent discarded a card and drew cards.";
  }
  if (entry.startsWith("Opponent discarded ")) return "Opponent discarded a card.";
  return entry;
}
