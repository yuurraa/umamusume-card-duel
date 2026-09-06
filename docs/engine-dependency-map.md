# Engine ownership map

Verified from the current `frontend/src/game/engine.ts` facade and `frontend/src/game/engine/` tree on 2026-09-06.

## Public boundary

`frontend/src/game/engine.ts` is the stable engine facade. It composes public player actions, match setup, AI turn advancement, and match-level helpers from focused modules. App code, PvP intent application, components, deck screens, and backend scenarios import through this public boundary. New browser code should not import deep rule modules unless it is itself an engine-internal module.

The engine has no React, DOM geometry, browser storage, or transport dependency. It depends on `shared/` card/type data. Backend scenarios intentionally use the same facade so the tested rules are the rules the client runs.

## Module ownership

| Area | Modules | Responsibility |
| --- | --- | --- |
| Foundation | `core/catalog`, `constants`, `labels`, `log`, `playTypes`, `random`, `stateClone`, `umamusume` | Immutable card lookup, typed primitives, labels/logs, gameplay random source, cloning, and instance queries. |
| Rule flows | `flow/eligibility`, `energy`, `evolution`, `retreat`, `specialConditions`, `trainers`, `turn`, `abilityRules` | Legal-action predicates and focused card/rule resolution. |
| Board and combat | `flow/board`, `combat` | Continuous effects, board normalization, knockouts, attacks, scoring, and promotion mechanics. |
| Card-play orchestration | `flow/playRules`, `setup` | Play routing, setup/opening hands, and match-local instance allocation. |
| AI | `flow/ai/*` | Tactical evaluation, trainer/ability/combat choice, non-authoritative telemetry, and AI execution helpers. |
| Public exports | `engine.ts`, `engine/index.ts` | Stable facade and module-local discovery exports. |

## Dependency direction

Foundation modules do not import rule flows. Rule flows may use foundation modules and narrow callbacks for cross-flow coordination. `board` and `combat` are mutually coordinated through injected callbacks and shared domain functions; keep UI, transport, and persistence outside both. `playRules`, setup, and the facade orchestrate multiple flows. AI evaluates and invokes rule flows but must not own canonical state outside its supplied `GameState` transition.

Gameplay randomness uses the narrow `RandomSource` type from `core/random`. Public actions default to real randomness; tests and AI can inject a deterministic source. The source is not stored in public match state.

## Presentation and networking boundary

The engine produces canonical state and logs. Presentation-side match hooks derive visual queues, snapshots, and text perspective outside the engine. PvP uses `frontend/src/pvp/playerIntent.ts` to apply validated player intents through the facade, while `stateMirror.ts` projects/redacts state for guests. Host authority and private-zone redaction are transport concerns, not engine rule concerns.

## Testing boundary

Engine/rule regressions belong in `backend/src/tests/aiCombatScenarios.ts`; transport shape/privacy checks belong in `backend/src/tests/pvpProtocolScenarios.ts`; lifecycle/overlay behavior belongs in frontend Vitest tests. Run all fast checks with `npm run test`, then type/build with `npm run build`.
