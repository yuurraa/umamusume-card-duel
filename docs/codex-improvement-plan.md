# Umamusume Card Duel: Codex implementation plan

Date: 2026-09-05
Status: Implementation in progress; see `docs/codex-improvement-progress.md` for verified local results and remaining work.
Scope: Structure, game logic, animation reliability, PvP boundaries, maintainability, accessibility, and verification.

## 1. Instructions for Codex

When the user asks you to apply this document, treat it as the implementation brief. Work through the phases in order, keeping each completed phase locally reviewable. Read applicable AGENTS.md instructions before starting. Recheck the current code: references below describe the reviewed snapshot and may have changed.

- Preserve the game's visual identity, card artwork, supported modes, and existing rules unless a task explicitly fixes a demonstrated defect.
- Do not rebalance cards, redesign the interface, replace React, or introduce a large framework as part of this work.
- Implement small, behavior-preserving changes before broad architectural changes. Avoid a single wholesale rewrite.
- Do not use file length alone as a reason to split a module. Improve ownership, dependency direction, and testability.
- Do not commit, push, create/update pull requests, post comments, deploy, or mutate remote services without the separate explicit authorization required by the user's Git policy.
- Keep local/cloud decks, account data, customization, and other user data intact. Use fixtures or temporary storage for tests.
- Do not require production credentials to test. Use local fixtures and fake transports; report external integration checks that remain unverified.
- Use the existing test runner where suitable. Add the smallest practical frontend testing setup for hooks, timers, and components. Resolve package/version compatibility against current official documentation when installing tooling; this document does not prescribe unverified versions.
- Do not add tests that only mirror trivial implementation details. Prioritize rule invariants, previously failing behaviors, lifecycle races, and integration boundaries.
- Do not spawn subagents unless the user or applicable instructions separately authorize delegation.
- Maintain a local execution record at `docs/codex-improvement-progress.md`: task ID, status, changed files, checks actually run, result, and remaining limitations. Use `pending`, `in_progress`, `done`, `blocked`, or `deferred`.
- Mark a task done only after its acceptance criteria pass. If an investigation disproves a suspected defect, record the evidence and avoid an unnecessary change.
- On completion, report the local diff, validation results, and any deferred tasks. Do not represent code inspection as browser testing.

### Suggested application prompt

```text
Apply docs/codex-improvement-plan.md to the local working tree. Follow its
implementation order and acceptance criteria, and maintain
docs/codex-improvement-progress.md. Preserve gameplay and visual identity.
Complete and validate each phase before proceeding. Do not commit, push,
deploy, or mutate GitHub or production services. Report any material blocker
with the completed work and a concrete next step.
```

## 2. Review baseline and evidence limits

The repository uses npm workspaces for React/Vite frontend, Express backend, and shared TypeScript card data/types. The engine is under `frontend/src/game`; its public entry point also contains orchestration. The backend test suite imports this frontend engine directly.

Verified during the preceding review:

- `npm run build` passed for backend and frontend.
- `npm --workspace backend run test:ai` passed all 30 AI/combat scenarios.
- Both TypeScript configurations enable strict checks, unchecked index checks, and exact optional property types.
- The working tree was clean after those checks. No implementation changes were made.
- In this WSL environment, the default npm resolved to Windows and failed on the UNC working directory. Selecting the installed Linux Node/npm through PATH resolved it. This was an environment issue, not a project build failure. Do not bake this machine's absolute runtime path into project scripts.

This is a source-based review with build/test validation. Live animation feel, frame rates, mobile behavior, real two-device networking, and cloud persistence have not been verified. The tasks below distinguish observed code patterns from defects that still need reproduction.

### Preserve these strengths

- Separate rules, card data, screens, board components, and feedback components.
- Existing meaningful AI/combat scenarios.
- State cloning at public action boundaries.
- Detailed knockout retention, promotion reveals, HP/energy/score presentation, and foil effects.
- Host-controlled PvP transitions and existing private-zone redaction.
- Existing image preloading, lazy imports, and build visualization support.

