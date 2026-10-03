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
- **Clients** — one page for every client account:
  - **Balances** view: opening, receipts, payments, closing balance per client for the period; select a client for their profile.
  - **Transactions** view: every receipt and payment across all clients in one ledger, with running balance; group by client or month (collapsible, subtotals).
  - Period presets, search, client filter, debit balances only, receipts/payments filter, sortable columns.
  - **Customisable table** — show/hide and reorder columns, drag column edges to resize, compact or comfortable rows (remembered per browser).
  - **Import** transactions from CSV (new clients created by name, duplicates skipped, row-level errors), **Export** the current table to CSV, **Print** the current table (A4 landscape).
- **Client profile** — KPIs, cash flow, client ledger with running balance, record transaction, printable **statement of account** (A4 / PDF).
- **Undo / redo** — every data and layout change (⌘Z / ⇧⌘Z).
- Data lives in the browser (`localStorage`); first load seeds demo data. Amounts are stored as integer sen, currency MYR (RM).

## Deploy

Vercel auto-detects Vite: build `pnpm build`, output `dist`.

## Users and Settings

- **Users** (`#users`): team list, invite, change role, suspend/reactivate, remove, transfer ownership, plus a roles and permissions table. Roles are `owner`, `admin`, `accountant`, `viewer`. Rules (permission matrix, one owner, unique emails) live in `src/users/rules.ts` and are tested in `src/users.test.ts`; other modules gate actions with `can(role, action)` from `src/users/store.ts`.
- **There is no sign-in yet.** "Viewing as" previews a role on this device. Real authentication and per-business data separation arrive with the backend; the `User` shape (ids, ISO timestamps, no derived data) maps 1:1 to it.
- **Settings** (`#settings`, `src/settings/`): organisation, statement footer and bank details, regional options and JSON backup/restore of all app data. Only `settings.manage` roles can edit. The statement reads these values.
- Persisted under `platform-internal-users` and `platform-internal-settings` (the main data stays under `platform-internal`).
