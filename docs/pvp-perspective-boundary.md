# PvP perspective and privacy boundary

The engine stores one canonical match from the host's point of view. A guest
sync is first redacted, then displayed through the guest's mirrored
perspective. The host remains trusted: it receives the guest deck during the
hello handshake and executes the same shared rules. This design does not claim
to prevent a cheating host or provide server authority.

## Canonical state

`GameState` is authoritative and side labels always mean the canonical host
labels:

- `sides`, `currentSide`, `firstPlayer`, `winner`, `stadium.owner`, and
  `pendingPlayerChoice.sideId` are side-specific gameplay state.
- `setup.openingHands` and `setup.readyBySide` are side-indexed setup state.
- `turnsTakenBySide`, `humanBySide`, and `aiDeckStyleBySide` are side-indexed
  metadata. Perspective transforms swap all three records together with the
  board sides.
- `log` is canonical text and is transformed only for display. It is not a
  machine-readable protocol.
- `events` are canonical structured outcomes with stable IDs and transition
  IDs. They are projected for the recipient before transport and mirrored for
  display.

Fields without a side reference (`phase`, turn number, deadlines, AI
difficulty, match flags, and allocator counters) remain unchanged when the
perspective changes. `mirrorGameState(mirrorGameState(state))` must restore
canonical gameplay and metadata; lossy redacted text is not required to round
trip.

## Guest wire state

`createGuestSyncState` runs before perspective mirroring. It replaces the
host's hand, deck, and setup opening-hand IDs with empty placeholders, removes
the local event ledger and allocators, and redacts host-private log entries.
The guest's own zones are intentionally retained so the guest can render its
hand and deck order. The host's private zones must never be reconstructed from
the state snapshot.

Structured events travel separately through `projectGameEventsForSide`:

- public events are sent to both sides;
- actor-scoped events are sent only to their side;
- private events are omitted;
- card IDs are removed when a card-movement event belongs to the other side.

Each handshake creates a session identity and carries protocol version `1`.
Hello, intent, and sync packets carry both values; an incompatible version is
rejected by the parser, a guest ignores sync from another session, and the host
ignores intents from an obsolete session. Within a session, the canonical event
ID is the event cursor. Guests merge only newer event IDs and reject stale state
sequence numbers, so duplicate or delayed packets cannot move the match
backward. A reconnect/rematch starts a new session rather than reusing old
sequence counters. A reconnect that needs history must use a fresh canonical
sync; an exhausted bounded event ledger cannot be treated as a complete
historical replay.

## Perspective implementations

- `frontend/src/pvp/stateMirror.ts` owns transport redaction, event
  projection, and full state mirroring for the guest command path.
- `frontend/src/app/matchPerspective.ts` owns display-only perspective changes
  (including AI-vs-AI viewpoint switching).

When adding a new side-indexed field, update both modules, add a mirror-twice
or explicit swapped-value regression, and decide whether the field is visible
on the guest wire before adding it to the sync payload.
