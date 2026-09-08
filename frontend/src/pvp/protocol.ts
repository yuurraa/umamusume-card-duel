import type { EnergyType, GameEvent, GameState } from "../../../shared/src/types";
import { cards } from "../../../shared/src/gameData";
import type { PlayerIntent } from "./playerIntent";

const COMPRESSED_MESSAGE_PREFIX = "UCDM1.";
// Version 2 adds explicit status-event actions (`apply`/`clear`) to the
// structured event wire shape. Mismatched peers must be rejected rather than
// interpreting those events ambiguously.
export const PVP_PROTOCOL_VERSION = 3;
const COMPRESSION_THRESHOLD_BYTES = 1024;
const MAX_WIRE_MESSAGE_CHARS = 512_000;
const MAX_DECOMPRESSED_BYTES = 512_000;
const MAX_DECK_CARDS = 60;
const MAX_PLAYER_NAME_CHARS = 48;
const ENERGY_TYPES = new Set<EnergyType>(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"]);
const CARD_IDS = new Set(Object.keys(cards));
const SIDE_IDS = new Set(["player", "opponent"]);
const AI_DIFFICULTIES = new Set(["easy", "normal", "hard"]);
const AI_DECK_STYLES = new Set(["blitz", "scaleBench", "stall", "balanced"]);
const SPECIAL_CONDITIONS = new Set(["asleep", "burned", "frozen", "paralysed", "poisoned"]);

export type PvpWireMessage =
  | { type: "hello"; version: number; sessionId: string; playerName: string; deckCardIds: string[]; energyTypes?: EnergyType[] }
  | { type: "helloAck"; version: number; sessionId: string }
  | { type: "sync"; version: number; sessionId: string; sequence: number; state: GameState; events?: GameEvent[]; eventCursor?: number; eventHistoryStart?: number }
  | { type: "intent"; version: number; sessionId: string; intent: PlayerIntent };

export async function encodePvpMessage(message: PvpWireMessage): Promise<string> {
  const raw = JSON.stringify(message);
  if (raw.length < COMPRESSION_THRESHOLD_BYTES) return raw;

  const compressed = await gzipUtf8(raw);
  if (!compressed) return raw;

  const encoded = `${COMPRESSED_MESSAGE_PREFIX}${bytesToBase64Url(compressed)}`;
  return encoded.length < raw.length ? encoded : raw;
}

export async function parsePvpMessage(raw: string): Promise<PvpWireMessage | null> {
  if (raw.length > MAX_WIRE_MESSAGE_CHARS) return null;
  try {
    const decoded = raw.startsWith(COMPRESSED_MESSAGE_PREFIX)
      ? await decodeCompressedMessage(raw)
      : raw;
    if (decoded.length > MAX_WIRE_MESSAGE_CHARS) return null;
    return parseRawPvpMessage(decoded);
  } catch {
    return null;
  }
}

function parseRawPvpMessage(raw: string): PvpWireMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const withType = parsed as { type?: unknown };
    switch (withType.type) {
      case "hello": return isHelloMessage(parsed) ? parsed : null;
      case "helloAck": return isExactHelloAck(parsed) ? parsed : null;
      case "sync": return isSyncMessage(parsed) ? parsed : null;
      case "intent": return isIntentMessage(parsed) ? parsed : null;
      default: return null;
    }
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, max = MAX_WIRE_MESSAGE_CHARS): value is string {
  return typeof value === "string" && value.length <= max;
}

function isInteger(value: unknown, min = 0, max = 10_000): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isEnergyTypes(value: unknown): value is EnergyType[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 3
    && value.every((type) => typeof type === "string" && ENERGY_TYPES.has(type as EnergyType))
    && new Set(value).size === value.length;
}

function isHelloMessage(value: unknown): value is Extract<PvpWireMessage, { type: "hello" }> {
  if (!isRecord(value) || value.type !== "hello" || !isProtocolVersion(value.version) || !isSessionId(value.sessionId) || !isBoundedString(value.playerName, MAX_PLAYER_NAME_CHARS)) return false;
  if (!Array.isArray(value.deckCardIds) || value.deckCardIds.length === 0 || value.deckCardIds.length > MAX_DECK_CARDS) return false;
  if (!value.deckCardIds.every((cardId) => isBoundedString(cardId, 128) && cardId.length > 0)) return false;
  return value.energyTypes === undefined || isEnergyTypes(value.energyTypes);
}

