import type { EnergyType, GameEvent, GameState } from "../../../../../shared/src/types";

export type GameEventPayload = GameEvent extends infer Event
  ? Event extends GameEvent
    ? Omit<Event, "id" | "transitionId">
    : never
  : never;

const MAX_RETAINED_EVENTS = 128;

/** Starts a transition scope shared by all events emitted while an action resolves. */
export function beginTransition(state: GameState): number {
  if (state.activeTransitionId !== undefined) return state.activeTransitionId;
  const transitionId = state.nextTransitionId ?? 1;
  state.nextTransitionId = transitionId + 1;
  state.activeTransitionId = transitionId;
  return transitionId;
}

export function endTransition(state: GameState, transitionId: number): void {
  if (state.activeTransitionId === transitionId) delete state.activeTransitionId;
}

/** Appends a bounded, serializable event ledger entry for local presentation. */
export function emitGameEvent(state: GameState, payload: GameEventPayload, transitionId?: number): GameEvent {
  const startsImplicitTransition = transitionId === undefined && state.activeTransitionId === undefined;
  const resolvedTransitionId = transitionId ?? state.activeTransitionId ?? beginTransition(state);
  const id = state.nextEventId ?? 1;
  state.nextEventId = id + 1;
  const event = { ...payload, id, transitionId: resolvedTransitionId } as GameEvent;
  state.events = [...(state.events ?? []), event].slice(-MAX_RETAINED_EVENTS);
  if (startsImplicitTransition && state.activeTransitionId === resolvedTransitionId) delete state.activeTransitionId;
  return event;
}

export function emitCardMovement(
  state: GameState,
  side: GameState["sides"]["player"]["id"],
  from: Extract<GameEvent, { kind: "cardMovement" }>["from"],
  to: Extract<GameEvent, { kind: "cardMovement" }>["to"],
  count: number,
  cardIds?: string[],
  transitionId?: number,
): GameEvent {
  return emitGameEvent(state, {
    kind: "cardMovement",
    // Counts for cards entering a hand are public; identities remain optional
    // and are projected away for recipients who do not own the hand.
    visibility: to === "hand" ? "public" : "actor",
    side,
    from,
    to,
    count,
    ...(cardIds ? { cardIds } : {}),
  }, transitionId);
}

export function emitEnergyChanges(
  state: GameState,
  side: GameState["sides"]["player"]["id"],
  targetUid: number,
  before: Record<EnergyType, number>,
  after: Record<EnergyType, number>,
  transitionId?: number,
): void {
  (Object.keys(before) as EnergyType[]).forEach((energyType) => {
    const amount = (after[energyType] ?? 0) - (before[energyType] ?? 0);
    if (amount === 0) return;
    emitGameEvent(state, {
      kind: "energy",
      visibility: "public",
      side,
      targetUid,
      energyType,
      amount,
    }, transitionId);
  });
}

export function getNewGameEvents(previous: GameEvent[] | undefined, current: GameEvent[] | undefined): GameEvent[] {
  if (!current || current.length === 0) return [];
  const previousIds = new Set((previous ?? []).map((event) => event.id));
  return current.filter((event) => !previousIds.has(event.id));
}
