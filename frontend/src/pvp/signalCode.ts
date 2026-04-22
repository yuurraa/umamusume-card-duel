const CODE_PREFIX_GZIP = "UCD1";
const CODE_PREFIX_RAW = "UCD0";

export async function encodeSignalToCode(signalJson: string): Promise<string> {
  const compressed = await gzipUtf8(signalJson);
  if (compressed) return `${CODE_PREFIX_GZIP}.${bytesToBase64Url(compressed)}`;
  return `${CODE_PREFIX_RAW}.${bytesToBase64Url(new TextEncoder().encode(signalJson))}`;
}

export async function decodeSignalFromCode(input: string): Promise<string> {
  const trimmed = input.trim();
  if (looksLikeRawSignal(trimmed)) return trimmed;

  const [prefix, encoded] = trimmed.split(".", 2);
  if (!prefix || !encoded) throw new Error("Invite code format is invalid.");
  const bytes = base64UrlToBytes(encoded);

  if (prefix === CODE_PREFIX_GZIP) {
    const inflated = await gunzip(bytes);
    if (!inflated) throw new Error("This browser cannot decode compressed invite code.");
    return new TextDecoder().decode(inflated);
  }

  if (prefix === CODE_PREFIX_RAW) {
    return new TextDecoder().decode(bytes);
  }

  throw new Error("Unknown invite code prefix.");
}

function looksLikeRawSignal(input: string): boolean {
  if (!input.startsWith("{")) return false;
  return input.includes('"type"') && input.includes('"sdp"');
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

  const normalizedBytes = new Uint8Array(bytes);
  const source = new Blob([normalizedBytes]).stream();
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
