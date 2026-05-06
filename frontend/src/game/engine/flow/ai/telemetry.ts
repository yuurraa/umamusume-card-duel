type AiTelemetryEvent =
  | "turn_goal"
  | "trainer_bundle_scores"
  | "combat_candidates";

const seenTurnGoalKeys = new Set<string>();
const history: AiTelemetryRecord[] = [];
let nextSequence = 1;

export type AiTelemetryRecord = {
  seq: number;
  ts: number;
  event: AiTelemetryEvent;
  payload: Record<string, unknown>;
};

export function emitAiTelemetry(event: AiTelemetryEvent, payload: Record<string, unknown>): void {
  const explicitFlag = (globalThis as typeof globalThis & { __UMA_AI_TELEMETRY__?: boolean }).__UMA_AI_TELEMETRY__;
  const enabled = Boolean(explicitFlag);
  if (!enabled) return;
  if (event === "turn_goal") {
    const key = JSON.stringify({
      event,
      turn: payload.turn ?? null,
      side: payload.side ?? null,
      phase: payload.phase ?? null,
      goal: payload.goal ?? null,
      tags: payload.reasonTags ?? null,
    });
    if (seenTurnGoalKeys.has(key)) return;
    seenTurnGoalKeys.add(key);
    // Keep memory bounded across long sessions.
    if (seenTurnGoalKeys.size > 6000) seenTurnGoalKeys.clear();
  }
  const record: AiTelemetryRecord = {
    seq: nextSequence++,
    ts: Date.now(),
    event,
    payload,
  };
  history.push(record);
  if (history.length > 1200) history.splice(0, history.length - 1200);
  dispatchTelemetryEvent();
  // Keep output structured and grep-friendly for local tuning sessions.
  console.info(`[AI:${event}]`, payload);
}

export function getAiTelemetrySnapshot(): AiTelemetryRecord[] {
  return [...history];
}

export function clearAiTelemetry(): void {
  history.length = 0;
  seenTurnGoalKeys.clear();
  dispatchTelemetryEvent();
}

function dispatchTelemetryEvent(): void {
  const runtime = globalThis as unknown as {
    dispatchEvent?: (event: unknown) => boolean;
    CustomEvent?: new (type: string) => unknown;
    Event?: new (type: string) => unknown;
  };
  if (typeof runtime.dispatchEvent !== "function") return;
  if (typeof runtime.CustomEvent === "function") {
    runtime.dispatchEvent(new runtime.CustomEvent("uma-ai-telemetry"));
    return;
  }
  if (typeof runtime.Event === "function") {
    runtime.dispatchEvent(new runtime.Event("uma-ai-telemetry"));
  }
}
