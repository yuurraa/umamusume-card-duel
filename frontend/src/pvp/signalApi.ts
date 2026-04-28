type CreateSessionResponse = { code: string; expiresAt: string };
type OfferResponse = { offer: string; expiresAt: string };
type AnswerResponse = { answer: string; expiresAt: string };
type PendingAnswerResponse = { pending: true; expiresAt: string };
type IceServersResponse = { iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy };
type SubmitCandidatesResponse = { ok: true; accepted: number; expiresAt: string };
type CandidatesResponse = { candidates: RTCIceCandidateInit[]; nextSince: number; expiresAt: string };
type ErrorResponse = { error?: string };

export async function createPvpSession(offer: string, baseUrl = ""): Promise<CreateSessionResponse> {
  const response = await fetch(`${baseUrl}/api/pvp/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offer }),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as CreateSessionResponse;
}

export async function getPvpOffer(code: string, baseUrl = ""): Promise<OfferResponse> {
  const response = await fetch(`${baseUrl}/api/pvp/sessions/${encodeURIComponent(code)}/offer`);
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as OfferResponse;
}

export async function submitPvpAnswer(code: string, answer: string, baseUrl = ""): Promise<AnswerResponse> {
  const response = await fetch(`${baseUrl}/api/pvp/sessions/${encodeURIComponent(code)}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AnswerResponse;
}

export async function submitPvpCandidates(
  code: string,
  role: "host" | "guest",
  candidates: RTCIceCandidateInit[],
  baseUrl = "",
): Promise<SubmitCandidatesResponse> {
  const response = await fetch(`${baseUrl}/api/pvp/sessions/${encodeURIComponent(code)}/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, candidates }),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as SubmitCandidatesResponse;
}

export async function getPvpCandidates(
  code: string,
  role: "host" | "guest",
  since = 0,
  baseUrl = "",
): Promise<CandidatesResponse> {
  const params = new URLSearchParams({ role, since: String(Math.max(0, since)) });
  const response = await fetch(`${baseUrl}/api/pvp/sessions/${encodeURIComponent(code)}/candidates?${params.toString()}`);
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as CandidatesResponse;
}

export async function getPvpAnswer(code: string, baseUrl = ""): Promise<string | null> {
  const response = await fetch(`${baseUrl}/api/pvp/sessions/${encodeURIComponent(code)}/answer`);
  if (response.status === 202) {
    const payload = (await response.json()) as PendingAnswerResponse;
    if (payload.pending) return null;
  }
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as AnswerResponse;
  return payload.answer;
}

export async function getPvpRtcConfig(baseUrl = ""): Promise<RTCConfiguration> {
  const response = await fetch(`${baseUrl}/api/pvp/ice-servers`);
  if (!response.ok) throw await parseError(response);
  const payload = (await response.json()) as IceServersResponse;
  const config: RTCConfiguration = {
    iceServers: Array.isArray(payload.iceServers) ? payload.iceServers : [],
  };
  if (payload.iceTransportPolicy === "relay" || payload.iceTransportPolicy === "all") {
    config.iceTransportPolicy = payload.iceTransportPolicy;
  }
  return config;
}

async function parseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as ErrorResponse;
    if (payload.error) return new Error(payload.error);
  } catch {
    // ignore parse failure
  }
  return new Error(`Request failed (${response.status}): ${response.statusText}`);
}
