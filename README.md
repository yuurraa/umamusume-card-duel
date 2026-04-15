# Umamusume Pocket Duel

React/TypeScript frontend plus a small TypeScript backend for a Pokemon TCG Pocket-style Umamusume prototype.

## Structure

- `frontend/` - Vite React app using `.tsx` components and Tailwind utility classes.
- `backend/` - Express API server.
- `shared/` - Shared card data, deck lists, and TypeScript types.
- `frontend/public/assets/` - Card and energy image assets served by Vite.

## Intended Commands

```bash
npm install
npm run dev
```

The frontend runs on Vite and proxies `/api` to the backend on port `8787`.

Note: the current WSL environment has Node `v12.22.9` and Windows-backed `npm`, which is too old for the Vite/React toolchain. Use a current Node LTS version before installing/running.
