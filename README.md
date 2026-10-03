# Platform Internal

Client money MVP: track every client and the money you hold for them — money in, money out, balance — on a drag-and-drop dashboard.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS 4 · dnd-kit · zustand · zundo (undo/redo)

## Run

```bash
pnpm install
pnpm dev
```

- `pnpm build` — typecheck + production build (`dist/`)
- `pnpm test` — ledger maths (`node --test`, no extra deps)

## What's in it

- **Dashboard** — "Edit layout" to drag (pointer or keyboard), resize, add and remove blocks: money held, money in, money out, clients, cash flow chart, balance by client, recent activity, record money.
- **Clients** — searchable table with in/out/balance per client; click a client for their ledger, record money in/out, delete entries.
- **Undo / redo** — every data and layout change (⌘Z / ⇧⌘Z).
- Data lives in the browser (`localStorage`); first load seeds demo data. Amounts are stored as integer cents in SGD.

## Deploy

Vercel auto-detects Vite: build `pnpm build`, output `dist`.