## 3. Priorities and execution order

P1 means correctness/reliability work to do first. P2 means architectural or usability improvements. P3 means measured optimization and documentation cleanup. These priorities are relative to this hobby project; they are not claims of an exploited vulnerability.

| Phase | Tasks | Dependency | Exit condition |
| --- | --- | --- | --- |
| 0: Baseline | BASE-01 | None | Reproducible baseline and focused test harness |
| 1: Reliability | ANIM-01–04, NET-01–03 | Phase 0 | Completion races and transport boundary tests pass |
| 2: Rule contracts | RULE-01–03, TYPE-01 | Phase 1 | Deterministic transitions, typed boundaries, invariant coverage |
| 3: Events and sequencing | EVENT-01–02, FLOW-01 | Phase 2 | Presentation consumes structured events; one sequence owner |
| 4: Ownership | ARCH-01–03 | Phase 3 | Clear application/engine/network/storage responsibilities |
| 5: Experience and performance | UX-01–02, PERF-01–02 | Phase 4 | Browser acceptance matrix and measured performance review |
| 6: Handoff | DOC-01, VERIFY-01 | All applicable tasks | Documentation, regression checks, and accurate local handoff |

Each task must remain independently reviewable. Avoid mixing a rule correction with an engine move or visual redesign. Investigations can be done earlier, but do not skip correctness gates to start optimization.

## 4. Phase 0 — Establish a repeatable baseline

### BASE-01 — Add the minimum useful verification infrastructure [P1]

Evidence: Root scripts expose build/dev; backend exposes `test:ai`. No frontend test script is currently defined.

Actions:

- Re-run the existing build and 30 scenarios; record runtime/tool versions and initial status.
- Add a root test entry point that includes existing scenarios and new focused suites. Preserve the existing backend command until its replacement is documented.
- Add a frontend test harness capable of React rerenders, fake timers, animation events, and image-loading stubs. Include StrictMode lifecycle coverage where relevant.
- Make stable fixtures for a playable match, active/bench knockout, multi-card draw, and host/guest states. Use actual supported card definitions.
- Keep browser integration checks separate from fast logic tests. Do not simulate visual frame-rate claims in a DOM-only test environment.

Acceptance: A contributor can run documented build and test commands from the workspace root. Existing scenarios still pass. New suites can reliably reproduce the failures targeted in Phase 1.

## 5. Phase 1 — Correct animation and networking reliability

### ANIM-01 — Stop parent renders from restarting battle completion [P1]

Evidence: `frontend/src/match/feedback/BattleEffectOverlay.tsx` includes `onDone` in its timer effect dependencies. `useBattleVisuals.ts` recreates the completion callback. `usePvpMatch.ts` updates its clock every 250 ms, while battle durations are 760–1360 ms. The code path predicts stalled completion under repeated renders; reproduce it first.

Actions:

- Keep completion timing tied to event identity and duration, not callback identity. The callback-ref pattern already in `PointGainOverlay.tsx` is a useful local precedent.
- Ensure each event can complete at most once and cannot complete after cancellation/reset.
- Audit sibling overlays for the same dependency problem.

Acceptance: Rerender every 250 ms with a fresh callback; the effect completes once within its configured duration plus test scheduling tolerance. Changing event identity cancels the previous event. Unmount/rematch leaves no stale completion.

### ANIM-02 — Complete batches only when all required members finish [P1]

Evidence: `CardFlowOverlay.tsx` waits independently for each image but lets the last indexed card complete the batch. `MatchOverlays.tsx` similarly assigns battle batch completion to the last effect, whose duration is not explicitly guaranteed to be the longest.

Actions:

- Track completion by stable batch/member identity, or establish a common readiness barrier and an explicit batch timeline.
- Handle slow images, failed images, duplicate card IDs, mixed effect durations, canceled animations, and unmount.
- Add an idempotent, bounded recovery path for missing animation completion. It must respect loading allowance and timeline duration rather than truncate a healthy sequence.
- Move the early empty-items return in `CardFlowOverlay` below unconditional hook calls, or introduce a hook-free outer wrapper, so empty/nonempty prop transitions obey React hook ordering.

