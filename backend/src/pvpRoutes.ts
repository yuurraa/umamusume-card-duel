import { randomInt } from "node:crypto";
import { Router } from "express";

const PVP_SESSION_TTL_MS = 15 * 60 * 1000;
const PVP_SIGNAL_MAX_LENGTH = 64_000;
const PVP_CANDIDATE_MAX_COUNT = 256;
const PVP_CANDIDATE_MAX_LENGTH = 1024;

const pvpSessions = new Map<string, PvpSession>();
const pvpIceServers = readPvpIceServersFromEnv();

export function createPvpRouter(): Router {
  const router = Router();

  router.get("/ice-servers", (_request, response) => {
    response.json({ iceServers: pvpIceServers, iceTransportPolicy: readPvpIceTransportPolicyFromEnv() });
  });

  router.post("/sessions", (request, response) => {
    pruneExpiredPvpSessions();
    const offer = typeof request.body?.offer === "string" ? request.body.offer.trim() : "";
    if (!offer) {
      response.status(400).json({ error: "Offer is required." });
      return;
    }
    if (offer.length > PVP_SIGNAL_MAX_LENGTH) {
      response.status(413).json({ error: "Offer is too large." });
      return;
    }
    const code = createPvpCode();
    const now = Date.now();
    const expiresAt = new Date(now + PVP_SESSION_TTL_MS).toISOString();
    pvpSessions.set(code, { code, offer, answer: null, createdAt: now, expiresAt, hostCandidates: [], guestCandidates: [] });
    response.status(201).json({ code, expiresAt });
  });

  router.get("/sessions/:code/offer", (request, response) => {
    pruneExpiredPvpSessions();
    const session = readPvpSession(request.params.code);
    if (!session) {
      response.status(404).json({ error: "Session not found or expired." });
      return;
    }
    response.json({ offer: session.offer, expiresAt: session.expiresAt });
  });

  router.post("/sessions/:code/answer", (request, response) => {
    pruneExpiredPvpSessions();
    const session = readPvpSession(request.params.code);
    if (!session) {
      response.status(404).json({ error: "Session not found or expired." });
      return;
    }
    const answer = typeof request.body?.answer === "string" ? request.body.answer.trim() : "";
    if (!answer) {
      response.status(400).json({ error: "Answer is required." });
      return;
    }
    if (answer.length > PVP_SIGNAL_MAX_LENGTH) {
      response.status(413).json({ error: "Answer is too large." });
      return;
    }
    if (session.answer) {
      response.status(409).json({ error: "Answer has already been submitted." });
      return;
    }
    session.answer = answer;
    response.json({ answer, expiresAt: session.expiresAt });
  });

  router.get("/sessions/:code/answer", (request, response) => {
    pruneExpiredPvpSessions();
    const session = readPvpSession(request.params.code);
    if (!session) {
      response.status(404).json({ error: "Session not found or expired." });
      return;
    }
    if (!session.answer) {
      response.status(202).json({ pending: true, expiresAt: session.expiresAt });
      return;
    }
    response.json({ answer: session.answer, expiresAt: session.expiresAt });
  });

  router.post("/sessions/:code/candidates", (request, response) => {
    pruneExpiredPvpSessions();
    const session = readPvpSession(request.params.code);
    if (!session) {
      response.status(404).json({ error: "Session not found or expired." });
      return;
    }
    const role = typeof request.body?.role === "string" ? request.body.role.trim().toLowerCase() : "";
    if (role !== "host" && role !== "guest") {
      response.status(400).json({ error: "Role must be host or guest." });
      return;
    }
    const incoming = Array.isArray(request.body?.candidates) ? request.body.candidates : [];
    const valid = incoming.filter(isValidIceCandidatePayload);
    const target = role === "host" ? session.hostCandidates : session.guestCandidates;
    const remaining = Math.max(0, PVP_CANDIDATE_MAX_COUNT - target.length);
    const accepted = remaining > 0 ? valid.slice(0, remaining) : [];
    if (accepted.length > 0) target.push(...accepted);
    response.json({ ok: true, accepted: accepted.length, expiresAt: session.expiresAt });
  });

  router.get("/sessions/:code/candidates", (request, response) => {
    pruneExpiredPvpSessions();
    const session = readPvpSession(request.params.code);
    if (!session) {
      response.status(404).json({ error: "Session not found or expired." });
      return;
    }
    const role = typeof request.query?.role === "string" ? request.query.role.trim().toLowerCase() : "";
    if (role !== "host" && role !== "guest") {
      response.status(400).json({ error: "Role must be host or guest." });
      return;
    }
    const rawSince = typeof request.query?.since === "string" ? Number(request.query.since) : 0;
    const since = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0;
    const source = role === "host" ? session.guestCandidates : session.hostCandidates;
    const candidates = source.slice(Math.min(since, source.length));
    response.json({ candidates, nextSince: source.length, expiresAt: session.expiresAt });
  });

  return router;
}

