import { afterEach, describe, expect, it, vi } from "vitest";
import { PeerRuntime } from "./peer";

const relayCandidate = "candidate:1 1 UDP 92217343 203.0.113.1 3478 typ relay raddr 0.0.0.0 rport 0";

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

  createDataChannel(): RTCDataChannel {
    return {
      readyState: "connecting",
      close: vi.fn(),
    } as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0\r\n" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "v=0\r\n" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    this.onicecandidate?.({
      candidate: {
        candidate: relayCandidate,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: "fixture",
      } as RTCIceCandidate,
    } as RTCPeerConnectionIceEvent);
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

function createRuntime(): PeerRuntime {
  return new PeerRuntime({
    rtcConfig: {
      iceServers: [{ urls: "turn:turn.example.test:3478", username: "user", credential: "credential" }],
    },
    onStatus: vi.fn(),
    onMessage: vi.fn(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initial ICE signaling", () => {
  it("embeds gathered candidates in a non-trickle offer", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);

    const serialized = await createRuntime().hostCreateOffer();

    expect(JSON.parse(serialized).sdp).toContain(`a=${relayCandidate}`);
  });

  it("embeds gathered candidates in a non-trickle answer", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);

    const serialized = await createRuntime().joinWithOffer(JSON.stringify({ type: "offer", sdp: "v=0\r\n" }));

    expect(JSON.parse(serialized).sdp).toContain(`a=${relayCandidate}`);
  });
});
