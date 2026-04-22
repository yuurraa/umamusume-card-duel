import { parsePvpMessage, type PvpWireMessage } from "./protocol";

export type PeerStatus = "idle" | "creatingOffer" | "awaitingAnswer" | "joining" | "connecting" | "connected" | "failed" | "closed";

type PeerRuntimeOptions = {
  onStatus: (status: PeerStatus, detail: string) => void;
  onMessage: (message: PvpWireMessage) => void;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
const ICE_GATHERING_TIMEOUT_MS = 6000;

export class PeerRuntime {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  constructor(private readonly options: PeerRuntimeOptions) {}

  async hostCreateOffer(): Promise<string> {
    this.close();
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

    this.options.onStatus("awaitingAnswer", "Offer ready.");
    return JSON.stringify(pc.localDescription);
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

    this.options.onStatus("connecting", "Joining host...");
    return JSON.stringify(pc.localDescription);
  }

  send(message: PvpWireMessage): void {
    if (!this.channel || this.channel.readyState !== "open") return;
    this.channel.send(JSON.stringify(message));
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
    const pc = new RTCPeerConnection(RTC_CONFIG);
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
      const message = parsePvpMessage(String(event.data));
      if (!message) return;
      this.options.onMessage(message);
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

  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }, ICE_GATHERING_TIMEOUT_MS);
      const onStateChange = () => {
        if (pc.iceGatheringState !== "complete") return;
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        window.clearTimeout(timeoutId);
        resolve();
      };
      pc.addEventListener("icegatheringstatechange", onStateChange);
    });
  }
}
