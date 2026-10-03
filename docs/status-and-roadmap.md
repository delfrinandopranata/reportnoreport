# Status and Roadmap

## Plan A completion status (merged to main)

**Plan A — Backend and Tenancy Implementation** is complete. Merged to main via PR #1 (commit f9fb04c).

### What's done

- Supabase project locally and hosted (schema, migrations, Auth, Edge Functions)
- All 13 Tasks completed and review-passed
- RLS enforces per-firm data isolation
- Role-based permissions (`owner`, `admin`, `accountant`, `viewer`)
- Server-computed balances and ledgers via SQL functions
- Team invites, role changes, suspensions via `team` Edge Function
- Change log for audit trail
- pgTAP tests passing (database schema, isolation, roles, invariants, writes, ledger, import, team, signup)
- Unit tests passing (Node.js `--test`)
- Browser equivalence test passing (Postgres functions = browser maths)
- Edge Function tests passing (Deno)
- Email via Resend SMTP (branded templates for invite, recovery, confirmation, email_change)
- Typecheck and lint clean (oxlint, TypeScript)

### Known limitations from Plan A review

- Invite links expire after 24h (hosted Supabase max; local is 7 days per config)
- Email enumeration possible with exact-email guesses (Rate limiting deferred to Plan B)
- Currency display uses ISO codes (MYR, SGD, USD) instead of symbols (acceptable; cosmetic)
- No custom currency symbol support (future work)
- No soft-delete for clients (deleted clients appear in change_log only)

### Code quality

- All 34 rulings from Plan A ledger captured in [decisions.md](./decisions.md)
- No tech debt with hard deadlines
- Deferred minors (low-cost items for later): otp_expiry comment, logo <img> missing-file fallback, network-failure English-only, stray deno.lock, README APP_URL step

---

## Plan B status (in progress on feat/self-serve-console)

**Plan B — Homepage, Self-Serve Trial and Super-Admin Console** is in progress. Expected completion: this week.

### What's done

- **B1:** App moved to `/app/`, homepage at `/` ✓
- **B2:** Sign-up, cap, waitlist functions ✓
- **B8:** Demo build script ✓

### What's in progress (as of 2026-10-03 22:00)

- **B5:** Homepage (index.html, src/home/home.ts) — marketing page, sign-up button, waitlist form, pricing line
  - Uncommitted changes: `index.html`, `src/home/home.ts`
  - Review pending from haiku agent
  - Plan: fix → merged into B5 completion

### What's next (not yet started)

- **B3:** `admin` Edge Function (super-admin operations: create firm, suspend, extend trial, mark complimentary, support view)
- **B4:** Sign-up UI (sign-up form, currency select, session context changes for first-sign-in firm creation)
- **B6:** Trial banner and trial state display (days left, trial expired, read-only warning)
- **B7:** Super-admin console UI (firms list, create, actions, platform settings, waitlist view)
- **B9:** Documentation, verification, push to main

### Dependencies and ordering