Acceptance: Delay an earlier card's image beyond the last card's readiness; no batch completes early. Every member completes or is explicitly canceled before advancement. Duplicate completion signals are harmless. Empty items and image failure cannot strand the match.

### ANIM-03 — Make reset and interruption behavior explicit [P1]

Evidence: `useBattleVisuals.ts`, `useCardFlowVisuals.ts`, `AppRoot.tsx`, and runtime hooks collectively own timers, retained boards, deferred hands, queued callbacks, and visual locks.

Actions:

- Inventory every timeout, interval, animation frame, pending image callback, and queued visual action.
- Associate callbacks with a match/sequence generation; ignore completions from an obsolete generation.
- Verify reset clears retained KO state, HP/energy/score overrides, coin events, pending reveal flags, and queued actions together.
- Specify interruption behavior for rematch, return to menu, disconnect, terminal game state, and hidden-tab resume.

Acceptance: Interrupt each major animation stage and start a new match. No previous-match callback changes the new board, score, hand, or turn. Queues do not grow across repeated rematches.

### ANIM-04 — Make reduced motion consistent [P2]

Evidence: `BattleEffectOverlay.tsx` embeds a `prefers-reduced-motion` rule with a universal selector. It affects the document only while that component's style element is mounted. Other animation families do not share a consistent policy.

Actions:

- Centralize the preference and scope animation styles deliberately; avoid transient document-wide overrides.
- Provide restrained equivalents for card travel, coin flips, KO, score, screen transitions, and foil motion.
- Keep essential outcome feedback visible. Complete sequence bookkeeping correctly even when movement is skipped or shortened.
- Define whether preference changes take effect immediately or at the next sequence boundary; test that policy.

Acceptance: The complete setup-to-game-over flow works with reduced motion enabled, without invisible long waits or stuck queues. Motion policy remains consistent when overlays mount/unmount.

### NET-01 — Validate incoming message payloads at runtime [P1]

Evidence: `frontend/src/pvp/protocol.ts` checks the outer `type` and casts the remaining JSON to `PvpWireMessage`. Consumers dereference the unvalidated payload.

Actions:

- Validate each message variant before dispatch: required objects, strings and lengths, arrays and bounds, finite integer indexes, supported enums, and allowable card IDs.
- Validate guest-submitted decks against the actual shared deck rules. Preserve legitimate hidden-card placeholders in redacted sync payloads through a distinct validation contract.
- Validate intents structurally at the transport boundary and semantically at the authoritative engine boundary. An in-range index alone is not proof of a legal action.
- Catch invalid-message/handler errors without leaving state partially updated. Return actionable local connection feedback without logging private decks or credentials.
- Apply a bounded decompressed-byte limit while reading compressed input. The current post-inflation string-length check does not bound allocation during inflation.

Acceptance: Missing nested fields, invalid card IDs, oversized arrays, invalid choices, corrupt compression, and oversized decompressed data are rejected without uncaught exceptions or state mutation. Valid compressed/uncompressed messages still work.

### NET-02 — Preserve message order through asynchronous decoding [P1]

Evidence: `PeerRuntime` creates an ordered data channel and serializes sends, but `attachChannel` starts each asynchronous parse independently. Ordered arrival does not guarantee ordered callback completion after decompression.

Actions:

- Serialize receive parsing/dispatch, or use an equivalent explicit ordering mechanism.
- Bind receive work to the connection generation so late work from a closed connection cannot reach a new match.
- Ensure one rejected message does not permanently poison the receive queue.
- Verify outstanding encoded sends cannot be delivered to the wrong connection generation.

Acceptance: Artificially delay parsing message A while B parses quickly; callbacks still receive A then B. Reconnect during parsing; old messages are discarded. A malformed message does not block a later valid message.

### NET-03 — Test perspective and private-state boundaries [P1]

