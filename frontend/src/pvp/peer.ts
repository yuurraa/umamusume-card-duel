import { encodePvpMessage, parsePvpMessage, type PvpWireMessage } from "./protocol";

export type PeerStatus = "idle" | "creatingOffer" | "awaitingAnswer" | "joining" | "connecting" | "connected" | "failed" | "closed";

type PeerRuntimeOptions = {
  rtcConfig: RTCConfiguration;
  onStatus: (status: PeerStatus, detail: string) => void;
  onMessage: (message: PvpWireMessage) => void;
  onLocalCandidate?: (candidate: RTCIceCandidateInit) => void;
};

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
export const DEFAULT_RTC_CONFIG: RTCConfiguration = { iceServers: DEFAULT_ICE_SERVERS };
const ICE_GATHERING_TIMEOUT_MS = 8000;
const RELAY_CANDIDATE_GRACE_MS = 2500;
const NON_RELAY_CANDIDATE_GRACE_MS = 1500;

export class PeerRuntime {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private hasRelayCandidate = false;
  private hasNonRelayCandidate = false;
  private gatheredCandidateLines: string[] = [];
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: PeerRuntimeOptions) {}

  async hostCreateOffer(options: { trickle?: boolean } = {}): Promise<string> {
    this.close();
    this.hasRelayCandidate = false;
    this.hasNonRelayCandidate = false;
    this.gatheredCandidateLines = [];
    this.pendingRemoteCandidates = [];
    this.options.onStatus("creatingOffer", "Creating offer...");
    const pc = this.createPeerConnection();
    const channel = pc.createDataChannel("game", { ordered: true });
    this.attachChannel(channel);
    this.channel = channel;
    this.pc = pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!options.trickle) {
      await this.waitForIceGatheringComplete(pc);
    }
    if (!pc.localDescription) throw new Error("Missing local description.");
    if (!options.trickle) {
      this.assertRelayCandidateIfRequired();
    }

    this.options.onStatus("awaitingAnswer", "Offer ready.");
    return this.serializeLocalDescription(pc.localDescription, !options.trickle);
  }

  async hostAcceptAnswer(answerText: string): Promise<void> {
    const pc = this.pc;
    if (!pc) throw new Error("Peer connection is not ready.");
    const answer = this.parseSignal(answerText, "answer");
    await pc.setRemoteDescription(answer);
    await this.flushPendingRemoteCandidates();
    this.options.onStatus("connecting", "Answer accepted. Establishing connection...");
  }

  async joinWithOffer(offerText: string, options: { trickle?: boolean } = {}): Promise<string> {
    this.close();
    this.hasRelayCandidate = false;
    this.hasNonRelayCandidate = false;
    this.gatheredCandidateLines = [];
    this.pendingRemoteCandidates = [];
    this.options.onStatus("joining", "Joining host...");
    const pc = this.createPeerConnection();
    pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
      this.channel = event.channel;
    };
    this.pc = pc;

    const offer = this.parseSignal(offerText, "offer");
    await pc.setRemoteDescription(offer);
    await this.flushPendingRemoteCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (!options.trickle) {
      await this.waitForIceGatheringComplete(pc);
    }
    if (!pc.localDescription) throw new Error("Missing local description.");
    if (!options.trickle) {
      this.assertRelayCandidateIfRequired();
    }

    this.options.onStatus("connecting", "Joining host...");
    return this.serializeLocalDescription(pc.localDescription, !options.trickle);
  }

  send(message: PvpWireMessage): void {
    if (!this.channel || this.channel.readyState !== "open") return;
    const channel = this.channel;
    this.sendQueue = this.sendQueue
      .then(async () => {
        if (channel.readyState !== "open") return;
        channel.send(await encodePvpMessage(message));
      })
      .catch(() => {
        this.options.onStatus("failed", "Data channel send failed.");
      });
  }

  close(): void {
    if (this.channel) {
      this.channel.onopen = null;
      this.channel.onclose = null;
      this.channel.onmessage = null;
      this.channel.onerror = null;
      this.channel.close();
      this.channel = null;
    }
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.pendingRemoteCandidates = [];
    this.options.onStatus("closed", "Connection closed.");
  }

  isConnected(): boolean {
    return this.channel?.readyState === "open";
  }

  async addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if (!pc.remoteDescription) {
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // Ignore transient ICE candidate errors from timing or duplicates.
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.options.rtcConfig);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateInit: RTCIceCandidateInit = { candidate: event.candidate.candidate };
        if (event.candidate.sdpMid !== null) candidateInit.sdpMid = event.candidate.sdpMid;
        if (event.candidate.sdpMLineIndex !== null) candidateInit.sdpMLineIndex = event.candidate.sdpMLineIndex;
        if (event.candidate.usernameFragment !== null) candidateInit.usernameFragment = event.candidate.usernameFragment;
        this.options.onLocalCandidate?.(candidateInit);
      }
      const candidateLine = event.candidate?.candidate;
      if (!candidateLine) return;
      if (!this.gatheredCandidateLines.includes(candidateLine)) {
        this.gatheredCandidateLines.push(candidateLine);
      }
      if (candidateLine.includes(" typ relay ")) {
        this.hasRelayCandidate = true;
      } else if (candidateLine.includes(" typ host ") || candidateLine.includes(" typ srflx ") || candidateLine.includes(" typ prflx ")) {
        this.hasNonRelayCandidate = true;
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") this.options.onStatus("connected", "Connected.");
      if (state === "failed") this.options.onStatus("failed", "Connection failed.");
      if (state === "disconnected") this.options.onStatus("failed", "Connection lost.");
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        this.options.onStatus("failed", "ICE failed. Try reconnecting.");
      }
    };
    return pc;
  }

  private attachChannel(channel: RTCDataChannel): void {
    channel.onopen = () => this.options.onStatus("connected", "Connected.");
    channel.onclose = () => this.options.onStatus("closed", "Data channel closed.");
    channel.onerror = () => this.options.onStatus("failed", "Data channel error.");
    channel.onmessage = (event) => {
      void parsePvpMessage(String(event.data)).then((message) => {
        if (!message) return;
        this.options.onMessage(message);
      });
    };
  }

  private parseSignal(signalText: string, expectedType: "offer" | "answer"): RTCSessionDescriptionInit {
    let parsed: unknown;
    try {
      parsed = JSON.parse(signalText);
    } catch {
      throw new Error("Signal text is not valid JSON.");
    }
    if (!parsed || typeof parsed !== "object") throw new Error("Signal payload is invalid.");
    const payload = parsed as { type?: unknown; sdp?: unknown };
    if (payload.type !== expectedType || typeof payload.sdp !== "string") {
      throw new Error(`Expected a valid ${expectedType} payload.`);
    }
    return { type: expectedType, sdp: payload.sdp };
  }

  private serializeLocalDescription(description: RTCSessionDescription, includeCandidates = true): string {
    if (!includeCandidates) {
      return JSON.stringify({ type: description.type, sdp: description.sdp });
    }
    let sdp = description.sdp;
    if (sdp.includes("\r\na=candidate:") || sdp.startsWith("a=candidate:")) {
      return JSON.stringify({ type: description.type, sdp });
    }
    for (const candidateLine of this.gatheredCandidateLines) {
      const attributeLine = `a=${candidateLine}`;
      if (sdp.includes(attributeLine)) continue;
      sdp = `${sdp}${sdp.endsWith("\r\n") ? "" : "\r\n"}${attributeLine}\r\n`;
    }
    return JSON.stringify({ type: description.type, sdp });
  }

  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return this.waitForRelayGraceIfNeeded();
    return new Promise((resolve) => {
      let resolved = false;
      let nonRelayTimeoutId: number | null = null;
      const timeoutId = window.setTimeout(() => finalizeResolve(), ICE_GATHERING_TIMEOUT_MS);

      const onStateChange = () => {
        if (pc.iceGatheringState !== "complete") return;
        finalizeResolve();
      };

      const onCandidate = () => {
        if (!this.shouldEarlyResolveForNonRelay()) return;
        if (nonRelayTimeoutId !== null) return;
        nonRelayTimeoutId = window.setTimeout(() => finalizeResolve(), NON_RELAY_CANDIDATE_GRACE_MS);
      };

      const finalizeResolve = () => {
        if (resolved) return;
        resolved = true;
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        pc.removeEventListener("icecandidate", onCandidate);
        window.clearTimeout(timeoutId);
        if (nonRelayTimeoutId !== null) window.clearTimeout(nonRelayTimeoutId);
        void this.waitForRelayGraceIfNeeded().then(resolve);
      };

      pc.addEventListener("icegatheringstatechange", onStateChange);
      pc.addEventListener("icecandidate", onCandidate);
    });
  }

  private shouldEarlyResolveForNonRelay(): boolean {
    if (!this.hasNonRelayCandidate) return false;
    if (this.options.rtcConfig.iceTransportPolicy === "relay") return false;
    if (!this.options.rtcConfig.iceServers?.some(hasTurnUrl)) return false;
    return !this.hasRelayCandidate;
  }

  private waitForRelayGraceIfNeeded(): Promise<void> {
    if (this.hasRelayCandidate || !this.options.rtcConfig.iceServers?.some(hasTurnUrl)) return Promise.resolve();
    return new Promise((resolve) => window.setTimeout(resolve, RELAY_CANDIDATE_GRACE_MS));
  }

  private assertRelayCandidateIfRequired(): void {
    if (this.options.rtcConfig.iceTransportPolicy !== "relay") return;
    const descriptionSdp = this.pc?.localDescription?.sdp ?? "";
    const sdpHasRelay = descriptionSdp.includes(" typ relay ");
    if (this.hasRelayCandidate || sdpHasRelay) return;
    throw new Error("TURN relay candidate was not available. Check the TURN URLs, credentials, and whether this network allows TURN/TLS.");
  }

  private async flushPendingRemoteCandidates(): Promise<void> {
    if (this.pendingRemoteCandidates.length === 0) return;
    const candidates = this.pendingRemoteCandidates.slice();
    this.pendingRemoteCandidates = [];
    for (const candidate of candidates) {
      await this.addRemoteCandidate(candidate);
    }
  }
}

function hasTurnUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
}
