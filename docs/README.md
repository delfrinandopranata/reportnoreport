# Platform — Documentation Index

**Platform** is a multi-tenant SaaS for client-money management built on Supabase and deployed on Vercel. Firms sign up (free 14-day trial, then RM 10 one-time), invite their team, post receipts and payments per client, view balances and statements, and export ledgers.

## For new developers

1. **First time?** Start here: [development.md](./development.md) — prerequisites, local setup, running tests.
2. **How does the app work?** [architecture.md](./architecture.md) — entry points, frontend structure, backend data layer.
3. **What's the database?** [data-model-and-security.md](./data-model-and-security.md) — tables, RLS rules, permissions.
4. **How do we decide things?** [decisions.md](./decisions.md) — all rulings from implementation (Plans A and B).

## For operations and deployment

- **Going live?** [operations.md](./operations.md) — Supabase hosting, Vercel config, Edge Function secrets, Resend SMTP, smoke tests.
- **What's left to build?** [status-and-roadmap.md](./status-and-roadmap.md) — Plan A and B completion status, deferred items, next steps.

## For contributors and teams

- **How is work run?** [process.md](./process.md) — brainstorm → spec → plan → subagent implementation, review and fix cycles, commit conventions.
- **What's the tech stack?** [architecture.md](./architecture.md) § Tech Stack.
- **Development conventions** are in root [CLAUDE.md](../CLAUDE.md).

## The project lifecycle

**Plan A** (backend tenancy, complete): Supabase migrations, Auth integration, RLS per firm, server-computed balances, real team invites via Edge Functions.

**Plan B** (self-serve console, complete): homepage (`/`), sign-up with email verification, early-access cap + waitlist, super-admin console, trial banner, demo at `/demo/`.

**Plan C** (Stripe billing): RM 10 one-time payment via Stripe Checkout; 14-day trial expires → write-only read-only status.

**Plan D** (onboarding): product tour on first sign-in, "Get started" checklist, loadable sample data.

**Later sub-projects** (not yet planned): Trust and compliance (audit views, locked periods, bank reconciliation); Client communication (emailed statements, reminders, client portal).

## Key constraints

- **Money** is always integer minor units (RM 10.00 = 1000 minor units).
- **Currency** is one per firm, ISO code (MYR, SGD, USD), locked once transactions exist.
- **Tenancy** enforced by row-level security (RLS) — every business table carries `firm_id` and restricts reads to the signed-in person's firm.
- **Roles** are `owner`, `admin`, `accountant`, `viewer`; permissions enforced by RLS + a `firm_can_write` check (trial expiry, suspension, read-only state).
- **Email** via Resend (hosted) or Mailpit (local); templates in `supabase/templates/`.
- **Secrets** (Supabase, Stripe, Resend API keys) exist only in Edge Functions, never in the browser or in version control.

## Quick reference

| Task | File / Command |
|------|---|
| Run locally | `supabase start && pnpm dev` (see [development.md](./development.md) §Daily) |
| Run tests | `pnpm test` (unit), `supabase test db` (database), `pnpm test:db` (equivalence), `deno test supabase/functions` (Edge Functions) |
| Regenerate DB types | `supabase gen types typescript --local > src/data/database.types.ts` |
| View API docs | Supabase Studio: `http://127.0.0.1:54323` |
| Check mailbox | Mailpit: `http://127.0.0.1:54324` |
| Deploy frontend | Vercel (auto on push to main); `pnpm build` produces `dist/` |
| Deploy functions | `supabase functions deploy admin` / `supabase functions deploy team` / `supabase functions deploy stripe-webhook` / `supabase functions deploy billing-checkout` |
| Check for lint and type errors | `npx oxlint src` and `npx tsc -p tsconfig.app.json --noEmit` |

## Ongoing work and decisions

When decisions were made during implementation (constraints, trade-offs, ruled questions), they are recorded in [decisions.md](./decisions.md) with IDs like `D1`, `R5`, `P7`. These are durable; sketch decisions belong in git commit messages or pull requests, not here.

---

**Status:** Plans A and B complete on main; Plan C (Stripe) is next. See [status-and-roadmap.md](./status-and-roadmap.md) for details.