Evidence: `pvp/stateMirror.ts` and `app/matchPerspective.ts` both transform sides/text. `createGuestSyncState` redacts host zones, while other fields and logs retain separate handling. Side-indexed metadata such as `humanBySide` and `aiDeckStyleBySide` needs an explicit mirroring audit.

Actions:

- Inventory every side-indexed field and distinguish canonical state, display projection, and guest wire state.
- Test mirror-twice invariants for canonical gameplay fields; do not require lossy redacted text to round-trip.
- Verify guest packets do not expose host hand/deck identities through setup, choices, logs, or future structured events. Specify visibility of the guest's own deck order as a deliberate game rule.
- Document the trusted-host model: the host already receives the guest deck and executes rules. Do not claim this design prevents host cheating or introduce a dedicated authoritative server in this plan.
- Add session identity and monotonic state/action sequencing if needed to reject stale/duplicate transitions; document how rematch and version mismatch are handled.

Acceptance: Host/guest fixtures remain equivalent after legal actions; hidden information stays hidden on the wire; duplicate/stale updates cannot regress a match. Supported fields have explicit perspective semantics.

## 6. Phase 2 — Strengthen game contracts and types

### RULE-01 — Make randomness and instance identity match-local [P2]

Evidence: Randomness is spread across `engine.ts`, `core/random.ts`, combat, and trainers. Some AI entry points already accept randomness. `flow/setup.ts` has a module-global instance counter reset by `createGame`.

Actions:

- Introduce a narrow match context or serializable state mechanism for random draws and instance IDs. Avoid a generic dependency-injection framework.
- Route shuffles, energy rolls, coins, random discards, and random trainer choices through the same contract.
- Keep visual randomness separate from gameplay randomness.
- Preserve real randomness in normal play and inject deterministic sequences/seeds for tests. Do not expose information that predicts an opponent's hidden deck through public seed metadata.
- Ensure independently created matches cannot reset one another's identity allocation. Restored states must not reuse existing IDs.

Acceptance: Identical initial state, commands, and random sequence produce identical outcomes. Two interleaved matches maintain unique IDs within each match and do not affect each other's results.

### RULE-02 — Unify action validation and test invariants [P1]

Evidence: Eligibility helpers, public actions, UI handlers, and PvP intents all participate in validating an action. Attack selection supports indexes, while `canAttack` checks the primary attack; confirm intended behavior for cards with multiple attacks before changing it.

Actions:

- Define typed action inputs and a consistent accepted/rejected result. Keep invalid actions free of partial mutation, resource spending, emitted events, or network side effects.
- Audit setup indexes, duplicate selections, target ownership, energy payment, attack indexes, pending choices, turn deadlines, and game-over guards.
- Ensure UI eligibility and authoritative action validation share the same rules, including individual attack affordability where applicable.
- Test legal energy/HP/bench bounds, once-per-turn/game effects, card conservation with documented exceptions, terminal states, and pending-choice ownership.
- Preserve the project's explicit rules, including its current deck-out and scoring behavior; do not import assumptions from another card game.

Acceptance: Rejected actions leave canonical state unchanged. Existing scenarios pass. Boundary tests cover both sides, setup/play/done phases, multi-attack cards if present, and pending choices. Every corrected rule has a failing-before/passing-after regression test.

### RULE-03 — Separate transitions from external side effects [P2]

Evidence: `usePvpMatch.ts` and `useCardFlowVisuals.ts` send network state inside React state updater callbacks; engine creation also clears global AI telemetry.

Actions:

- Keep state updater/reducer calculations free of network sends, persistent writes, and shared telemetry mutation.
- Introduce an explicit command application boundary and outbound notification/outbox handling keyed by a transition ID.
- Ensure telemetry observes transitions without controlling rules or contaminating other matches.
- Test development StrictMode and repeated updater evaluation without duplicate messages or random rerolls changing the committed result.

Acceptance: A committed command produces one authoritative transition and one intended outbound update. Repeated render/updater evaluation cannot send duplicates or change an already resolved outcome.

