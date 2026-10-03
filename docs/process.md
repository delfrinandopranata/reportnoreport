# Process and Workflows

## How work is run

**Owner's chosen process:** brainstorm → spec → implementation plan → subagent-driven execution with embedded reviews.

### Phase 1: Brainstorming and spec

A feature or initiative starts as a brainstorm document listing goals, constraints, and rough ideas. The owner distills this into a **spec** (`docs/superpowers/specs/2026-10-03-platform-foundation-design.md`):

- **Intent:** Why this project exists and what success looks like
- **Decisions (D1–D11):** Product decisions (e.g., one currency per firm, RM 10 pricing, 14-day trial)
- **Architecture:** How the system will be built (Supabase + Vercel, RLS, etc.)
- **Data model:** Tables, relationships, constraints
- **Roles and permissions:** Who can do what
- **Screens and flows:** User journeys (public, authenticated, super-admin)
- **Errors and edge cases:** Failure modes and how the app handles them
- **Testing:** What gets tested (unit, database, E2E, equivalence)
- **Environments:** Local, dev, production setup
- **Out of scope:** What's explicitly not part of this release

The spec is a *product spec*, not a technical design; it's platform-agnostic. Ambiguity is resolved during planning, not later.

### Phase 2: Implementation planning

The owner (or an architect) converts the spec into an **implementation plan** (`docs/superpowers/plans/2026-10-03-plan-a-backend-tenancy.md`):

- **Goal:** Restated in implementation terms
- **Tech stack:** Exact tools and versions
- **Spec coverage:** Which sections of the spec this plan implements
- **Global constraints:** Naming, money representation, testing, where everything lives
- **File structure:** What gets created, modified, deleted
- **Tasks:** 10–15 discrete, sequenceable units of work (T1, T2, etc.)
  - Each task has: what it produces (frozen interfaces), what it consumes (from earlier tasks), a checklist of steps
  - Steps are specific enough that an agent can execute without guessing (run this command, edit this file, check that tests pass)
- **Wave dependencies:** Which tasks can run in parallel; which must be sequential
- **Pre-flight scan:** Check for hidden dependencies (shared files, concurrent DB resets, etc.)
- **Review focus:** Critical invariants the reviewer must check (e.g., "two concurrent sign-ups at the cap must not exceed it")

The plan is implementation-specific; it names files, commands, and technical decisions (database schemas, RLS policies, etc.).

### Phase 3: Subagent-driven execution

The owner dispatches **one agent per task** (or per logical group if tasks are tiny). Each agent:

1. **Reads the plan** and task description
2. **Reads the spec** for context
3. **Implements the task** (code, tests, verification)
4. **Self-reviews the diff** against the plan and the spec
5. **Commits** with a conventional message: `type: short description` (no tool-branding trailers)

After all tasks are implemented:

- **Independent reviewer** (separate agent, read-only) checks the code against the plan spec and the implementation spec
- **Bug fixer** (same agent that implemented the task) fixes any findings, tests, commits
- **UI/UX improver** (only for tasks with screens) reviews against the design system
- **Orchestrator** (the owner or a senior) coordinates fixes, decides on trade-offs (rulings), batches fixes into waves, and tracks progress in a **progress ledger** (`.superpowers/sdd/<plan>/progress.md`)

The progress ledger is **git-ignored** (not committed); it's the live source of truth during execution. Rulings are decisions made mid-run (e.g., "RLS-blocked updates report success; call this a conflict, not a permission error"). Rulings are later incorporated into [decisions.md](./decisions.md).

### Execution modes (Plan A vs Plan B)

**Plan A (executed by the owner with sonnet agents):** Independent tasks run in parallel; one final review stage (code reviewer + QA + UI/UX) after all tasks. Fixes flow back through the implementers.

**Plan B (executed with haiku agents per user directive):** Per-task pipeline: build → independent reviewer → bug fixer → scoped re-review → UI/UX pass. Reviewers send fix requests directly to implementers via SendMessage. No final whole-branch review (owner choice).

Both modes use the same plan structure and ledger.

## Commit conventions