function isExactHelloAck(value: unknown): value is Extract<PvpWireMessage, { type: "helloAck" }> {
  return isRecord(value) && value.type === "helloAck" && Object.keys(value).length === 3 && isProtocolVersion(value.version) && isSessionId(value.sessionId);
}

// Sync state is produced by the host, but it still crosses an untrusted transport.
// Hidden card IDs are allowed only in redacted zones; engine actions remain the
// authority for semantic legality after this structural boundary.
function isSyncMessage(value: unknown): value is Extract<PvpWireMessage, { type: "sync" }> {
  if (!isRecord(value) || value.type !== "sync" || !isRecord(value.state)) return false;
  const state = value.state;
  if ((state.phase !== "setup" && state.phase !== "play") || !isRecord(state.sides)) return false;
  if (!isSideState(state.sides.player) || !isSideState(state.sides.opponent)) return false;
  return isProtocolVersion(value.version)
    && isSessionId(value.sessionId)
    && isInteger(value.sequence, 1, Number.MAX_SAFE_INTEGER)
    && (value.eventCursor === undefined || isInteger(value.eventCursor, 0, Number.MAX_SAFE_INTEGER))
    && (value.eventHistoryStart === undefined || isInteger(value.eventHistoryStart, 1, Number.MAX_SAFE_INTEGER))
    && (value.events === undefined || isGameEventArray(value.events))
    && isInteger(state.nextUmamusumeUid, 1)
    && typeof state.gameOver === "boolean"
    && (state.currentSide === "player" || state.currentSide === "opponent" || state.currentSide === "done")
    && isInteger(state.turnNumber, 0)
    && (state.firstPlayer === "player" || state.firstPlayer === "opponent")
    && (state.turnDeadlineMs === null || (typeof state.turnDeadlineMs === "number" && Number.isFinite(state.turnDeadlineMs)))
    && (state.opponentTurnStep === null || ["bench", "trainerBefore", "evolve", "attach", "trainerAfter", "attack", "finish"].includes(state.opponentTurnStep as string))
    && (state.stadium === null || isStadium(state.stadium))
    && (state.setup === null || isSetupState(state.setup))
    && (state.pendingPlayerChoice === null || isPendingChoice(state.pendingPlayerChoice))
    && AI_DIFFICULTIES.has(state.aiDifficulty as string)
    && isSideBooleanRecord(state.humanBySide)
    && isAiDeckStyleRecord(state.aiDeckStyleBySide)
    && (state.winner === null || SIDE_IDS.has(state.winner as string))
    && isSideIntegerRecord(state.turnsTakenBySide)
    && Array.isArray(state.log) && state.log.length <= 500 && state.log.every((line) => isBoundedString(line, 2_000))
    && (state.events === undefined || isGameEventArray(state.events))
    && (state.nextEventId === undefined || isInteger(state.nextEventId, 1))
    && (state.nextTransitionId === undefined || isInteger(state.nextTransitionId, 1));
}

function isGameEventArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 128) return false;
  let previousId = 0;
  return value.every((event) => {
    if (!isGameEvent(event) || event.id <= previousId) return false;
    previousId = event.id;
    return true;
  });
}