### TYPE-01 — Restore strong typing at component boundaries [P2]

Evidence: `MatchOverlays.tsx`, `DeckOpenedModal.tsx`, `DeckBrowserDeckGrid.tsx`, and `DeckBrowserFilters.tsx` use `Record<string, any>` props despite strict compiler settings.

Actions:

- Replace these records and associated `any` callbacks with explicit prop/view-model/action interfaces.
- Use discriminated unions for selections, command results, and mutually exclusive modal states where they prevent impossible combinations.
- Define reusable domain/event types outside React rendering modules. Avoid importing presentation component types into game-domain contracts.
- Add a modest lint setup for React hook rules and unsafe escapes; resolve lifecycle issues rather than silencing dependency checks broadly.

Acceptance: Named boundaries have no blanket `any` props. Misspelled or missing required props fail compilation. Type/build/lint checks pass without weakening existing TypeScript strictness.

## 7. Phase 3 — Replace inferred events and scattered sequencing

### EVENT-01 — Emit structured events from authoritative transitions [P2]

Evidence: `app/animation/battleEffects.ts`, `cardFlow.ts`, notification helpers, and perspective redaction derive behavior from English logs and state differences.

Actions:

- Define a discriminated event union for supported outcomes: card movement, attacks, damage/heal, energy changes, status/tool changes, evolution, coins, knockout, promotion, points, turn changes, and game end.
- Include stable event/transition IDs, canonical actor/target identity, ordering/batch metadata, necessary before/after values, and visibility semantics.
- Emit events at the point the engine resolves an action. Keep DOM coordinates and animation durations out of engine events.
- Build English logs and perspective-specific presentation from events. Do not use rendered log strings as machine-readable identifiers.
- Migrate one action family at a time behind a temporary adapter; prevent double events while old/new paths coexist. Remove the adapter once coverage is complete.
- Bound retained event history and specify reconnect behavior; this is not a requirement to build a permanent replay service.

Acceptance: Editing log wording does not affect animation, actor attribution, hidden-information handling, or game behavior. A lethal attack emits damage, KO, score, replacement/game-end outcomes in an explicit tested order. Compound and simultaneous effects retain their intended batching.

### EVENT-02 — Define network event projection and catch-up [P2]

Actions:

- Project state and events for each recipient before sending. Redact private event payloads as well as state.
- Keep gameplay decisions on the host; guest animation acknowledgments must not become authority over legal outcomes.
- Define what happens when a new sync arrives during an animation: queue compatible events or explicitly resynchronize presentation. Do not infer missed intermediate changes from only the newest snapshot.
- Separate connection sync from replaying visible events; reconnect should not replay the entire historical log.

Acceptance: Two clients can consume the same transition at different visual speeds without changing the result. Catch-up neither duplicates score/KO presentation nor exposes private information. Missing history has a deterministic resync path.

### FLOW-01 — Give visual sequencing one explicit owner [P2]

Actions:

- Replace interdependent visual flags/queues with a typed reducer or small state machine. No third-party state-machine library is required.
- Model phases such as idle, card movement, coin outcome, battle batch, KO dissolve, point reward, promotion, and awaiting selection; allow intentional concurrency within a batch.
- Derive input/AI blocking from sequence state. Keep UI modal state and canonical game state separate from presentation state.
- Centralize sequencing durations; synchronize CSS timelines and completion bookkeeping.
- Keep one coherent displayed board/HP/energy/score projection until each event is revealed. Ensure logical state may advance without visually leaking future outcomes.
- Make completion, skip/reduced-motion, cancellation, and resync explicit actions keyed by sequence identity.

Acceptance: Table-driven tests cover legal transitions, duplicate/outdated completion, simultaneous KOs, coin-dependent actions, game-winning KOs, reset, and PvP catch-up. Only one module decides whether visual flow blocks input/AI. Retained boards are released on every terminal/cancel path.

## 8. Phase 4 — Refactor by ownership

### ARCH-01 — Reduce AppRoot coordination [P2]

