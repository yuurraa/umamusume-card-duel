# Engine ownership map

Verified from the current `frontend/src/game/engine.ts` facade and `frontend/src/game/engine/` tree on 2026-09-07.

## Public boundary

`frontend/src/game/engine.ts` is the stable engine facade. It composes public player actions, match setup, AI turn advancement, and match-level helpers from focused modules. It also exposes presentation-safe labels/constants, structured-event cursors, replayable updater randomness, and the opt-in development telemetry snapshot. App code, PvP intent application, components, deck screens, and backend scenarios import through this public boundary. The frontend workspace also exports the transport/projection boundaries under `umamusume-pocket-frontend/pvp/*` and `umamusume-pocket-frontend/app/matchPerspective`; backend scenarios use those package subpaths rather than reaching through the repository filesystem. New browser code should not import deep rule modules unless it is itself an engine-internal module.

The engine has no React, DOM geometry, browser storage, or transport dependency. It depends on `shared/` card/type data. Backend scenarios intentionally use the same facade so the tested rules are the rules the client runs; fixture builders and board refresh helpers needed by those scenarios are re-exported from that facade rather than imported from deep flow modules.

## Module ownership

| Area | Modules | Responsibility |
| --- | --- | --- |
| Foundation | `core/catalog`, `constants`, `labels`, `log`, `events`, `playTypes`, `random`, `stateClone`, `umamusume` | Immutable card lookup, typed primitives, labels/logs, bounded structured transition events, gameplay random source, cloning, and instance queries. |
| Rule flows | `flow/eligibility`, `energy`, `evolution`, `retreat`, `specialConditions`, `trainers`, `turn`, `abilityRules` | Legal-action predicates and focused card/rule resolution. |
| Board and combat | `flow/board`, `combat` | Continuous effects, board normalization, knockouts, attacks, scoring, and promotion mechanics. |
| Card-play orchestration | `flow/playRules`, `setup` | Play routing, setup/opening hands, and match-local instance allocation. |
| AI | `flow/ai/*` | Tactical evaluation, trainer/ability/combat choice, non-authoritative telemetry, and AI execution helpers. |
| Public exports | `engine.ts`, `engine/index.ts`, `frontend/package.json` exports | `engine.ts` is the source facade; `engine/index.ts` is a compatibility re-export so directory resolution cannot expose a narrower, drifting API. The workspace package exports the engine plus the validated PvP protocol, projection, ordered-receiver, player-intent, and perspective modules used by backend scenarios. |

## Dependency direction

Foundation modules do not import rule flows. Rule flows may use foundation modules and narrow callbacks for cross-flow coordination. `board` and `combat` are mutually coordinated through injected callbacks and shared domain functions; keep UI, transport, and persistence outside both. `playRules`, setup, and the facade orchestrate multiple flows. AI evaluates and invokes rule flows but must not own canonical state outside its supplied `GameState` transition.

Gameplay randomness uses the narrow `RandomSource` type from `core/random`. Public actions default to real randomness; tests and AI can inject a deterministic source. The source is not stored in public match state.

## Presentation and networking boundary

The engine produces canonical state, logs, and a bounded local event ledger. Events carry stable event/transition IDs and public actor/target identities without DOM geometry or animation timing. Presentation-side match hooks derive visual queues and text perspective outside the engine; battle and card-flow effects classify transitions from structured events, using state diffs only to fill intentionally redacted movement identities/counts. `useMatchCommandController` owns the small set of AppRoot commands that combine engine transitions with host synchronization, keeping that side effect outside React render/updater calculations. PvP uses `frontend/src/pvp/playerIntent.ts` to apply validated player intents through the facade, while `stateMirror.ts` projects/redacts state and sends recipient-visible event deltas with a cursor for guests. Host authority and private-zone redaction are transport concerns, not engine rule concerns.

## Testing boundary

Engine/rule regressions belong in `backend/src/tests/aiCombatScenarios.ts`; transport shape/privacy checks belong in `backend/src/tests/pvpProtocolScenarios.ts`; lifecycle/overlay behavior belongs in frontend Vitest tests. Run all fast checks with `npm run test`, then type/build with `npm run build`. The backend package-resolution scenario verifies the shared, engine, and PvP frontend subpath exports.