function isGameEvent(value: unknown): boolean {
  if (!isRecord(value) || !isInteger(value.id, 1) || !isInteger(value.transitionId, 1)) return false;
  if (value.visibility !== "public" && value.visibility !== "actor" && value.visibility !== "private") return false;
  if (value.kind === "attack") {
    return isSide(value.actorSide) && isSide(value.targetSide) && isInteger(value.actorUid, 1)
      && isInteger(value.targetUid, 1) && isBoundedString(value.attackName, 128)
      && isInteger(value.damage, 0, 10_000) && isInteger(value.hpBefore, 0, 10_000) && isInteger(value.hpAfter, 0, 10_000);
  }
  if (value.kind === "damage" || value.kind === "heal") {
    return (value.actorSide === undefined || isSide(value.actorSide)) && isSide(value.targetSide)
      && isInteger(value.targetUid, 1) && isInteger(value.amount, 0, 10_000)
      && isInteger(value.hpBefore, 0, 10_000) && isInteger(value.hpAfter, 0, 10_000);
  }
  if (value.kind === "knockout") {
    return isSide(value.scoringSide) && isSide(value.knockedSide) && isInteger(value.targetUid, 1)
      && isBoundedString(value.cardId, 128) && CARD_IDS.has(value.cardId)
      && isInteger(value.pointsAwarded, 1, 2) && isInteger(value.points, 1, 3)
      && (value.cause === undefined || isBoundedString(value.cause, 256));
  }
  if (value.kind === "score") return isSide(value.side) && isInteger(value.points, 1, 3);
  if (value.kind === "promotion") return isSide(value.side) && isInteger(value.targetUid, 1);
  if (value.kind === "coin") return isSide(value.side) && Array.isArray(value.results)
    && value.results.length > 0 && value.results.length <= 32
    && value.results.every((result) => result === "heads" || result === "tails");
  if (value.kind === "turn") return isSide(value.side) && isInteger(value.turnNumber, 0);
  if (value.kind === "cardMovement") return isSide(value.side)
    && ["deck", "hand", "discard", "play"].includes(value.from as string)
    && ["deck", "hand", "discard", "play"].includes(value.to as string)
    && isInteger(value.count, 1, MAX_DECK_CARDS)
    && (value.cardIds === undefined || isCardZone(value.cardIds, true));
  if (value.kind === "energy") return isSide(value.side) && isInteger(value.targetUid, 1)
    && ENERGY_TYPES.has(value.energyType as EnergyType)
    && isInteger(value.amount, -100, 100) && value.amount !== 0;
  if (value.kind === "evolution") return isSide(value.side) && isInteger(value.targetUid, 1)
    && isBoundedString(value.fromCardId, 128) && CARD_IDS.has(value.fromCardId)
    && isBoundedString(value.toCardId, 128) && CARD_IDS.has(value.toCardId);
  if (value.kind === "status") return isSide(value.side) && isInteger(value.targetUid, 1)
    && SPECIAL_CONDITIONS.has(value.condition as string)
    && (value.action === "apply" || value.action === "clear");
  if (value.kind === "tool") return isSide(value.side) && isInteger(value.targetUid, 1)
    && isBoundedString(value.toolCardId, 128) && CARD_IDS.has(value.toolCardId)
    && (value.action === "attach" || value.action === "discard");
  if (value.kind === "gameEnd") return isSide(value.winner)
    && ["points", "noBench", "surrender", "disconnect"].includes(value.reason as string);
  if (value.kind === "message") return isBoundedString(value.message, 2_000);
  return false;
}

function isSide(value: unknown): value is "player" | "opponent" {
  return value === "player" || value === "opponent";
}

function isSideState(value: unknown): boolean {
  return isRecord(value)
    && Array.isArray(value.deck) && Array.isArray(value.hand) && Array.isArray(value.discard)
    && value.deck.length <= MAX_DECK_CARDS && value.hand.length <= MAX_DECK_CARDS && value.discard.length <= MAX_DECK_CARDS
    && isCardZone(value.deck, true) && isCardZone(value.hand, true) && isCardZone(value.discard, false)
    && Array.isArray(value.bench) && value.bench.length <= 5
    && (value.id === "player" || value.id === "opponent")
    && isBoundedString(value.title, MAX_PLAYER_NAME_CHARS)
    && isEnergyArray(value.energyPool, MAX_DECK_CARDS)
    && isEnergyArray(value.energyZone, MAX_DECK_CARDS)
    && (value.active === null || isUmamusumeInstance(value.active))
    && value.bench.every(isUmamusumeInstance)
    && isInteger(value.points, 0, 3)
    && isInteger(value.energyAttachmentsThisTurn, 0, 10)
    && isInteger(value.bonusEnergyAttachments, 0, 10)
    && isInteger(value.retreatCostReduction, 0, 10)
    && isInteger(value.activeAttackDamageBonus, 0, 10_000)
    && typeof value.usedSupporterThisTurn === "boolean"
    && typeof value.usedRetreatThisTurn === "boolean"
    && typeof value.usedStadiumThisTurn === "boolean"
    && isBoundedStringArray(value.usedAbilityNamesThisTurn, 128, 128)
    && isBoundedStringArray(value.usedAbilityNamesThisGame, 256, 128)
    && isInteger(value.guaranteedCoinFlipHeads, 0, 10);
}