Evidence: `AppRoot.tsx` is still about 889 lines; runtime and action hooks retain large setter/ref argument bundles.

Actions:

- Keep the root responsible for screen composition and application-level providers/settings.
- Move match lifecycle and command dispatch behind a typed match controller. Expose view models and named actions rather than raw setter collections.
- Separate navigation/settings/account persistence, match rules, visual sequencing, and PvP connection lifecycle.
- Consolidate modal state where exclusivity is intended; preserve combinations that are intentionally allowed.
- Keep simple local UI state local. Do not create one application-wide store merely to eliminate props.

Acceptance: Board/overlay components consume typed views/actions. Navigation does not manipulate individual KO/coin timers. Match reset has one public entry point. All modes and rematches behave as before.

### ARCH-02 — Make engine packaging and dependencies coherent [P2]

Evidence: `frontend/src/game/engine.ts` is about 986 lines and still mixes the public facade with orchestration; the backend now reaches the supported engine/PvP boundaries through workspace exports. `docs/engine-dependency-map.md` records the current layout and remaining extraction boundary.

Actions:

- Move remaining orchestration into focused modules, retaining a compatibility facade during migration.
- Establish a UI-independent engine entry point. Prefer the existing shared workspace if it remains coherent; create a separate engine workspace only if it materially clarifies dependency ownership.
- Keep browser geometry, React, network transport, and display formatting out of the engine.
- Audit actual import cycles before restructuring; the existing dependency document is not proof that old cycles still exist.
- Move engine tests alongside engine ownership, keeping command compatibility during transition.
- Use package exports or a small consistent import convention to replace fragile deep cross-workspace paths where supported by the existing build.

Acceptance: Engine tests run without React/DOM imports. UI and tests use documented public entry points. No new dependency cycles. Build and runtime package resolution both pass after migration.

### ARCH-03 — Separate backend and persistence responsibilities [P2]

Evidence: `backend/src/server.ts` is now about 139 lines after route/storage extraction; remaining authentication and persistence failure coverage is the ownership gap. This is an ownership concern, not evidence every route is faulty.

Actions:

- Separate app construction from process startup; make routes testable without binding a production port.
- Extract deck/account/collection routes and storage adapters while preserving response contracts.
- Audit input validation, authentication boundaries, fallback behavior, path handling, and failure responses using local fixtures. Fix demonstrated defects with focused tests.
- Review PvP session TTL cleanup, candidate/session bounds, answer ownership, and deployment-appropriate request limits. Retain the lightweight signaling design.
- Clarify local-only API and development-unlock settings; test that intended production defaults are respected.

Acceptance: Tests cover deck validation, persistence failure, disabled local API behavior, and signaling expiration/invalid input without real cloud writes. Existing clients remain compatible. Any changed external contract is documented.

## 9. Phase 5 — Validate usability and measure performance

### UX-01 — Make keyboard, modal, and touch flows complete [P2]

Evidence: An initial scan of match modals did not show consistent dialog semantics or focus handling. This requires browser verification rather than assuming all controls are inaccessible.

Actions:

- Audit focus entry/containment/restoration, Escape behavior, accessible names, visible focus, and background interaction for each modal.
- Use a small shared modal primitive if it removes duplicated focus behavior without forcing unrelated layouts together.
- Verify card play, energy attachment, retreat payment, attack targets, deck selection, and card inspection without dragging or hover alone.
- Review live announcements so batches do not produce repetitive screen-reader noise.
- Test small viewport/touch layouts and long names; preserve usable hit targets and readable choices.

Acceptance: A match and deck-selection flow can be completed using keyboard controls. Modals restore focus to a valid element. Touch users can inspect and choose cards without hover. No critical action is hidden by overflow at tested viewports.

### UX-02 — Review animation pacing in real play [P2]

Evidence: Card flow normally uses 2100 ms plus stagger; point gain uses 2500 ms, with additional KO/promotion stages. These values are not proof of poor pacing.

Actions:

- Record setup, ordinary turns, multi-card draw, compound trainer action, simultaneous KO, and game-winning KO in a browser.
- Assess waiting versus useful feedback and whether HP, points, and targets are easy to follow.
- Reduce redundant serial pauses only where playthrough evidence supports it. Preserve impact on important outcomes.
- Consider a simple faster-animation preference only if the baseline remains too slow; keep default visual identity and avoid turning this into a settings redesign.

Acceptance: Record tested mode/device/viewport and describe actual results. Fast/reduced motion, if available, produce identical canonical outcomes and complete every sequence correctly.

### UX-03 — Make match layout responsive without separating cards from their frames [P1]

Evidence: The match uses a 1760px maximum content width and a mixture of fixed pixels and viewport clamps. At high resolutions, this leaves the board visually undersized. A board-only enlargement was tried and reverted because `UmaCard` was capped below the enlarged Active-slot frame, producing excess empty boundary. The Active card now fills its existing padded slot; this is not yet a high-resolution scaling solution.

Actions:

- Treat the current 1920×1080 layout as the baseline to preserve. Record desired browser screenshots/measurements for 1366×768, 1920×1080, 2560×1440, 3840×2160, and one ultrawide viewport before applying new layout geometry.
- Use the existing element measurement and pure metric helpers as a basis, but do not apply a scale to only a board wrapper. Resolve ordinary pixel dimensions for each complete visual unit: card, Active/Bench frame, board padding, center column, score controls, Stadium/drop zone, hand, and hand controls.
- Do not use CSS `zoom`, a global transform, or CSS value multiplication. Preserve normal document flow so DOM rectangles remain valid for attack, card-flow, and KO overlays.
- Change one region at a time, beginning with a matched Active card/frame pair. After each region, test 100% browser zoom in Chrome and Firefox plus drag/drop, hover/focus, Energy attachment, attack, KO, promotion, and reset behavior.
- Keep smaller-screen clamps and the intentional horizontal-scroll fallback unless direct tests demonstrate a better accessible alternative.

Acceptance: At recorded target viewports, cards remain proportionate to their frames and controls; no critical content clips or becomes too small. Chrome and Firefox evidence covers baseline, high-resolution, and ultrawide layouts. Attack/draw/KO overlays and input targets resolve to the correct cards before and after resizing.

### PERF-01 — Measure rendering before optimizing [P3]

Evidence: Foil pointer movement sets React state on each pointer event; snapshots measure DOM rectangles; PvP clock state rerenders the owning component. These are profiling candidates, not verified performance bottlenecks.

Actions:

- Profile a busy board, pointer inspection, card browser, multi-card draw, and PvP clock with browser performance/React tools.
- Isolate clock updates from unrelated match rendering where measurements show unnecessary work.
- If needed, batch pointer updates through animation frames or scoped CSS variables; retain cleanup and keyboard/reduced-motion behavior.
- Separate geometry capture from logical snapshot generation and avoid repeated forced layout when profiling identifies it.
- Add memoization only at demonstrated expensive boundaries; do not scatter it throughout the app.

Acceptance: Document before/after measurements with device/browser/viewport and scenario. Optimizations do not change visual targeting or sequencing. Do not claim universal 60 fps from one machine or a synthetic test.

### PERF-02 — Review bundle and asset loading [P3]

Evidence: Build output groups much code into `match` and `screens` chunks, and Vite manually groups these folders despite per-screen lazy imports. Chunk size alone does not establish a loading problem.

Actions:

- Use generated `frontend/dist/stats.html` and a browser network trace to identify what the initial menu and first match actually load.
- Compare current manual chunks with a simpler strategy; retain the configuration that improves measured entry/transition loading.
- Check image dimensions, missing assets, cache behavior, and preload scope. Avoid preloading the entire collection merely to hide first-use latency.
- Add a clear recoverable error state for failed lazy imports where a failed chunk currently strands navigation or a blocking overlay.

Acceptance: Record initial and first-match transfer/loading observations. Broken image/chunk loading cannot leave an unexplained permanent blank state. Build asset references remain valid.