type PvpSession = {
  code: string;
  offer: string;
  answer: string | null;
  createdAt: number;
  expiresAt: string;
  hostCandidates: IceCandidatePayload[];
  guestCandidates: IceCandidatePayload[];
};

type PublicIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};
type PublicIceTransportPolicy = "all" | "relay";

type IceCandidatePayload = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

function readPvpIceServersFromEnv(): PublicIceServer[] {
  const iceServers: PublicIceServer[] = [];
  const stunUrls = readCsvEnv("PVP_STUN_URLS");
  iceServers.push({ urls: stunUrls.length > 0 ? stunUrls : "stun:stun.l.google.com:19302" });

  const turnUrls = readCsvEnv("PVP_TURN_URLS");
  if (turnUrls.length === 0) return iceServers;

  const username = process.env.PVP_TURN_USERNAME?.trim();
  const credential = process.env.PVP_TURN_CREDENTIAL?.trim();
  if (!username || !credential) {
    console.warn("PVP_TURN_URLS is set, but PVP_TURN_USERNAME or PVP_TURN_CREDENTIAL is missing. TURN will not be advertised.");
    return iceServers;
  }

  iceServers.push({ urls: turnUrls, username, credential });
  return iceServers;
}

function readCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readPvpIceTransportPolicyFromEnv(): PublicIceTransportPolicy | undefined {
  const policy = process.env.PVP_ICE_TRANSPORT_POLICY?.trim().toLowerCase();
  return policy === "relay" || policy === "all" ? policy : undefined;
}

function createPvpCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempts = 0; attempts < 32; attempts += 1) {
    let code = "";
    for (let index = 0; index < length; index += 1) {
      const randomIndex = randomInt(alphabet.length);
      code += alphabet[randomIndex] ?? "A";
    }
    if (!pvpSessions.has(code)) return code;
  }
  throw new Error("Unable to allocate a PvP code. Please try again.");
}

function readPvpSession(rawCode: string | undefined): PvpSession | null {
  const code = normalizePvpCode(rawCode);
  if (!code) return null;
  const session = pvpSessions.get(code);
  return session ?? null;
}

function normalizePvpCode(code: string | undefined): string {
  return (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function pruneExpiredPvpSessions(): void {
  const now = Date.now();
  for (const [code, session] of pvpSessions.entries()) {
    if (session.createdAt + PVP_SESSION_TTL_MS > now) continue;
    pvpSessions.delete(code);
  }
}

function isValidIceCandidatePayload(value: unknown): value is IceCandidatePayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.candidate !== "string" || record.candidate.length === 0 || record.candidate.length > PVP_CANDIDATE_MAX_LENGTH) return false;
  if (record.sdpMid !== undefined && record.sdpMid !== null && typeof record.sdpMid !== "string") return false;
  if (record.sdpMLineIndex !== undefined && record.sdpMLineIndex !== null && typeof record.sdpMLineIndex !== "number") return false;
  if (record.usernameFragment !== undefined && record.usernameFragment !== null && typeof record.usernameFragment !== "string") return false;
  return true;
}
