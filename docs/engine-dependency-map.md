# Engine Dependency Map

Source analyzed:
- frontend/src/game/engine.ts
- Frontend import consumers under frontend/src

Generated summary:
- Top-level functions: 94
- Directed function-call edges: 189

## 1) External Consumer Map (Public API Surface)

Files importing from frontend/src/game/engine:

- frontend/src/App.tsx
  - advanceOpponentTurnStep
  - attachPlayerEnergy
  - canAttack
  - canAttachEnergy
  - canRetreat
  - canUseUmamusumeAbility
  - completePregameSetup
  - createGame
  - getAllUmamusume
  - getCard
  - getDamagedUmamusume
  - getEvolutionTargets
  - getPrimaryAttack
  - getUmamusumeCard
  - getPlayableAction
  - playerAttack
  - playerEndTurn
  - playerRetreat
  - playerSurrender
  - playHandCard
  - resolvePendingPlayerChoice
  - usePlayerAbility
- frontend/src/components/Bench.tsx
  - getUmamusumeCard
- frontend/src/components/EnergyIcon.tsx
  - energyLabel
- frontend/src/components/Hand.tsx
  - getCard
  - getPlayableAction
- frontend/src/components/SideBoard.tsx
  - getUmamusumeCard
- frontend/src/components/UmaCard.tsx
  - getUmamusumeCard
- frontend/src/match/CardPreview.tsx
  - getDisplayedRetreatCost
- frontend/src/match/ChoiceModal.tsx
  - getCard
  - isUmamusumeInDeck
- frontend/src/match/HandControls.tsx
  - energyLabel
- frontend/src/match/helpers.ts
  - canAttachEnergyToUmamusume
  - getAllUmamusume
  - getCard
  - getDamagedUmamusume
  - getEvolutionTargets
- frontend/src/match/SelectionPrompt.tsx
  - energyLabel
- frontend/src/match/StadiumSlot.tsx
  - getCard
- frontend/src/screens/DeckBrowserScreen.tsx
  - energyLabel
- frontend/src/utils/deck.ts
  - getCard

Implication: keep a stable facade file for UI imports while splitting internals.

## 2) Proposed Module Ownership

- catalog: card lookup and typed card access
- labels: formatting and actor text helpers
- umamusume: umamusume instance queries and selectors
- setup: game creation and pregame setup
- stateClone: cloneGame
- turn: start/end turn and draw/start abilities
- random: shuffle and random energy roll
- log: log append/trim
- playRules: getPlayableAction and resolveCardPlay routing
- trainers: trainer effects and deck search/discard mechanics
- evolution: evolution target validation and evolve transition
- energy: attach energy, energy checks, move-energy ability
- retreat: retreat checks/cost/payment
- combat: attack execution and knockout resolution
- board: continuous effects, board normalization, auto knockouts
- playerActions: player-triggered orchestration
- opponentAi: AI turn-step orchestration and decisions

## 3) Module Dependency Map (Weighted Edges)

Higher weight means more direct calls across module boundaries.

- combat -> labels (9)
- trainers -> catalog (7)
- opponentAi -> catalog (6)
- playerActions -> stateClone (6)
- combat -> catalog (6)
- trainers -> labels (6)
- energy -> labels (5)
- playerActions -> board (5)
- turn -> labels (4)
- playerActions -> turn (4)
- opponentAi -> energy (3)
- setup -> catalog (3)
- energy -> umamusume (3)
- opponentAi -> retreat (3)
- trainers -> log (3)
- retreat -> catalog (3)
- evolution -> labels (3)
- playerActions -> retreat (3)
- playerActions -> log (3)

Other observed edges (weight 1-2) include:
- opponentAi -> combat, board, evolution, labels, log, umamusume, playRules, trainers, turn, stateClone, setup
- combat -> umamusume, log, energy, board, turn, opponentAi
- board -> combat, catalog, umamusume
- turn -> board, random, catalog, umamusume, log
- setup -> turn, log, stateClone

## 4) Hotspot Functions (Most Incoming Calls)

- log (16)
- getCard (15)
- getUmamusumeCard (13)
- actorName (9)
- cloneGame (9)
- formatUmamusumeCardName (8)
- formatUmamusumeInstanceName (6)
- getAllUmamusume (5)
- refreshContinuousEffects (5)

These are strong utility/foundation candidates and should stay low-level.

## 5) Orchestration Functions (Most Outgoing Calls)

- performAttack (14)
- advanceOpponentTurnStep (10)
- playerRetreat (8)
- usePlayerAbility (8)
- knockOutUmamusume (6)
- resolvePendingPlayerChoice (6)
- shouldAiPlayTrainer (6)

These are high-coupling flows and should be isolated as top-level orchestration modules.

## 6) Current Cycles To Break During Split

Detected or implied cycles at module level:

- combat <-> board
- combat -> opponentAi -> combat
- turn -> board -> combat -> turn

Recommended break strategy:

- Move choosePreferredActiveIndex out of opponentAi into combatHelpers or boardHelpers so combat no longer imports opponentAi.
- Keep board as a pure state-normalization/effects layer that does not call combat internals directly; route knockout triggering through a narrow callback or domain service.
- Keep turn independent from combat resolution; only invoke board refresh entrypoints.

## 7) Suggested Layering (Target)

Bottom to top:

- Foundation: catalog, labels, log, stateClone, random
- Domain primitives: umamusume, evolution, energy, retreat, trainers
- State/effects: board, turn
- Combat domain: combat
- Orchestration: playRules, playerActions, opponentAi, setup
- Public facade: game/engine/index.ts re-exporting stable API

This layering minimizes upward calls and keeps UI-facing API stable while internals are modularized.

## 8) Standard-Conventions Folder Layout (Applied)

Current engine folder shape:

- frontend/src/game/engine.ts
  - Compatibility facade and top-level game orchestration
- frontend/src/game/engine/
  - ai.ts
  - board.ts
  - combat.ts
  - eligibility.ts
  - energy.ts
  - index.ts
  - catalog.ts
  - constants.ts
  - evolution.ts
  - labels.ts
  - log.ts
  - playRules.ts
  - playTypes.ts
  - random.ts
  - retreat.ts
  - setup.ts
  - stateClone.ts
  - trainers.ts
  - turn.ts
  - umamusume.ts

Conventions used:

- One responsibility per file with noun-based module names.
- Stable public facade retained at frontend/src/game/engine.ts to avoid touching UI imports during incremental migration.
- Shared utilities and domain modules are split by concern (catalog, play-rules, AI, combat, board, setup, turn).
- Barrel export file at frontend/src/game/engine/index.ts for module-local discoverability.
- Cross-module dependencies are passed through narrow callbacks where needed to avoid tight cycles.

Migration contract:

- Do not import deep modules from UI yet; continue importing from frontend/src/game/engine.
- Keep frontend/src/game/engine.ts as the user-facing facade unless a deliberate import-path migration is planned.
