import type { EnergyType, GameState } from "../../../shared/src/types";
import type { PlayerIntent } from "./playerIntent";

const COMPRESSED_MESSAGE_PREFIX = "UCDM1.";
const COMPRESSION_THRESHOLD_BYTES = 1024;
const MAX_WIRE_MESSAGE_CHARS = 512_000;

export type PvpWireMessage =
  | { type: "hello"; playerName: string; deckCardIds: string[]; energyTypes?: EnergyType[] }
  | { type: "helloAck" }
  | { type: "sync"; state: GameState }
  | { type: "intent"; intent: PlayerIntent };

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
    if (withType.type !== "hello" && withType.type !== "helloAck" && withType.type !== "sync" && withType.type !== "intent") return null;
    return parsed as PvpWireMessage;
  } catch {
    return null;
  }
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
  const buffer = await new Response(decompressedStream).arrayBuffer();
  return new Uint8Array(buffer);
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