## 10. Phase 6 — Documentation and final acceptance

### DOC-01 — Update contributor documentation [P3]

- Expand README with workspace ownership, supported runtime, install/dev/build/test commands, local configuration, and optional cloud/PvP requirements without secrets.
- Replace stale engine dependency paths with the actual final module map and document command/event/presentation boundaries.
- Document game rules that tests rely on, including deliberate deviations from other card games.
- Explain host authority, private-state projection, reset/cancellation behavior, and compatibility/version policy.
- Add concise guidance for adding a card effect: definition, rule resolution, structured event, visual mapping, and meaningful regression scenario.
- Inspect the root and frontend lockfiles; document the workspace install convention and consolidate only after verifying which lockfile the actual workflow uses.

Acceptance: A new contributor can set up the project and add a small effect without reverse-engineering AppRoot or English log parsing.

### VERIFY-01 — Run the final acceptance matrix [P1]

Run fast checks after relevant phases, then perform the following final checks. Record actual outcomes and external limitations rather than marking everything passed by assumption.

| Area | Required scenarios |
| --- | --- |
| Build/types/lint | Root production build, strict types, configured lint, all existing and new tests |
| Setup | Coin selection, deferred hands, active/bench selection, invalid choices, setup countdown |
| Rules | Legal/illegal actions, energy/retreat payments, evolution, status ticks, trainer/tool/stadium interactions, pending choice |
| AI | Existing 30 scenarios, fixed-seed full matches, bounded progress/no stranded turn |
| Animation | Cold/cached/failed images, mixed durations, multi-card batches, duplicate callbacks, frequent rerenders |
| Knockout | Active KO, bench KO, simultaneous KOs, promotion choice, winning KO, correct score reveal |
| Lifecycle | Reset/menu/rematch during every blocking stage, hidden-tab resume, repeated matches |
| Modes | Player vs AI, AI vs AI with perspective switching, host and guest PvP |
| Network | Invalid payloads, decode ordering, disconnect/reconnect, obsolete messages, privacy projection, version mismatch policy |
| Accessibility | Reduced motion, keyboard-only play, focus return, touch alternatives, small viewport |
| Persistence | Valid/invalid deck import, save failures, optional cloud unavailable, customization retention |
| Performance | Recorded busy-board/foil/initial-load observations on explicitly named environment |

A local fake transport can validate ordering and state contracts, but does not establish real WebRTC/TURN connectivity. If two-browser/device networking or cloud access cannot be tested, list it explicitly as unverified and provide reproducible manual steps.

## 11. Completion checklist

- [ ] Baseline and regression commands are documented and pass.
- [ ] Battle timers survive repeated renders; batches finish exactly once after all members settle.
- [ ] Reset, cancellation, and reduced motion cannot strand or contaminate a match.
- [ ] Incoming PvP messages are validated, ordered, and scoped to the active session.
- [ ] Rule transitions are deterministic under injected randomness and isolated across matches.
- [ ] Strong types protect UI/action/network boundaries.
- [ ] Structured events replace behavior inferred from English logs.
- [ ] One sequence owner controls displayed progression and visual blocking.
- [ ] Engine, application, network, and storage responsibilities are documented and separated.
- [ ] Keyboard/touch/browser checks have recorded evidence or explicit limitations.
- [ ] Responsive match layout is verified at baseline, high-resolution, ultrawide, and small viewports without separating cards from their frames.
- [ ] Performance changes are supported by measurements.
- [ ] Existing visual identity, supported modes, rules, and user data are preserved.
- [ ] Progress record accurately identifies completed, deferred, and unverified work.
- [ ] Final local diff/status is reported; no unauthorized remote or Git mutation occurred.

## 12. Explicitly deferred scope

Do not add ranked matchmaking, a dedicated authoritative game server, persistent replay infrastructure, a new UI framework, a global state library, a wholesale artwork redesign, or card balance changes to satisfy this plan. These require separate product goals. Prefer a maintainable hobby-scale implementation of the contracts above.