**Format:** `<type>: <description>` where type is one of:
- `feat:` — new feature or task (e.g., `feat: implement schema and migrations`)
- `fix:` — bug fix (e.g., `fix: concurrent sign-ups respect the cap`)
- `refactor:` — code reorganisation without behaviour change
- `test:` — test additions or fixes (not usually a standalone commit; usually bundled with feat/fix)
- `docs:` — documentation changes
- `style:` — formatting only (none: we don't run Prettier)
- `chore:` — tooling, setup, deps (e.g., `chore: add oxlint`)

**Message body** (optional but encouraged):
- Explain *why* the change is needed (the problem it solves)
- If a ruling applies, cite it: `Ruling R5: …`
- If a test is added, name the scenario

**Examples:**
```
feat: implement sign-up with early-access cap

Self-serve firms are capped at platform_settings.firm_cap (default 5).
The check runs under a row lock in create_firm_for_current_user to prevent
two concurrent sign-ups from exceeding the cap (Ruling P1).

- platform_status() returns {"accepting_signups": boolean}
- join_waitlist() adds to waitlist (rate-limited per email per 24h)
- create_firm_for_current_user() checks cap, locks platform_settings row

Test: 11_signup.test.sql covers cap enforcement and race conditions.
```

```
fix: balance column hidden when ledger is filtered

When users filter by status, debit, client, or bank account, the running
balance is no longer meaningful (Ruling R26). Show it only when the list
matches the full ledger scope.

- useLedger checks if filtering is active
- ClientsPage passes show_running_balance to the table
- Tests: t10_clients.browser verifies behaviour
```

**No tool-branding trailers** — no "Co-Authored-By: Claude", no "Generated by", no Cursor/Claude/AI metadata.

**One commit per task** (roughly) — keeps history readable and makes reverts easy. Emergency hotfixes can be one-liner commits; normal work groups related changes.

## Pull requests

**Title:** Short (under 70 chars), references the plan and task if applicable.
- ✓ `Plan B: self-serve sign-up with cap and waitlist`
- ✓ `fix: cap enforcement race condition`
- ✗ `Claude implemented tasks B1 and B2`
- ✗ `various fixes (very vague)`

**Body:**
- **Summary:** 1–3 bullets of what changed and why
- **Test plan:** Checklist of manual tests or automated checks (e.g., "Run `supabase test db`", "Sign up at cap edge, verify waitlist")
- **Notes:** Known limitations, deferred items, decisions that diverge from the plan

**Example:**
```markdown
## Summary
- Move app to /app/ alongside a static homepage at /
- Add multi-page Vite build (home + app)
- Redirect /app → /app/ (cleanURLs in Vercel)
- Update Supabase Auth redirects for /app/?flow=set-password

## Test plan
- [ ] `pnpm build` produces dist/index.html and dist/app/
- [ ] Local dev: http://localhost:5199/ shows minimal homepage
- [ ] http://localhost:5199/app/ shows sign-in
- [ ] Sign-in after invitation links to /app/?flow=set-password
- [ ] oxlint, tsc, pnpm test all pass

## Notes
- B1 is complete; B2–B8 will build on this entry-point split
- Redirect globs in config.toml are temporary (host-specific); production values in operations.md
```

**Reviewers:** None assigned (no `--reviewer` / `-r` flag). The owner or a designated reviewer will read the PR before merging.

**Auto-merge:** Off unless explicitly requested (not the default).

## Testing and verification

**During development (per-task):**
- Unit tests: `pnpm test`
- Database tests: `supabase test db`
- Edge Function tests: `deno test supabase/functions`
- Type checking: `npx tsc -p tsconfig.app.json --noEmit`
- Linting: `npx oxlint src`
- Build: `pnpm build`

All must pass before a task is marked done. Failures block the commit.

**Before merging a PR:**
- All tests pass (automated on PR)
- Code review passes (human, optional until final stage)
- Manual smoke test on staging (if available; otherwise, on production after merge)

**On production deployment:**
- Smoke tests: [operations.md](./operations.md) § Go-live smoke tests
- Monitor: Vercel logs, Supabase logs, email delivery (Resend), and (once Plan C is live) Stripe payments

## Decision-making and rulings

When a decision is needed mid-task (a trade-off, a deviation from the plan, a bug-fix implication), the reviewer and implementer (or the owner) discuss it and record a **ruling** with:

- **ID:** Sequential in the plan series (R35 for Plan A, P3 for Plan B)
- **Ruling:** What was decided and why
- **Cost if wrong:** What fails if this decision is reversed (helps future developers understand the stakes)

Examples:
- `R5: firm_write_block_reason called with any firm_id → short-term acceptable to return null for other firms; guard added anyway` (security decision; documented rationale)
- `R30: makeMoney uses currencyDisplay 'code' for all currencies` (display decision; supersedes earlier R28)
- `P1: B2 may drop stray trial@new.test user in test` (minor cleanup)

Rulings are recorded in the progress ledger during execution, then moved to [decisions.md](./decisions.md) at project completion.

## Knowledge and memory

### Files of record

1. **Spec:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` — what to build
2. **Plan:** `docs/superpowers/plans/2026-10-03-plan-*.md` — how to build it
3. **Progress ledger:** `.superpowers/sdd/2026-10-03-plan-*/progress.md` (git-ignored) — who did what and decisions made
4. **Decisions:** `docs/decisions.md` — rulings and trade-offs (canonical copy; progress ledger is ephemeral)
5. **Architecture:** `docs/architecture.md` — how the system works
6. **Data model:** `docs/data-model-and-security.md` — tables, RLS, SQL functions

### What goes where

| Artifact | Location | Audience | Purpose |
|---|---|---|---|
| Spec (product goals, decisions) | docs/superpowers/specs/ | Product + engineering | Establish *what* to build |
| Plan (tasks, steps, file changes) | docs/superpowers/plans/ | Engineering | Establish *how* to build it |
| Progress ledger (commits, fixes, rulings) | .superpowers/sdd/<plan>/progress.md | Orchestrator + reviewers | Live execution record (git-ignored) |
| Decisions (durable rulings) | docs/decisions.md | All future developers | Why decisions were made |
| Code quality observations (deferred minors, tech debt) | docs/status-and-roadmap.md | Future work | What to tackle next |
| Architecture and schemas | docs/architecture.md, docs/data-model-and-security.md | All developers | How the system is built |
| Setup and testing | docs/development.md, docs/operations.md | All developers | How to work locally and deploy |

Sketch notes (whiteboarding, brainstorms, discussions) live in planning documents or PR threads, not in committed files. They're ephemeral; capture insights in the spec or decisions, then discard the sketches.

## Reviews

**Review workflow (Haiku agents, Plan B onwards):**
- **Implementer** (Haiku): reads the task, builds it, self-reviews the diff, commits
- **Independent reviewer** (separate Haiku): reads the code and spec, sends findings to the implementer via SendMessage
- **Implementer** (Haiku): receives fix requests, implements fixes, commits
- **Scoped re-review** (Haiku): verifies the fixes are correct

**The rule:** No commit without a self-review of the diff. No PR merge without a code review.

**Plan A (completed):** Used one final review stage (senior code reviewer + QA + UI/UX in parallel) after all tasks, then one fix wave. This project later switched to per-task reviews (Plan B onwards) for faster feedback.

## Handoff and continuity

When a session ends:
1. **Commit all work** (or stash, with rationale)
2. **Update the progress ledger** with the latest state (which tasks are done, what's next)
3. **Document any blockers** (e.g., "waiting for Stripe keys" → note in the ledger and status.md)
4. **Update status-and-roadmap.md** with the current state and next steps

On resumption:
1. **Read the progress ledger** (the live source of truth)
2. **Check git log** to see what was committed since last session
3. **Read the plan** if it's a continuation
4. **Continue from the next incomplete task**

### Example resume session:

```bash
cd /Users/delfrinando/ntucsm/platform-internal
git checkout feat/self-serve-console
cat .superpowers/sdd/2026-10-03-plan-b-self-serve-console/progress.md  # read the ledger
git log --oneline -20  # see recent work
git status  # check for uncommitted changes
supabase start
/opt/homebrew/bin/pnpm dev  # continue from here
```

---

## Continuous improvement

After each plan completes:
1. **Retrospective:** What went well? What was hard? What would we do differently?
2. **Process update:** Adjust the process docs if patterns emerge (e.g., "Task X always needs a Y check")
3. **Template evolution:** Improve the spec and plan templates for future projects

This project's process is captured here. It's not dogma; if it gets in the way of shipping, change it and document why.
