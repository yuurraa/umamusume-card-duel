import type { GameState } from "../../../shared/src/types";
import type { PlayerIntent } from "./playerIntent";

export type PvpWireMessage =
  | { type: "hello"; playerName: string; deckCardIds: string[] }
  | { type: "sync"; state: GameState }
  | { type: "intent"; intent: PlayerIntent };

export function parsePvpMessage(raw: string): PvpWireMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const withType = parsed as { type?: unknown };
    if (withType.type !== "hello" && withType.type !== "sync" && withType.type !== "intent") return null;
    return parsed as PvpWireMessage;
  } catch {
    return null;
  }
}