Tasks B3, B4, B6 can run in parallel (they're independent). B7 needs stubs from B3 + B4. B9 is final.

Estimated timeline (with haiku agents per Plan B execution mode):
- B3/B4/B6 concurrent: 1 day each + reviews + fixes
- B7: 1 day (console UI) + review + fixes
- B9: 1 day (docs + verification) + push

Rough estimate: 5–7 days from 2026-10-03 with 1 agent per task concurrently, reviews in parallel, fixes serial.

### Deferred from Plan B (to Plan C)

- RM 10 payment flow (Stripe Checkout, webhook, payment confirmation)
- Refund handling (payment refunded → read_only state)
- Billing history and receipts

---

## Plan C (next: Stripe payment)

**Plan C — Stripe One-Time Billing** adds the payment flow.

### To do

- `billing-checkout` Edge Function (create Stripe Checkout Session, caller must be owner)
- `stripe-webhook` Edge Function (verify signature, record payment/refund, update billing_status)
- Stripe integration tests (Deno)
- "Pay RM 10" button and Stripe Checkout flow in the UI
- Success page and polling for webhook confirmation
- Refund handling (marks firm read_only)
- Full E2E test: trial → pay via Stripe → paid state

### Not blocked by anything; can start after Plan B merges to main

**Spec coverage:** Plan C implements §5 item 12 (Pay flow), §6 (Stripe security), §7 item 3 (Stripe E2E testing), §8 (Stripe test mode → live).

**Prerequisites:** Stripe account (test and live), API keys, webhook signing secret, hosted Supabase secrets configured.

---

## Plan D (future: onboarding)

**Plan D — Onboarding and Guided Setup** adds the product tour, checklist, and sample data UX.

### To do

- In-house product tour component (spotlight + popovers, no external library)
- Tour steps per role (owners/admins see more; viewers see fewer)
- Tour progress saved to `user_preferences`
- "Get started" checklist (complete profile, invite team, add client, post transaction)
- Checklist items self-tick when conditions met (no manual "Mark done")
- "Load sample data" button and sample data removal UI
- Sample data banner: "You're exploring with sample data · **Remove**"

### Spec coverage:** Plan D implements §5 items 4–6 (tour, checklist, sample data), §7 item 5 (sample data E2E testing).

---

## Later sub-projects (not yet planned)

**Spec §1 sub-project map lists two areas for future work:**
- Trust and compliance: audit views, locked periods, bank reconciliation
- Client communication: emailed statements, reminders, client portal

These require a separate planning phase and are deferred until demand justifies them.

---

## Minor deferred items checklist

These are low-cost fixes that improve the product but are not blockers. Review before each major release.

| Item | Reason deferred | Fix effort | Priority |
|---|---|---|---|
| Otp_expiry comment says 7 days (actually 24h) | Low impact; docs corrected elsewhere | 5 min | low |
| Invite rate-limiting for cross-firm enumeration (R21) | Needs discussion of acceptable risk; currently minimal (exact email required) | 1 day | medium |
| Logo <img> missing-file fallback | Edge case (logo path stored but file deleted); graceful degradation | 30 min | low |
| Currency symbols per locale (e.g., "S$" for SGD) | Cosmetic; ISO codes are unambiguous | 1 day | low |
| Network error messages (English only) | Rare; needs i18n setup | 1 day | low |
| Stray deno.lock (from Edge Function tests) | Pins Deno deps; safe to commit; not critical | commit | low |
| README APP_URL step | Documented in operations.md; redundant | 5 min | very-low |
| Statement stale placeholder during refetch | Rare; user can wait 100ms | 30 min | very-low |

---

## How to resume work

### To continue Plan B

1. **Current branch:** `feat/self-serve-console` (based on main @ 8a32ccf)
2. **Current state:** B1 ✓, B2 ✓, B8 ✓, B5 in progress (awaiting review)
3. **Next steps:**
   - Review and fix B5 (homepage)
   - Dispatch B3/B4/B6 in parallel (admin function, sign-up UI, trial banner)
   - Merge fixes and B3/B4/B6 completions to feat/self-serve-console
   - B7 (console UI) after B3/B4
   - B9 (final docs and push to main)
4. **Commands:**
   ```bash
   cd /Users/delfrinando/ntucsm/platform-internal
   git checkout feat/self-serve-console
   git log --oneline -10  # see recent commits
   git status  # check B5 uncommitted changes
   supabase start  # local Supabase
   /opt/homebrew/bin/pnpm install
   /opt/homebrew/bin/pnpm dev  # browse http://localhost:5199/app/
   ```

### To start Plan C (Stripe)

1. **Branch:** `feat/stripe-billing` (from main after Plan B merges)
2. **Prerequisites:**
   - Stripe account (test and live modes)
   - API keys and webhook secret
   - Hosted Supabase project with secrets configured
3. **Spec reference:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` § Pricing, § Errors › Stripe, § Testing item 3
4. **Tasks:** ~5 tasks (Edge Function, checkout flow, webhook, tests, E2E)
5. **Create a plan:** `docs/superpowers/plans/2026-10-03-plan-c-stripe-billing.md` (use Plan A/B as templates)

### To start Plan D (onboarding)

1. **Branch:** `feat/onboarding` (from main after Plan B merges)
2. **No external dependencies**
3. **Spec reference:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` § Onboarding, § Sample data
4. **Tasks:** ~4 tasks (tour component, checklist, sample data UI, tests)

---

## Logs and observability

**Not yet set up:** alerting, uptime checks, error tracking, metrics collection, dashboards.

**Available once live:**
- **Postgres logs:** Supabase dashboard › Logs (queries, slowest queries, replication)
- **Auth logs:** Supabase dashboard › Authentication › Auth logs
- **Edge Function logs:** Supabase dashboard › Edge Functions › Logs (requests, errors)
- **Frontend logs:** Vercel dashboard › Deployments › Logs and Runtime Logs
- **Email delivery:** Resend dashboard › Emails (open rates, bounces, clicks)

**Metrics you can query post-launch:**
- `select count(*) from firms where source = 'self_serve'` — self-serve sign-ups
- `select count(*) from firms where status = 'active'` — active firms
- `select count(*) from profiles where status = 'active'` — active users per firm

---

## CI/CD and deployment strategy

**Local development:**
- `git checkout feat/self-serve-console` (or appropriate branch)
- `supabase start && pnpm dev`
- `pnpm test`, `supabase test db`, `deno test supabase/functions`

**Hosted dev (future):**
- Supabase hosted project (DEV) with DB tunnel
- Stripe test mode
- Vercel preview deployment on every PR

**Production:**
- Main branch auto-deploys to Vercel
- Migrations applied via `supabase db push` (after testing locally)
- Stripe live mode
- No rollback; create fix migrations instead

**Promotion process:**
1. Feature branch (e.g., `feat/self-serve-console`) with plan and progress ledger
2. Local testing (all test suites pass)
3. PR review (code quality, spec adherence)
4. Merge to main
5. Vercel auto-deploys
6. Manual Supabase schema deployment (if migrations added)
7. Smoke tests on production

---

## Questions? Next steps?

- **For Plan B continuation:** Check the plan at `docs/superpowers/plans/2026-10-03-plan-b-self-serve-console.md` and the progress ledger at `.superpowers/sdd/2026-10-03-plan-b-self-serve-console/progress.md`
- **For Plan C/D:** Create a plan document (template: Plan B plan), brief it, dispatch agents
- **For questions on decisions:** See [decisions.md](./decisions.md) for all rulings with rationale
- **For architecture:** See [architecture.md](./architecture.md) and [data-model-and-security.md](./data-model-and-security.md)
