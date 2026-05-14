import { DEFAULT_ICE_SERVERS } from "../../pvp/peer";
import { TURN_RELAY_UNAVAILABLE_TEXT } from "../constants";

export function isTurnRelayUnavailableError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes(TURN_RELAY_UNAVAILABLE_TEXT);
}

function hasStunUrl(server: RTCIceServer): boolean {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => url.startsWith("stun:"));
}

export function toStunFallbackRtcConfig(config: RTCConfiguration | null): RTCConfiguration | null {
  if (!config || config.iceTransportPolicy !== "relay") return null;
  if (!config.iceServers?.some(hasStunUrl)) return null;
  return { ...config, iceTransportPolicy: "all" };
}

export function withDefaultIceServers(serverConfig: RTCConfiguration): RTCConfiguration {
  return {
    ...serverConfig,
    iceServers: serverConfig.iceServers && serverConfig.iceServers.length > 0
      ? serverConfig.iceServers
      : DEFAULT_ICE_SERVERS,
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
