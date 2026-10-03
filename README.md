# Platform Internal

Client accounts MVP: record receipts and payments per client, track client funds held, and review each client ledger — on a drag-and-drop dashboard.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS 4 · dnd-kit · zustand · zundo (undo/redo)

## Run

```bash
pnpm install
pnpm dev
```

- `pnpm build` — typecheck + production build (`dist/`)
- `pnpm test` — ledger maths (`node --test`, no extra deps)

## What's in it

- **Dashboard** — "Edit layout" to drag (pointer or keyboard), resize, add and remove widgets: client funds held, total receipts, total payments, active clients, cash flow, client balances, recent transactions, record transaction.
- **Clients** — searchable list of client accounts with receipts, payments and balance; select a client to open their profile: client ledger with running balance, cash flow, and post receipts or payments.
- **Undo / redo** — every data and layout change (⌘Z / ⇧⌘Z).
- Data lives in the browser (`localStorage`); first load seeds demo data. Amounts are stored as integer cents in SGD.

## Deploy

Vercel auto-detects Vite: build `pnpm build`, output `dist`.
