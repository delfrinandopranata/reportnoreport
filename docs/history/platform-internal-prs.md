# Pull requests from the former repository

These pull requests were merged in `del-skillsunion/platform-internal` before the project moved to `delfrinandopranata/reportnoreport` on 4 October 2026. Their commits are in this repository's history; this file keeps their descriptions.

---

## #1 — feat: Supabase backend, multi-firm tenancy and sign-in (Plan A)

Branch `feat/supabase-backend` · merged 2026-10-03 · merge commit `8a32ccf`

## Summary
Plan A — backend and tenancy. Moves the client-money app from browser-only storage onto Supabase so multiple firms can use it with their own isolated data.

- **Database:** Postgres schema with row-level security on every table; firm isolation, role permissions (owner / admin / accountant / viewer) and trial / read-only rules enforced in the database; change log via triggers; balances and running ledgers computed in SQL; all-or-nothing CSV import.
- **Team:** invite / resend / remove via the `team` Edge Function; role change, suspend, reactivate, transfer ownership via RPCs; logo storage per firm.
- **App:** sign-in, forgot password, set password from invite / reset links; every page reads and writes through TanStack Query hooks; Settings and Bank accounts; Users on real team data; browser-only stores, undo/redo, sample data and "Viewing as" removed.
- **Money:** integer minor units end to end; amounts shown as ISO codes (MYR / SGD / USD); imports reject amounts in a different currency; large ledgers paged past the 1,000-row API cap.
- **Email:** branded auth templates; Resend SMTP configuration (disabled locally, Mailpit used instead); hosted go-live checklist in README.

Spec: `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` · Plan: `docs/superpowers/plans/2026-10-03-plan-a-backend-tenancy.md`

## Test plan
- [x] `supabase test db` — 78 pass (schema, isolation, roles, invariants, write rules, ledger, import, team, constraints, grants)
- [x] `deno test supabase/functions` — 4 pass
- [x] `pnpm test` — 49 pass; `pnpm test:db` (SQL vs browser maths) — pass
- [x] `tsc`, `oxlint`, `pnpm build` — clean
- [x] Browser: sign-in / reset / invite flows, per-role permissions, firm isolation, statements, import errors, trial expiry read-only, 375px + dark mode

Each task was independently reviewed, fixed and re-reviewed; screens had a UI/UX pass.


---

## #2 — feat: self-serve console and clients statement of account (Plan B)

Branch `feat/self-serve-console` · merged 2026-10-03 · merge commit `95e9678`

## Summary

Plan B — self-serve console, plus a consolidated statement of account on the Clients page.

- **Homepage** (`/`): product page with pricing ("Free for 14 days. Then RM 10, once."), FAQ, and a waitlist when early access is full. The app moves to `/app/`; the browser demo is built at `/demo/`.
- **Self-serve sign-up**: firm name, currency (MYR/SGD/USD) and owner; the firm is created on first sign-in after email confirmation. Early-access cap of 5 self-serve firms, then waitlist (`create_firm_for_current_user`, `join_waitlist`, `platform_status`).
- **Trial banner**: days left, last-days and ended/read-only states; writes are blocked after the trial with the reason shown.
- **Super-admin console**: firms table (create, suspend/reactivate, extend trial, make complimentary), read-only support view (clients, balances, ledger) with every access logged, platform settings, waitlist. Backed by the `admin` Edge Function.
- **Statement of account on Clients**: built from the table exactly as shown — period, filters, visible columns, grouping (client/month) with subtotals — printable/PDF like the client statement.
- **Fix**: "All time" now starts at the first transaction, so imported history before a client was created is included.
- **Docs**: hosted deployment checklist in `docs/operations.md`; status/roadmap updated.

## Verification

- `supabase test db`: 12 files, 98 tests pass
- `deno test supabase/functions`: 24 pass
- `pnpm test`: 91 pass · `pnpm test:db`: pass
- `tsc` clean · `oxlint`: 0 errors · `pnpm build` (app + demo) OK
- Browser: homepage + waitlist mode, sign-up → confirm → firm created, early-access-full message, trial banner states, admin console actions + support logging, Clients statement (grouped by client/month, balances, back keeps filters), `/demo/`

## Next

Plan C (Stripe, RM 10 once) and Plan D (tour, checklist, sample data).


---

## #3 — docs: mark Plan B complete

Branch `docs/plan-b-complete` · merged 2026-10-03 · merge commit `2c0fb97`

Updates CLAUDE.md, docs/README.md and docs/status-and-roadmap.md now that Plan B is on main (del-skillsunion/platform-internal#2). Also corrects the B4/B6 task labels in the roadmap and points 'how to resume' at Plan C.
