# Decisions and Rulings

**Spec decisions (D1–D11)** are in the spec; **Implementation rulings (R1–R34 Plan A; P1+ Plan B)** are captured here. These are durable records of constraints, trade-offs, and ruled questions. Reference format: `D1`, `R5`, `P7`.

## Spec decisions

| ID | Decision | Choice | Rationale | Cost if wrong |
|---|---|---|---|---|
| D1 | How firms get on | Self-serve sign-up + trial, plus manual creation by owner | Lower friction for early users; owner can control compliance | Cap not enforced; manual process scales poorly |
| D2 | Backend | Supabase (Postgres RLS, Auth, Edge Functions), Singapore | Postgres + RLS is proven for multi-tenant systems; Supabase handles ops | Vendor lock-in; data in SG region (latency from other regions) |
| D3 | Currency | One per firm, ISO code (MYR, SGD, USD), locked once transactions exist | Clarity; no currency conversion; amounts are integers in the firm's minor units | Multi-currency requests need a new architecture |
| D4 | Correcting mistakes | Entries editable/deletable; change_log records every change | Trust firms' own processes; audit trail for compliance | Soft-delete adds complexity; recovery requires log parsing |
| D5 | Membership | One person = one firm; super-admins are separate (no firm) | Simple ownership; no shared access across firms; super-admins can only admin | Breaks shared team accounts (not a goal) |
| D6 | Data layer | Server-first: pages query only what they show; balances computed in Postgres | Balances are canonical in SQL; browser is thin client | No offline support; every page load queries the server |
| D7 | Pricing | RM 10 one-time via Stripe (card or FPX) | Simple, low price; one-time means permanent access; FPX is Malaysia standard | No recurring revenue; no per-seat pricing; no coupons |
| D8 | Trial end | 14 days; unpaid → read-only (view, export, print) until paid | Data isn't deleted; firm can still access after trial; no "hard" paywall | Read-only doesn't block all pain points (users see data but can't edit) |
| D9 | Launch cap | 5 self-serve firms early-access; configurable; then waitlist | Control growth; manage support load; gather feedback | Turns away users; creates friction (waitlist) |
| D10 | Onboarding | Auto product tour on first sign-in; skippable "Get started" checklist; sample data | Walk users through features; sample data lets them explore risk-free | Tour is in-house (not a SaaS); sample data is extra DB load |
| D11 | Email | Resend (branded SMTP); local dev uses Mailpit | Resend is reliable; branded templates; local dev doesn't send real emails | Depends on Resend account; production setup complexity |

## Plan A implementation rulings

**Rule focus:** schema design, tenancy model, security constraints, error handling, testing.

| ID | Ruling | Cost if wrong | Status |
|---|---|---|---|
| R1 | `log_change()` derives firm_id via JSONB (`case when tg_table_name = 'firms' then (j->>'id')::uuid else (j->>'firm_id')::uuid end`) to avoid PL/pgSQL record-field resolution bugs | change_log rows for firms lack firm_id (caught by test 04) | Implemented |
| R2 | `assert_manager(uuid)` is created directly (no `pg_temp` prefix); execute revoked from public/anon/authenticated | None functional (cosmetic) | Implemented |
| R3 | Money test asserts `Intl.NumberFormat` output for SGD under `en-MY` locale; if different from plan literal, note the actual output | Cosmetic (test passes with the real format) | Implemented; SGD renders "SGD 50.00" not "S$50.00" |
| R4 | `src/settings/constants.ts` created by T11; T10 doesn't edit it (avoids concurrent edit); T12 repoints imports when deleting old store | One extra sweep in T12 (accepted) | Implemented |
| R5 | `firm_write_block_reason(firm)` called with any firm ID: returns null-equivalent for other firms is short-term acceptable; guard added so service-role check happens anyway | Plan C/B Edge Functions bypass RLS unaffected | Implemented |
| R6 | Use `/opt/homebrew/bin/pnpm` (v12) for every install/script; PATH pnpm 10.22 mismatches node_modules store v11 | Stale node_modules; one reinstall | Implemented; documented in development.md |
| R7 | Commit `supabase/.gitignore` created by `supabase init` (ignores CLI temp/env files) | None | Implemented |
| R8 | Fixes touching supabase/ (Tasks 2–3) wait until Task 4–7 finishes (shared local Postgres; concurrent `db reset` corrupts) | Sequence delay acceptable | Implemented |
| R9 | Tasks 1–8 have no UI; no UI/UX improver for them | Task 9–12 still get UI passes (acceptable) | Implemented |
| R10 | `transactions.client_id on delete cascade` — spec §6 allows client deletion after confirmation; change_log keeps deleted rows | Client deletion removes ledger from live tables (recoverable only in log) | Implemented; tested |
| R11 | T1-F1 (sb_secret_ keys) and T1-F2 (malformed JWT) are security/clarity cheap fixes → fix now; T1-F3, T1-F4 deferred minors | Deferred minors are low-cost; accepted | Implemented |
| R12 | OTP expiry → 86400 (24h, hosted Supabase max) instead of 7 days; spec becomes "Resend invite after 1 day" | Invitees must ask for resend after 1 day (acceptable short-term) | Implemented; verified in Mailpit |
| R13 | T2-F2 fix (pin created_at/created_by on UPDATE; INSERT uses now()) + constraint tests batched into DB fix | Schema is now correct; accepted | Implemented |
| R14 | Accept implementer deviation `session_user <> 'postgres'` in firm_can_write (current_user is always definer inside SECURITY DEFINER) | Guard ineffective; covered by final QA (acceptable) | Implemented; tested |
| R15 | Accept corrected client_balances test fixture: {650000, 1150000, 1190000} (controller recomputed from seed) | Plan arithmetic was wrong; fixture now correct | Implemented |
| R16 | T8 fixer also fixes UTC `created_at.slice(0,10)` (wrong client-since date for UTC+8 users before 8am) | User-visible date shift; cheap fix | Implemented |
| R17 | Import collects ALL row errors before raising (not first-error-only) — spec §5/§6 "row-level errors" | Duplicate rows in one import may be written twice (intended: separate entries) | Implemented; deterministic via `created_at < now()` check |
| R18 | Accept T9 deviations: conflict helpers, returnTo on fresh sign-outs, conditional uuid filters, typed RPC calls | None functional | Implemented |
| R19 | Set-password flow keyed on `?flow=set-password` query param (survives Supabase token hash) + `type=invite|recovery` + PASSWORD_RECOVERY event; redirectTo → `${APP_URL}/app?flow=set-password` | Invitees land signed-in without password; must use Forgot password (bad UX) | Implemented; verified |
| R20 | Auth allow-list must accept `?flow=set-password` on /app and *.localhost dev hosts → globs in config.toml | Link falls back to site_url (still caught by type=invite hash detection; acceptable) | Implemented |
| R21 | 409 "Someone with that email already has access" for an email in ANOTHER firm is accepted for now | Minor enumeration of platform membership | Accepted short-term; revisit with rate limiting in Plan B |
| R22 | Auth emails via Resend SMTP in hosted; local keeps Mailpit (config.toml has SMTP block disabled locally) | Production emails use Supabase default sender until SMTP switched on | Implemented; documented in operations.md |
| R23 | Currency display uses currency-appropriate locale (SGD → "S$", MYR → "RM") → fix in makeMoney | Cosmetic (wrong symbol) | Deferred; users see "SGD 3,000.00" (ISO code acceptable) |
| R24 | useBalances/useLedger keep previous data while refetching (TanStack placeholderData); ledger query only enabled when its view is shown | Brief stale figures during refetch (standard TanStack behavior) | Implemented |
| R25 | useLedger pages with .range() in 1000-row chunks until a short page (PostgREST max_rows=1000 cap); hosted max_rows unchanged | Very large periods load slower (correct, not truncated) | Implemented; paging.ts handles it |
| R26 | Balance column shown only when listed rows equal scope (no status/debit/search/type narrowing, or exactly one client selected); otherwise hidden | Users see fewer balance columns when filtering (acceptable; clarity wins) | Implemented |
| R28 | Currency display uses explicit symbol map (MYR "RM", SGD "S$", USD "US$", other → ISO code) applied to Intl parts | Cosmetic; Intl alone gives ambiguous "$" for SGD | Superseded by R30 |
| R29 | client_balances gets `order by c.id` (new migration) so paging is stable above 1000 clients | None (paging works correctly now) | Implemented |
| R30 | makeMoney uses currencyDisplay 'code' for every currency (MYR, SGD, USD); import accepts amounts prefixed with RM or ISO code | Cosmetic (ISO codes instead of symbols) | Implemented |
| R31 | Statement renders loading state while either query isPlaceholderData/isPending; Print disabled until fresh | Brief loading flash on period change (acceptable) | Implemented |
| R32 | Task 12 sweeps deferred minors in files it touches or tiny ones (README APP_URL, deno.lock, logo <img> fallback) | Scope accepted; minors cleared | Implemented |
| R33 | Import currency validation: prefixed code ≠ firm currency is a row error; "RM" prefix case-insensitive, MYR firms only | Stricter import (good) | Implemented |
| R34 | Also fix cheap minors: dead undo/redo icons, README Mailpit naming, team function rejects (500, clear message) when APP_URL unset outside local | None (minors clear) | Implemented |

## Plan B implementation rulings

**Rule focus:** self-serve sign-up, early-access cap, super-admin console, trial state, homepage.

| ID | Ruling | Cost if wrong | Status |
|---|---|---|---|
| P1 | B2 may drop stray `trial@new.test` user line in test (keep trial-window assertion) | None | Implemented |
| P2–P99 | (Awaiting Plan B full review and fix cycles; will be added as work completes) | | In progress |

## Future decisions to make

| Question | Decision needed | Impact |
|---|---|---|
| Multi-currency firms (MYR + SGD in one) | D3 revision or new rule | Schema, balances, reports |
| Per-seat pricing (team size matters) | D7 revision | Billing, plan tiers |
| Recurring billing (monthly/yearly) | D7 revision | Stripe setup, renewal logic |
| Two-factor authentication | New; optional | Auth complexity |
| Single sign-on (SSO / OAuth) | New; optional | Supabase external providers |
| Custom domains per firm | New; optional | DNS, multi-tenancy, SSL |
| Data retention policy (delete after N months) | New; optional | Legal compliance, storage cost |

---

## How to add a new ruling

When a decision is made during implementation (a constraint, trade-off, ruled question, bug fix with implications):

1. **Assign an ID:** Next sequential number in the plan's series (R35 for Plan A, P3+ for Plan B)
2. **Record it here** with format: ID · Ruling · Cost if wrong
3. **Link it in git commit messages** where relevant: `Ruling R5: …` in the commit body
4. **Reference it in code comments** if it affects future changes: `// Ruling R28: explicit symbol map for currencies`

Rulings are durable; once recorded, they remain here even after the code changes. They're the decision record for future work.