function isCardZone(value: unknown, allowHidden: boolean): boolean {
  return Array.isArray(value) && value.every((cardId) => isBoundedString(cardId, 128) && (CARD_IDS.has(cardId) || (allowHidden && cardId === "")));
}

function isEnergyArray(value: unknown, max: number): boolean {
  return Array.isArray(value) && value.length <= max && value.every((type) => typeof type === "string" && ENERGY_TYPES.has(type as EnergyType));
}

function isBoundedStringArray(value: unknown, maxItems: number, maxLength: number): boolean {
  return Array.isArray(value) && value.length <= maxItems && value.every((entry) => isBoundedString(entry, maxLength));
}

function isUmamusumeInstance(value: unknown): boolean {
  if (!isRecord(value) || !isInteger(value.uid, 1) || !isBoundedString(value.cardId, 128) || !CARD_IDS.has(value.cardId)) return false;
  return Array.isArray(value.evolutionCardIds) && isCardZone(value.evolutionCardIds, false)
    && isBoundedString(value.species, 128)
    && isInteger(value.stage, 0, 2)
    && isInteger(value.hp, 0, 10_000)
    && isInteger(value.maxHp, 1, 10_000)
    && isEnergyRecord(value.energies)
    && Array.isArray(value.specialConditions) && value.specialConditions.length <= SPECIAL_CONDITIONS.size
      && value.specialConditions.every((condition) => typeof condition === "string" && SPECIAL_CONDITIONS.has(condition))
    && isInteger(value.enteredTurn, 0)
    && (value.evolvedTurn === null || isInteger(value.evolvedTurn, 0))
    && typeof value.tookDamageLastTurn === "boolean" && typeof value.tookDamageThisTurn === "boolean"
    && isInteger(value.nextTurnDamageReduction, 0, 10_000)
    && typeof value.usedAbilityThisTurn === "boolean"
    && (value.attackBlockedUntilOwnTurn === null || isInteger(value.attackBlockedUntilOwnTurn, 0))
    && (value.paralysedUntilOwnTurn === null || isInteger(value.paralysedUntilOwnTurn, 0))
    && (value.toolCardId === null || (isBoundedString(value.toolCardId, 128) && CARD_IDS.has(value.toolCardId)));
}

function isEnergyRecord(value: unknown): boolean {
  return isRecord(value) && [...ENERGY_TYPES].every((type) => isInteger(value[type], 0, 100));
}

function isSideBooleanRecord(value: unknown): boolean {
  return isRecord(value) && typeof value.player === "boolean" && typeof value.opponent === "boolean";
}

function isSideIntegerRecord(value: unknown): boolean {
  return isRecord(value) && isInteger(value.player, 0) && isInteger(value.opponent, 0);
}

function isAiDeckStyleRecord(value: unknown): boolean {
  return isRecord(value) && typeof value.player === "string" && typeof value.opponent === "string"
    && AI_DECK_STYLES.has(value.player) && AI_DECK_STYLES.has(value.opponent);
}

function isStadium(value: unknown): boolean {
  return isRecord(value) && isBoundedString(value.cardId, 128) && CARD_IDS.has(value.cardId) && SIDE_IDS.has(value.owner as string);
}

function isSetupState(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.openingHands) || !isRecord(value.readyBySide)) return false;
  return (value.coinChoice === null || value.coinChoice === "heads" || value.coinChoice === "tails")
    && (value.coinFlipResult === null || value.coinFlipResult === "heads" || value.coinFlipResult === "tails")
    && isCardZone(value.openingHands.player, true) && isCardZone(value.openingHands.opponent, true)
    && typeof value.openingHandsDealt === "boolean"
    && typeof value.readyBySide.player === "boolean" && typeof value.readyBySide.opponent === "boolean"
    && typeof value.opponentRevealed === "boolean"
    && (value.countdownSecondsRemaining === null || isInteger(value.countdownSecondsRemaining, 0, 60));
}

