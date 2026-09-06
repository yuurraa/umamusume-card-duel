# Umamusume Card Duel

A local React/Vite card-duel client with a TypeScript rules engine, Express-backed optional persistence/signalling endpoints, AI opponents, and host-authoritative peer-to-peer matches.

## Workspace layout

- `frontend/` — React client, gameplay presentation, PvP transport, and browser tests.
- `backend/` — Express server plus engine/protocol scenario tests.
- `shared/` — card data, game types, deck validation, and other code shared by client and server.
- `docs/` — implementation plan, verified progress record, and engine ownership map.

The rules engine is UI-independent and exposed through `frontend/src/game/engine.ts`. Browser code should use that facade rather than deep engine imports. It owns canonical game transitions; React owns presentation and interaction state; the PvP layer transports host-authoritative state projections; storage utilities own local/cloud persistence.

## Requirements and install

Use a current Linux Node.js 22+ runtime and npm. The repository uses npm workspaces and the root `package-lock.json` is the install lockfile.

```bash
npm install
```

## Local development and checks

```bash
npm run dev       # start the frontend development server
npm run build     # strict TypeScript checks and production build
npm run test      # engine rules, PvP protocol, and frontend feedback tests
npm run lint      # frontend React/hooks/type-boundary lint checks
```

Backend persistence defaults are intentionally conservative: `ENABLE_LOCAL_DECK_API=true` enables the local filesystem API, while cloud decks require Firebase service-account configuration. For a local Firebase-free development fallback, set `ENABLE_CLOUD_DEV_FALLBACK=true` and optionally `FIREBASE_DEV_USER_ID`; this fallback is ignored when `NODE_ENV=production`. Backend starter-card unlocks are also opt-in with `ENABLE_DEV_UNLOCKS=true` (the frontend equivalent is `VITE_ENABLE_DEV_UNLOCKS=true`); they default off and are forced off in production.

The backend scenarios are also available independently as `npm --workspace backend run test:ai` and `npm --workspace backend run test:pvp-protocol`.

## Match and PvP model

Normal matches use real gameplay randomness. Engine entry points also accept an optional injected random source for reproducible tests; it is not emitted in public match state, so it does not reveal hidden deck order.

Peer-to-peer games use a trusted-host model: the host receives the guest deck, validates intents, resolves rules, and sends a redacted guest projection. This prevents accidental client-side state drift and hides the host’s private zones from the guest transport; it is not a cheating-prevention server. Incoming messages are validated, decompression is bounded, and handshake/session identities plus monotonic state and event sequences reject stale rematch traffic.

## Adding a card effect

1. Add the card definition in `shared/src/data/cards.json` and keep its type data valid.
2. Implement the rule in the focused engine module (`trainers`, `combat`, `turn`, etc.) and validate inputs at the public action boundary.
3. Keep randomness routed through the injected engine random source when the effect needs it.
4. Add a meaningful scenario under `backend/src/tests/aiCombatScenarios.ts` or a focused protocol/frontend test.
5. Emit a typed public event from the resolving rule flow when the outcome needs presentation or network sequencing. Keep DOM geometry and durations in presentation code.
6. Map new presentation behavior without relying on English log text as an identifier; preserve hidden-information boundaries for PvP.

## Current implementation record

See [the improvement progress record](docs/codex-improvement-progress.md) for locally verified work, deferred plan items, and external checks that still need real-browser/device evidence.
