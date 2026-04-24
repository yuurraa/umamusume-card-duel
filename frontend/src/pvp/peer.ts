import { encodePvpMessage, parsePvpMessage, type PvpWireMessage } from "./protocol";

export type PeerStatus = "idle" | "creatingOffer" | "awaitingAnswer" | "joining" | "connecting" | "connected" | "failed" | "closed";

type PeerRuntimeOptions = {
  rtcConfig: RTCConfiguration;
  onStatus: (status: PeerStatus, detail: string) => void;
  onMessage: (message: PvpWireMessage) => void;
};

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
export const DEFAULT_RTC_CONFIG: RTCConfiguration = { iceServers: DEFAULT_ICE_SERVERS };
const ICE_GATHERING_TIMEOUT_MS = 30000;
const RELAY_CANDIDATE_GRACE_MS = 2500;

export class PeerRuntime {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private hasRelayCandidate = false;
  private gatheredCandidateLines: string[] = [];
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: PeerRuntimeOptions) {}

  async hostCreateOffer(): Promise<string> {
    this.close();
    this.hasRelayCandidate = false;
    this.gatheredCandidateLines = [];
    this.options.onStatus("creatingOffer", "Creating offer...");
    const pc = this.createPeerConnection();
    const channel = pc.createDataChannel("game", { ordered: true });
    this.attachChannel(channel);
    this.channel = channel;
    this.pc = pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(pc);
    if (!pc.localDescription) throw new Error("Missing local description.");
    this.assertRelayCandidateIfRequired();

    this.options.onStatus("awaitingAnswer", "Offer ready.");
    return this.serializeLocalDescription(pc.localDescription);
  }

  async hostAcceptAnswer(answerText: string): Promise<void> {
    const pc = this.pc;
    if (!pc) throw new Error("Peer connection is not ready.");
    const answer = this.parseSignal(answerText, "answer");
    await pc.setRemoteDescription(answer);
    this.options.onStatus("connecting", "Answer accepted. Establishing connection...");
  }

  async joinWithOffer(offerText: string): Promise<string> {
    this.close();
    this.hasRelayCandidate = false;
    this.gatheredCandidateLines = [];
    this.options.onStatus("joining", "Joining host...");
    const pc = this.createPeerConnection();
    pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
      this.channel = event.channel;
    };
    this.pc = pc;

    const offer = this.parseSignal(offerText, "offer");
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIceGatheringComplete(pc);
    if (!pc.localDescription) throw new Error("Missing local description.");
    this.assertRelayCandidateIfRequired();

    this.options.onStatus("connecting", "Joining host...");
    return this.serializeLocalDescription(pc.localDescription);
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
    this.options.onStatus("closed", "Connection closed.");
  }

  isConnected(): boolean {
    return this.channel?.readyState === "open";
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.options.rtcConfig);
    pc.onicecandidate = (event) => {
      const candidateLine = event.candidate?.candidate;
      if (!candidateLine) return;
      if (!this.gatheredCandidateLines.includes(candidateLine)) {
        this.gatheredCandidateLines.push(candidateLine);
      }
      if (candidateLine.includes(" typ relay ")) {
        this.hasRelayCandidate = true;
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

  private serializeLocalDescription(description: RTCSessionDescription): string {
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
      const timeoutId = window.setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }, ICE_GATHERING_TIMEOUT_MS);
      const onStateChange = () => {
        if (pc.iceGatheringState !== "complete") return;
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        window.clearTimeout(timeoutId);
        void this.waitForRelayGraceIfNeeded().then(resolve);
      };
      pc.addEventListener("icegatheringstatechange", onStateChange);
    });
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
}

function hasTurnUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
}