function isPendingChoice(value: unknown): boolean {
  if (!isRecord(value) || !SIDE_IDS.has(value.sideId as string)) return false;
  if (value.kind === "promoteAfterKnockout") return value.resume === "finishOpponentTurn" || value.resume === "none";
  if (value.kind === "switchAfterGust") return value.resume === "resumeOpponentAfterFirstTrainerPass" || value.resume === "resumeOpponentAfterSecondTrainerPass" || value.resume === "none";
  return false;
}

function isIntentMessage(value: unknown): value is Extract<PvpWireMessage, { type: "intent" }> {
  if (!isRecord(value) || value.type !== "intent" || !isProtocolVersion(value.version) || !isSessionId(value.sessionId) || !isRecord(value.intent) || typeof value.intent.type !== "string") return false;
  const intent = value.intent;
  const optionalIndex = (key: string) => intent[key] === undefined || isInteger(intent[key]);
  switch (intent.type) {
    case "endTurn": case "useStadium": case "surrender":
      return Object.keys(intent).length === 1;
    case "playHandCard": return isInteger(intent.handIndex) && (intent.choices === undefined || isRecord(intent.choices));
    case "attachEnergy": return optionalIndex("umamusumeUid");
    case "attack": return ["attackTargetUid", "healTargetUid", "evolutionDeckCardIndex", "evolutionHandCardIndex", "attackIndex", "discardHandIndex", "randomDiscardIndex", "switchTargetUid"].every(optionalIndex)
      && (intent.useShuffleSelfIntoDeck === undefined || typeof intent.useShuffleSelfIntoDeck === "boolean");
    case "retreat": return optionalIndex("benchUmamusumeUid") && (intent.discardEnergyTypes === undefined || isEnergyTypes(intent.discardEnergyTypes));
    case "resolvePendingChoice": return isInteger(intent.umamusumeUid);
    case "completeSetup": return isInteger(intent.activeHandIndex) && Array.isArray(intent.benchHandIndexes)
      && intent.benchHandIndexes.length <= 5 && intent.benchHandIndexes.every((index) => isInteger(index));
    case "useAbility": return isInteger(intent.abilityUmamusumeUid) && isInteger(intent.sourceUmamusumeUid)
      && ["discardHandIndex", "opponentTargetUmamusumeUid"].every(optionalIndex)
      && (intent.selectedEnergyType === undefined || ENERGY_TYPES.has(intent.selectedEnergyType as EnergyType));
    default: return false;
  }
}

function isSessionId(value: unknown): value is string {
  return isBoundedString(value, 128) && value.length >= 8;
}

function isProtocolVersion(value: unknown): value is number {
  return value === PVP_PROTOCOL_VERSION;
}

async function decodeCompressedMessage(raw: string): Promise<string> {
  const bytes = base64UrlToBytes(raw.slice(COMPRESSED_MESSAGE_PREFIX.length));
  const inflated = await gunzip(bytes);
  if (!inflated) throw new Error("This browser cannot decode compressed PvP messages.");
  return new TextDecoder().decode(inflated);
}

async function gzipUtf8(text: string): Promise<Uint8Array | null> {
  const CompressionStreamCtor = (globalThis as { CompressionStream?: new (format: "gzip") => TransformStream<Uint8Array, Uint8Array> }).CompressionStream;
  if (!CompressionStreamCtor) return null;

  const source = new Blob([new TextEncoder().encode(text)]).stream();
  const compressedStream = source.pipeThrough(new CompressionStreamCtor("gzip"));
  const buffer = await new Response(compressedStream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  const DecompressionStreamCtor = (globalThis as { DecompressionStream?: new (format: "gzip") => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!DecompressionStreamCtor) return null;

  const source = new Blob([new Uint8Array(bytes)]).stream();
  const decompressedStream = source.pipeThrough(new DecompressionStreamCtor("gzip"));
  return readBytesWithinLimit(decompressedStream, MAX_DECOMPRESSED_BYTES);
}

async function readBytesWithinLimit(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("Decompressed PvP payload exceeds the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
