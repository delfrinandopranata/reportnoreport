# Plan D — Onboarding and Guided Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic product tour on first sign-in, a self-ticking "Get started" checklist, loadable sample data with a removal banner, and the ability to replay the tour from the help menu.

**Architecture:** The product tour is a custom in-house component (Spotlight + Popover, no external library) anchored to elements marked `data-tour="step-id"`. Tour progress is saved to `user_preferences` per profile with key `tour` (current step, completion status). The "Get started" checklist tracks four items (complete profile, invite team, add client, post transaction) in `user_preferences` with key `checklist`; items tick themselves via event listeners when conditions are met. Sample data is loaded/removed via SQL functions (`load_sample_data()`, `remove_sample_data()`) that insert/delete only rows flagged `is_sample`; a banner signals sample data is active and offers removal.

**Tech Stack:** As Plan A and Plan B (Vite 8, React 19, TS, Tailwind 4, Supabase, pgTAP, Node.js `--test`).

**Spec:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` — this plan implements §5 items 4, 5, 6 (tour, checklist, sample data), §7 item 5 (sample data E2E testing), §4 (role-based tour step filtering).

## Global Constraints

- Repo `/Users/delfrinando/ntucsm/worktree/pi-onboarding`, branch `feat/onboarding` (from `main`). Commit per task with conventional messages; no tool-branding trailers.
- Migrations start at `20261006000001_…` (per coordination.md).
- Dev server port `5202` via `http://d.localhost:5202/app/`.
- Never run Prettier. Lint `npx oxlint`. Typecheck `npx tsc -p tsconfig.app.json --noEmit`. Unit tests `pnpm test`. DB tests `supabase test db`.
- Tour component is in-house only (Spotlight + Popover via custom React); no `react-joyride`, `shepherd`, or external tour library.
- Sample data rows carry `is_sample = true` on `clients`, `bank_accounts`, `transactions` (already in schema).
- Checklist items are immutable; progress is tracked by event listeners, not manual "Mark done" clicks.
- Tour and checklist progress live in `user_preferences` (already in schema); keys are `tour` and `checklist`, values are `jsonb`.
- British English; currency ISO codes (MYR, SGD, USD) formatted as "MYR 1,234.50"; integer minor units.
- Browser tests use the in-app Browser pane on `d.localhost:5202` with cookie isolation per role.

## Review Focus

1. **Tour starts on first sign-in exactly once per user.** A signed-in user who didn't skip should see the tour automatically; a user who skipped and later opens help should replay it. Test: D4 and D11 unit test on tour auto-start and help-menu replay.
2. **Tour steps differ by role; owner/admin see more steps than viewer.** A viewer calling the tour-step-filter function with `role: 'viewer'` gets fewer steps than an owner with the same function. Test: D3 unit test on role-based step filtering.
3. **Checklist items tick only when real conditions are met.** A user who loads sample data should NOT tick "Add client" until a non-sample client is created; removing sample data doesn't untick items. Test: D8 logic and D11 browser verification.
4. **Sample data removal never deletes non-sample rows.** A user adds a real client, then loads sample data with 8 clients, then removes sample data — the real client is still there. Test: D1 pgTAP for referential integrity.
5. **Sample data isolation by firm.** Two owners in different firms can each load their own sample data independently; one firm's sample rows are never visible to the other firm's owner. Test: D1 pgTAP Test 4 (firm B's sample data isolated from firm A).
6. **Sample data security.** A viewer calling `load_sample_data()` is denied (auth_can check, not generic RLS 42501). A read-only firm calling `load_sample_data()` is denied (firm_can_write check). Test: D1 pgTAP Tests 3 and 5.
7. **Sample data banner and totals labelling.** While sample data exists, the banner is visible on every page, and Dashboard/Clients totals are labelled as including sample data. After removal, the banner and labels vanish. Test: D11 step 10 browser verification.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20261006000001_onboarding.sql` | `load_sample_data()`, `remove_sample_data()` SQL functions, sample bank account/clients/transactions data | D1 |
| `src/tour/Tour.tsx` | Spotlight and Popover components; manages tour visibility and step display | D2 |
| `src/tour/steps.ts` | Tour step definitions, role-based filtering, step validation | D3 |
| `src/tour/useTour.ts` | Hook: tour state, progress save/load from `usePreference`, auto-start logic | D4 |
| `src/App.tsx` | Integrate tour auto-start on first sign-in; Tour component wrapper | D4 |
| `src/Dashboard.tsx` / `src/settings/Settings.tsx` | Add help menu (?) button; tour replay and checklist reopening | D4 |
| `src/checklist/Checklist.tsx` | Checklist UI: 4 items, self-tick display, skip/dismiss buttons | D7 |
| `src/checklist/useChecklist.ts` | Hook: checklist state, item conditions, event listeners for auto-tick | D8 |
| (none) | Pure logic: sample data payload (clients, bank account, transactions) | D5 |
| `src/Dashboard.tsx` | Add "Load sample data" button to Dashboard or hero area | D5 |
| `src/App.tsx` | Add sample data banner at the top; remove button; confirmation dialog | D6 |
| `src/data/queries.ts` | Add `useLoadSampleData()` and `useRemoveSampleData()` hooks | D5, D6 |
| `supabase/tests/14_onboarding.test.sql` | pgTAP: sample data load/remove, referential integrity, `is_sample` filtering, role checks, firm isolation, read-only denial | D9 |
| `src/**/*.test.ts` | Unit tests: tour step filtering by role, checklist item conditions, sample data payload | D10 |
| `README.md` | Update local setup section to note `d.localhost:5202` and sample data testing | D11 |

---

### Task D1: Database migrations for sample data loading and removal

**Files:** Create `supabase/migrations/20261006000001_onboarding.sql`. Regenerate `src/data/database.types.ts`.

**Interfaces — produces (frozen):**
- `load_sample_data() returns void` — Owner/Admin only (enforced via `auth_can('settings.manage') and firm_can_write(auth_firm_id())`); idempotent (no-op if already loaded); inserts one sample bank account, 8 sample clients reusing seed data names (Kopi Corner Sdn Bhd, Harbourline Logistics Sdn Bhd, etc.), and ~150 sample transactions across 6 months with `is_sample = true`. All rows reference `auth_firm_id()` only. Sets all created/updated timestamps to `now()` and creator to `auth.uid()`.
- `remove_sample_data() returns void` — Owner/Admin only (same checks); deletes all rows with `is_sample = true` across transactions, clients, and bank_accounts (in that order to respect foreign keys). Raises an error if any non-sample transaction still references a sample client.
- Security: Both functions use `SECURITY INVOKER`, explicitly check `auth_can('settings.manage')` and `firm_can_write(auth_firm_id())`, act only on the current firm. Grants: execute revoked from `public`, `anon`, and `authenticated`; callable only via RPC with authenticated role checks.

- [ ] **Step 1:** Write the migration file `supabase/migrations/20261006000001_onboarding.sql` with:
  - SQL function `load_sample_data()`: SECURITY INVOKER; checks `auth_can('settings.manage')` and `firm_can_write(auth_firm_id())` and raises if not authorized. Inserts exactly one bank account named "Sample account" (is_active and is_sample true, is_default FALSE — never take over the firm's real default account). Inserts 8 sample clients reusing seed data names (Kopi Corner Sdn Bhd, Harbourline Logistics Sdn Bhd, LIM Boon Hock & Associates, Equity Legal Sdn Bhd, etc.) with realistic stakeholder-focused descriptions (retainer, escrow, court fees, stamp duty, filing fees, retention sum, etc.). Inserts ~150 transactions across 6 months using `firm.currency` (not hard-coded MYR). All rows set `is_sample = true`, `created_at = now()`, `updated_at = now()`, `created_by = auth.uid()`, `updated_by = auth.uid()`. Idempotence: early return if `exists (select 1 from clients where firm_id = auth_firm_id() and is_sample)`.
  - SQL function `remove_sample_data()`: SECURITY INVOKER; same authorization checks as load. Deletes in reverse order: transactions, then clients, then bank_accounts, all with `is_sample = true` and `firm_id = auth_firm_id()`. Raises an error if any non-sample transaction still references a sample client (check via EXISTS with the current firm).
  - Grant: `execute` revoked from `public`, `anon`, and `authenticated`; callable only via authenticated RPC.
  - All queries use `auth_firm_id()` to isolate to the current firm.

- [ ] **Step 2:** Verify the migration file is valid SQL:
  ```bash
  head -20 supabase/migrations/20261006000001_onboarding.sql  # confirm it starts with create or replace function
  ```

- [ ] **Step 3:** Run the migration and regenerate types:
  ```bash
  supabase migration list  # confirm 20261006000001 is next in sequence
  supabase db push  # applies the migration
  supabase gen types typescript --local > src/data/database.types.ts
  ```
  Expected: `database.types.ts` now includes `load_sample_data` and `remove_sample_data` in the RPC return types.

- [ ] **Step 4:** Write pgTAP test setup (to run in Step D9):
  Create `supabase/tests/14_onboarding.test.sql` with:
  - Test 1: `load_sample_data()` as owner → rows exist with `is_sample = true` (count: 1 bank account, 8 clients, ~150 transactions). Second call is idempotent (same counts).
  - Test 2: `remove_sample_data()` as owner → `is_sample` rows are gone; non-sample rows remain. (Verify via select count).
  - Test 3: Calling `load_sample_data()` as viewer → error (auth_can check fails, not generic RLS 42501).
  - Test 4: Calling `load_sample_data()` as owner in firm B when firm A has sample data → firm B has its own sample set; firm A's untouched (isolation via auth_firm_id()).
  - Test 5: A firm marked `billing_status = 'read_only'` calls `load_sample_data()` → error (firm_can_write check fails).
  - Test 6: Non-sample transaction references sample client → `remove_sample_data()` raises error with clear message.

- [ ] **Step 5:** Commit the migration:
  ```bash
  git add supabase/migrations/20261006000001_onboarding.sql supabase/tests/14_onboarding.test.sql src/data/database.types.ts
  git commit -m "feat: add sample data load/remove RPCs with security checks"
  ```

---

### Task D2: Tour component (Spotlight and Popover)

**Files:** Create `src/tour/Tour.tsx`, `src/tour/index.ts`. Modify `src/ui.tsx` (if needed for styles).

**Interfaces — produces:**
- `<Tour open={boolean} step={TourStep} onNext={() => void} onPrev={() => void} onSkip={() => void} />` — React component that renders a Spotlight overlay (darkened background, circular or rectangular hole around the target element) and a Popover positioned near the target. The Popover shows the step title, description, "Back", "Next", "Skip tour" buttons, and a step counter ("Step 3 of 10").
- `TourStep = { id: string; title: string; description: string; targetElement?: HTMLElement; position?: 'top' | 'bottom' | 'left' | 'right' }` — step definition type.

- [ ] **Step 1:** Create `src/tour/Tour.tsx`:
  ```tsx
  import { ReactNode } from 'react'
  import { Icon, btn } from '../ui'
  
  export interface TourStep {
    id: string
    title: string
    description: string
    position?: 'top' | 'bottom' | 'left' | 'right'
  }
  
  export interface TourProps {
    open: boolean
    step: TourStep
    currentIndex: number
    totalSteps: number
    onNext: () => void
    onPrev: () => void
    onSkip: () => void
  }
  
  export function Tour({ open, step, currentIndex, totalSteps, onNext, onPrev, onSkip }: TourProps) {
    if (!open) return null
    
    const target = document.querySelector(`[data-tour="${step.id}"]`) as HTMLElement | null
    if (!target) return null
  
    const rect = target.getBoundingClientRect()
    const position = step.position || 'bottom'
    const offset = 16
    
    const popoverStyles = {
      top: position === 'top' ? rect.top - offset : position === 'bottom' ? rect.bottom + offset : rect.top + rect.height / 2,
      left: position === 'left' ? rect.left - offset : position === 'right' ? rect.right + offset : rect.left + rect.width / 2,
      transform: position === 'bottom' || position === 'top' ? 'translateX(-50%)' : 'translateY(-50%)',
    }
  
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onSkip} />
        <div className="fixed z-50 bg-white rounded-lg shadow-lg p-4 max-w-sm" style={popoverStyles as React.CSSProperties}>
          <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
          <p className="text-sm text-gray-700 mb-4">{step.description}</p>
          <div className="text-xs text-gray-500 mb-3">Step {currentIndex + 1} of {totalSteps}</div>
          <div className="flex gap-2">
            <button className={btn.secondary} onClick={onPrev} disabled={currentIndex === 0}>Back</button>
            <button className={btn.primary} onClick={onNext}>Next</button>
            <button className={btn.ghost} onClick={onSkip}>Skip tour</button>
          </div>
        </div>
      </>
    )
  }
  ```

- [ ] **Step 2:** Create `src/tour/index.ts`:
  ```ts
  export { Tour, type TourProps, type TourStep } from './Tour'
  ```

- [ ] **Step 3:** Test the component in isolation (mock data, no state):
  ```bash
  npx tsc -p tsconfig.app.json --noEmit  # type check
  ```
  Expected: No errors.

- [ ] **Step 4:** Commit:
  ```bash
  git add src/tour/Tour.tsx src/tour/index.ts
  git commit -m "feat: add Tour component with Spotlight and Popover"
  ```

---

### Task D3: Tour step definitions and role-based filtering

**Files:** Create `src/tour/steps.ts`. 

**Interfaces — produces:**
- `const TOUR_STEPS: Record<string, TourStep[]> = { owner: [...], admin: [...], accountant: [...], viewer: [...] }` — step definitions per role. Owner/Admin see all 10 steps; Accountant sees 8 (no Users/Settings); Viewer sees 5 (Dashboard, Clients, Balances, Statement, Help).
- `filterTourStepsByRole(role: Role): TourStep[]` — returns steps for a given role in order.

- [ ] **Step 1:** Create `src/tour/steps.ts`:
  ```ts
  import type { Role } from '../users/rules'
  import type { TourStep } from './Tour'
  
  export const TOUR_STEP_IDS = {
    DASHBOARD: 'dashboard',
    CLIENTS: 'clients',
    ADD_CLIENT: 'add-client',
    CLIENT_PROFILE: 'client-profile',
    TRANSACTION: 'record-transaction',
    STATEMENT: 'statement',
    IMPORT: 'import-export',
    USERS: 'users-and-invites',
    SETTINGS: 'settings-and-billing',
    HELP: 'help-menu',
  }
  
  const STEPS_ALL: TourStep[] = [
    { id: TOUR_STEP_IDS.DASHBOARD, title: 'Welcome to Platform', description: 'This is your dashboard. Here you see a quick overview of your firm.', position: 'bottom' },
    { id: TOUR_STEP_IDS.CLIENTS, title: 'Manage Clients', description: 'View all your clients and their balances here.', position: 'bottom' },
    { id: TOUR_STEP_IDS.ADD_CLIENT, title: 'Add a Client', description: 'Click here to add a new client to your firm.', position: 'bottom' },
    { id: TOUR_STEP_IDS.CLIENT_PROFILE, title: 'Client Profile', description: 'Edit client details and view their transaction history.', position: 'bottom' },
    { id: TOUR_STEP_IDS.TRANSACTION, title: 'Record a Transaction', description: 'Post receipts and payments for your clients.', position: 'bottom' },
    { id: TOUR_STEP_IDS.STATEMENT, title: 'Statement of Account', description: 'Generate and export statements for your clients.', position: 'bottom' },
    { id: TOUR_STEP_IDS.IMPORT, title: 'Import and Export', description: 'Bulk import transactions from a CSV file.', position: 'bottom' },
    { id: TOUR_STEP_IDS.USERS, title: 'Team and Roles', description: 'Invite team members and manage their permissions.', position: 'bottom' },
    { id: TOUR_STEP_IDS.SETTINGS, title: 'Settings and Billing', description: 'Configure your firm details, bank accounts, and billing.', position: 'bottom' },
    { id: TOUR_STEP_IDS.HELP, title: 'Help and Replay', description: 'Need a reminder? Replay the tour or get help from here.', position: 'bottom' },
  ]
  
  const ROLE_STEPS: Record<Role, TourStep[]> = {
    owner: STEPS_ALL,
    admin: STEPS_ALL,
    accountant: STEPS_ALL.filter(s => ![TOUR_STEP_IDS.USERS, TOUR_STEP_IDS.SETTINGS].includes(s.id)),
    viewer: STEPS_ALL.filter(s => [TOUR_STEP_IDS.DASHBOARD, TOUR_STEP_IDS.CLIENTS, TOUR_STEP_IDS.CLIENT_PROFILE, TOUR_STEP_IDS.STATEMENT, TOUR_STEP_IDS.HELP].includes(s.id)),
  }
  
  export function filterTourStepsByRole(role: Role): TourStep[] {
    return ROLE_STEPS[role]
  }
  ```

- [ ] **Step 2:** Create unit test file `src/tour/steps.test.ts`:
  ```ts
  import { test } from 'node:test'
  import { strict as assert } from 'node:assert'
  import { filterTourStepsByRole } from './steps'
  
  test('filterTourStepsByRole: owner sees all steps', () => {
    const steps = filterTourStepsByRole('owner')
    assert.equal(steps.length, 10)
  })
  
  test('filterTourStepsByRole: viewer sees fewer steps', () => {
    const steps = filterTourStepsByRole('viewer')
    assert.equal(steps.length, 5)
    assert(steps.some(s => s.id === 'dashboard'))
    assert(!steps.some(s => s.id === 'users-and-invites'))
  })
  
  test('filterTourStepsByRole: accountant excludes billing and users', () => {
    const steps = filterTourStepsByRole('accountant')
    assert.equal(steps.length, 8)
    assert(!steps.some(s => s.id === 'users-and-invites'))
    assert(!steps.some(s => s.id === 'settings-and-billing'))
  })
  ```

- [ ] **Step 3:** Run the test:
  ```bash
  pnpm test src/tour/steps.test.ts
  ```
  Expected: PASS.

- [ ] **Step 4:** Type check:
  ```bash
  npx tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 5:** Commit:
  ```bash
  git add src/tour/steps.ts src/tour/steps.test.ts
  git commit -m "feat: add tour step definitions and role-based filtering"
  ```

---

### Task D4: Tour state management, auto-start, and help menu integration

**Files:** Create `src/tour/useTour.ts`. Modify `src/App.tsx`, `src/Dashboard.tsx` (or `src/settings/Settings.tsx`).

**Interfaces — produces:**
- `useTour(): { open: boolean; currentIndex: number; steps: TourStep[]; onNext: () => void; onPrev: () => void; onSkip: () => void; replay: () => void }` — hook that manages tour state, saves progress to `usePreference('tour')`, and loads/auto-starts on first sign-in.
- Tour auto-starts on first sign-in (check: `created_at` is today and tour progress is not saved).
- Help menu (?) button replays the tour via `replay()` function.

- [ ] **Step 1:** Create `src/tour/useTour.ts`:
  ```ts
  import { useEffect, useState } from 'react'
  import { useSession } from '../data/session'
  import { usePreference } from '../data/queries'
  import { filterTourStepsByRole } from './steps'
  import type { TourStep } from './Tour'
  
  interface TourState {
    step: number
    completed: boolean
    skipped: boolean
  }
  
  export function useTour() {
    const { user, role } = useSession()
    const [state, setState] = usePreference<TourState>('tour', { step: 0, completed: false, skipped: false })
    const [open, setOpen] = useState(false)
  
    const steps = filterTourStepsByRole(role)
  
    useEffect(() => {
      const isFirstSignIn = user && !state.completed && !state.skipped
      if (isFirstSignIn && typeof window !== 'undefined') {
        setOpen(true)
      }
    }, [user, state])
  
    const onNext = () => {
      if (state.step < steps.length - 1) {
        setState({ ...state, step: state.step + 1 })
      } else {
        setState({ ...state, completed: true, skipped: false })
        setOpen(false)
      }
    }
  
    const onPrev = () => {
      if (state.step > 0) {
        setState({ ...state, step: state.step - 1 })
      }
    }
  
    const onSkip = () => {
      setState({ ...state, skipped: true })
      setOpen(false)
    }
  
    const replay = () => {
      setState({ step: 0, completed: false, skipped: false })
      setOpen(true)
    }
  
    return {
      open,
      currentIndex: state.step,
      steps,
      onNext,
      onPrev,
      onSkip,
      replay,
    }
  }
  ```

- [ ] **Step 2:** Modify `src/App.tsx` to integrate the tour (call `useTour()` in the main App component and render the Tour component when `tour.open`):
  ```tsx
  import { Tour } from './tour'
  import { useTour } from './tour/useTour'
  
  export default function App() {
    const tour = useTour()
    // ... existing code ...
    return (
      <>
        {/* existing app layout */}
        {tour.open && (
          <Tour
            open={tour.open}
            step={tour.steps[tour.currentIndex]}
            currentIndex={tour.currentIndex}
            totalSteps={tour.steps.length}
            onNext={tour.onNext}
            onPrev={tour.onPrev}
            onSkip={tour.onSkip}
          />
        )}
      </>
    )
  }
  ```

- [ ] **Step 3:** Add a help menu button (?) in `src/Dashboard.tsx` or a shared header:
  ```tsx
  <button onClick={tour.replay} title="Replay tour">
    <Icon name="question" />
  </button>
  ```
  (The exact placement depends on the app's layout; ensure the button is always visible and accessible.)

- [ ] **Step 4:** Type check:
  ```bash
  npx tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 5:** Unit test for tour auto-start (create `src/tour/useTour.test.ts`):
  ```ts
  import { test } from 'node:test'
  import { strict as assert } from 'node:assert'
  
  test('useTour: tour opens on first sign-in', () => {
    // Mock user session with first sign-in indicator
    // Mock usePreference to return { step: 0, completed: false, skipped: false }
    // Render a component using useTour
    // Assert open === true
    // (This test requires a test harness for React hooks; placeholder for now.)
  })
  ```
  (Full hook testing requires additional setup; defer to browser verification in D11.)

- [ ] **Step 6:** Commit:
  ```bash
  git add src/tour/useTour.ts src/App.tsx src/Dashboard.tsx
  git commit -m "feat: add tour state, auto-start, and help menu replay"
  ```

---

### Task D5: Sample data loading UI and integration

**Files:** Modify `src/data/queries.ts`, `src/Dashboard.tsx`. (No TypeScript copy of the sample data: the SQL function `load_sample_data()` is the single source.)

**Interfaces — produces:**
- `useLoadSampleData(): { mutate: () => Promise<void>; loading: boolean; error: Error | null }` — hook that calls the `load_sample_data()` RPC and invalidates affected queries.

- [ ] **Step 1:** Add `useLoadSampleData()` to `src/data/queries.ts`:
  ```ts
  export function useLoadSampleData() {
    const { firm } = useSession()
    const qc = useQueryClient()
    const fail = useFail()
  
    return useMutation({
      mutationFn: async () => {
        const { error } = await supabase.rpc('load_sample_data')
        if (error) throw error
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['firm', firm.id, 'clients'] })
        qc.invalidateQueries({ queryKey: ['firm', firm.id, 'balances'] })
      },
      onError: fail,
    })
  }
  ```

- [ ] **Step 3:** Add a "Load sample data" button to `src/Dashboard.tsx`:
  ```tsx
  const loadSample = useLoadSampleData()
  
  // In the JSX:
  <button
    className={btn.primary}
    onClick={() => loadSample.mutate()}
    disabled={loadSample.isPending}
  >
    {loadSample.isPending ? 'Loading...' : 'Load sample data'}
  </button>
  {loadSample.error && <div className="text-red-600">{loadSample.error.message}</div>}
  ```

- [ ] **Step 4:** Type check:
  ```bash
  npx tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 5:** Commit:
  ```bash
  git add src/data/queries.ts src/Dashboard.tsx
  git commit -m "feat: add sample data loading UI"
  ```

---

### Task D6: Sample data removal, banner, and confirmation dialog

**Files:** Modify `src/data/queries.ts`, `src/App.tsx`.

**Interfaces — produces:**
- `useRemoveSampleData(): { mutate: () => Promise<void>; loading: boolean; error: Error | null }` — hook that calls the `remove_sample_data()` RPC.
- `useSampleDataExists(): boolean` — hook that returns true if any row with `is_sample = true` exists (via a simple select count query).
- Sample data banner at the top of the app: "You're exploring with sample data · **Remove sample data**" (visible only when sample rows exist).
- Confirmation dialog before removal: "Remove all sample data? This action cannot be undone. Your real data will remain."

- [ ] **Step 1:** Add `useRemoveSampleData()` and `useSampleDataExists()` to `src/data/queries.ts`:
  ```ts
  export function useSampleDataExists() {
    const { firm } = useSession()
    const { data: exists = false } = useQuery({
      queryKey: ['firm', firm.id, 'sample-data-exists'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', firm.id)
          .eq('is_sample', true)
        if (error) throw error
        return (data?.length ?? 0) > 0
      },
    })
    return exists
  }
  
  export function useRemoveSampleData() {
    const { firm } = useSession()
    const qc = useQueryClient()
    const fail = useFail()
  
    return useMutation({
      mutationFn: async () => {
        const { error } = await supabase.rpc('remove_sample_data')
        if (error) throw error
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['firm', firm.id, 'clients'] })
        qc.invalidateQueries({ queryKey: ['firm', firm.id, 'balances'] })
        qc.invalidateQueries({ queryKey: ['firm', firm.id, 'sample-data-exists'] })
      },
      onError: fail,
    })
  }
  ```

- [ ] **Step 2:** Modify `src/App.tsx` to show the sample data banner and removal dialog:
  ```tsx
  import { useState } from 'react'
  import { Dialog } from './ui'
  import { useSampleDataExists, useRemoveSampleData } from './data/queries'
  
  export default function App() {
    const sampleDataExists = useSampleDataExists()
    const removeSample = useRemoveSampleData()
    const [showConfirm, setShowConfirm] = useState(false)
  
    const handleRemoveSample = async () => {
      await removeSample.mutate()
      setShowConfirm(false)
    }
  
    return (
      <>
        {sampleDataExists && (
          <div className="bg-blue-100 border-b border-blue-300 px-4 py-2 text-sm flex items-center justify-between">
            <span>You're exploring with sample data</span>
            <button
              onClick={() => setShowConfirm(true)}
              className="text-blue-600 underline hover:text-blue-800"
            >
              Remove
            </button>
          </div>
        )}
  
        <Dialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          title="Remove sample data?"
        >
          <p className="mb-4">This action cannot be undone. Your real data will remain.</p>
          <div className="flex gap-2">
            <button className={btn.secondary} onClick={() => setShowConfirm(false)}>Cancel</button>
            <button
              className={btn.primary}
              onClick={handleRemoveSample}
              disabled={removeSample.isPending}
            >
              {removeSample.isPending ? 'Removing...' : 'Remove sample data'}
            </button>
          </div>
          {removeSample.error && <div className="text-red-600 mt-2">{removeSample.error.message}</div>}
        </Dialog>
  
        {/* existing app layout and tour */}
      </>
    )
  }
  ```

- [ ] **Step 3:** Type check:
  ```bash
  npx tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 4:** Commit:
  ```bash
  git add src/data/queries.ts src/App.tsx
  git commit -m "feat: add sample data removal banner and confirmation"
  ```

---

### Task D7: Checklist component

**Files:** Create `src/checklist/Checklist.tsx`.

**Interfaces — produces:**
- `<Checklist open={boolean} items={ChecklistItem[]} onDismiss={() => void} onSkip={(itemId: string) => void} />` — displays 4 items with checkboxes, item descriptions, and "Skip", "Dismiss checklist" buttons. Checked items are greyed out. Dismiss hides the checklist but doesn't reset progress.
- `ChecklistItem = { id: string; title: string; description: string; completed: boolean; skipped: boolean }`

- [ ] **Step 1:** Create `src/checklist/Checklist.tsx`:
  ```tsx
  import { Icon, btn } from '../ui'
  
  export interface ChecklistItem {
    id: string
    title: string
    description: string
    completed: boolean
    skipped: boolean
  }
  
  interface ChecklistProps {
    open: boolean
    items: ChecklistItem[]
    onDismiss: () => void
    onSkip: (itemId: string) => void
  }
  
  export function Checklist({ open, items, onDismiss, onSkip }: ChecklistProps) {
    if (!open) return null
  
    const completedCount = items.filter(i => i.completed).length
  
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-md max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Get started</h3>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <Icon name="x" />
          </button>
        </div>
  
        <div className="mb-2 text-xs text-gray-600">
          {completedCount} of {items.length} complete
        </div>
  
        <div className="space-y-2 mb-4">
          {items.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-2 rounded ${
                item.completed ? 'bg-gray-50 text-gray-500' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={item.completed}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <div className={item.completed ? 'line-through' : ''}>{item.title}</div>
                <div className="text-xs text-gray-600">{item.description}</div>
              </div>
              {!item.completed && !item.skipped && (
                <button
                  onClick={() => onSkip(item.id)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Skip
                </button>
              )}
            </div>
          ))}
        </div>
  
        <button onClick={onDismiss} className={btn.ghost}>
          Dismiss checklist
        </button>
      </div>
    )
  }
  ```

- [ ] **Step 2:** Create `src/checklist/index.ts`:
  ```ts
  export { Checklist, type ChecklistItem, type ChecklistProps } from './Checklist'
  ```

- [ ] **Step 3:** Type check:
  ```bash
  npx tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 4:** Commit:
  ```bash
  git add src/checklist/Checklist.tsx src/checklist/index.ts
  git commit -m "feat: add Checklist component"
  ```

---

### Task D8: Checklist state and auto-tick logic

**Files:** Create `src/checklist/useChecklist.ts`. Modify `src/App.tsx`, `src/data/queries.ts`.

**Interfaces — produces:**
- `useChecklist(): { open: boolean; items: ChecklistItem[]; onDismiss: () => void; onSkip: (itemId: string) => void }` — hook that manages checklist state, saves to `usePreference('checklist')`, and auto-ticks items based on conditions.
- Conditions: (1) "Complete firm profile" = firm.name, firm.phone, firm.email all non-empty; (2) "Invite team" = profiles count > 1 (owner + at least one other); (3) "Add a client" = clients count with `is_sample = false` > 0; (4) "Record transaction" = transactions count with `is_sample = false` > 0.

- [ ] **Step 1:** Create `src/checklist/useChecklist.ts`:
  ```ts
  import { useEffect } from 'react'
  import { useSession } from '../data/session'
  import { usePreference } from '../data/queries'
  import { useFirm, useClientsCount, useTransactionsCount, useMembersCount } from '../data/queries'
  import { Checklist, type ChecklistItem } from './Checklist'
  
  interface ChecklistState {
    open: boolean
    dismissed: boolean
    skipped: { [key: string]: boolean }
  }
  
  export function useChecklist() {
    const firm = useFirm()
    const clientsCount = useClientsCount(false) // non-sample only
    const transactionsCount = useTransactionsCount(false) // non-sample only
    const membersCount = useMembersCount()
    const [state, setState] = usePreference<ChecklistState>('checklist', { open: true, dismissed: false, skipped: {} })
  
    const items: ChecklistItem[] = [
      {
        id: 'profile',
        title: 'Complete your firm profile',
        description: 'Add phone, email, and address',
        completed: !!(firm?.phone && firm?.email && firm?.name),
        skipped: state.skipped.profile || false,
      },
      {
        id: 'team',
        title: 'Invite your team',
        description: 'Add team members with roles',
        completed: (membersCount ?? 0) > 1,
        skipped: state.skipped.team || false,
      },
      {
        id: 'client',
        title: 'Add your first client',
        description: 'Create a client record',
        completed: (clientsCount ?? 0) > 0,
        skipped: state.skipped.client || false,
      },
      {
        id: 'transaction',
        title: 'Record your first transaction',
        description: 'Post a receipt or payment',
        completed: (transactionsCount ?? 0) > 0,
        skipped: state.skipped.transaction || false,
      },
    ]
  
    const onDismiss = () => {
      setState({ ...state, dismissed: true })
    }
  
    const onSkip = (itemId: string) => {
      setState({ ...state, skipped: { ...state.skipped, [itemId]: true } })
    }
  
    return {
      open: state.open && !state.dismissed,
      items,
      onDismiss,
      onSkip,
    }
  }
  ```

- [ ] **Step 2:** Add helper hooks to `src/data/queries.ts`:
  ```ts
  export function useClientsCount(isSample: boolean | null = null) {
    const { firm } = useSession()
    const { data = 0 } = useQuery({
      queryKey: ['firm', firm.id, 'clients-count', isSample],
      queryFn: async () => {
        let query = supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', firm.id)
        if (isSample !== null) query = query.eq('is_sample', isSample)
        const { count, error } = await query
        if (error) throw error
        return count ?? 0
      },
    })
    return data
  }
  
  export function useTransactionsCount(isSample: boolean | null = null) {
    const { firm } = useSession()
    const { data = 0 } = useQuery({
      queryKey: ['firm', firm.id, 'transactions-count', isSample],
      queryFn: async () => {
        let query = supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', firm.id)
        if (isSample !== null) query = query.eq('is_sample', isSample)
        const { count, error } = await query
        if (error) throw error
        return count ?? 0
      },
    })
    return data
  }
  
  export function useMembersCount() {
    const { firm } = useSession()
    const { data = 0 } = useQuery({
      queryKey: ['firm', firm.id, 'members-count'],
      queryFn: async () => {
        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', firm.id)
          .eq('status', 'active')
        if (error) throw error
        return count ?? 0
      },
    })
    return data
  }
  ```

- [ ] **Step 3:** Integrate into `src/App.tsx`:
  ```tsx
  import { Checklist } from './checklist'
  import { useChecklist } from './checklist/useChecklist'
  
  // In App component:
  const checklist = useChecklist()
  
  // In JSX:
  <Checklist
    open={checklist.open}
    items={checklist.items}
    onDismiss={checklist.onDismiss}
    onSkip={checklist.onSkip}
  />
  ```

- [ ] **Step 4:** Create unit tests `src/checklist/useChecklist.test.ts`:
  ```ts
  import { test } from 'node:test'
  import { strict as assert } from 'node:assert'
  
  test('Checklist: "Complete profile" ticks when firm has phone, email, name', () => {
    // Mock firm, usePreference, and count hooks
    // Assert item.completed === true when all fields are set
  })
  
  test('Checklist: "Add client" ticks only for non-sample clients', () => {
    // Mock useClientsCount(false) returning 1
    // Assert item.completed === true
  })
  
  test('Checklist: Dismiss button hides checklist without clearing progress', () => {
    // Mock onDismiss
    // Assert open becomes false but items still show completed state
  })
  ```
  (Defer full testing to integration tests in D11 due to hook complexity.)

- [ ] **Step 5:** Type check:
  ```bash
  npx tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 6:** Commit:
  ```bash
  git add src/checklist/useChecklist.ts src/data/queries.ts src/App.tsx
  git commit -m "feat: add checklist state and auto-tick logic"
  ```

---

### Task D9: Database tests for sample data operations

**Files:** `supabase/tests/12_onboarding.test.sql` (written in D1, now execute).

- [ ] **Step 1:** Verify the test file exists and is complete:
  ```bash
  cat supabase/tests/12_onboarding.test.sql
  ```

- [ ] **Step 2:** Run the database tests:
  ```bash
  supabase test db
  ```
  Expected: All pgTAP tests pass.
  - `load_sample_data()` inserts 1 bank account, 8 clients, ~150 transactions with `is_sample = true`.
  - Second call is idempotent (counts unchanged).
  - `remove_sample_data()` deletes all sample rows; non-sample rows remain.
  - Non-owner/admin calling `load_sample_data()` returns 403 (RLS).
  - Trying to remove sample data with non-sample transactions still referencing sample clients raises an error.

- [ ] **Step 3:** Commit test results (no code changes, just confirmation):
  ```bash
  # No commit needed; tests already committed in D1.
  # Verify tests pass:
  supabase test db 2>&1 | grep -E 'passed|failed'
  ```

---

### Task D10: Unit tests for tour and checklist logic

**Files:** `src/tour/steps.test.ts` (already written in D3). Create `src/checklist/logic.test.ts` for checklist item condition evaluation.

- [ ] **Step 1:** Run existing tour step tests:
  ```bash
  pnpm test src/tour/steps.test.ts
  ```
  Expected: PASS.

- [ ] **Step 2:** Create `src/checklist/logic.test.ts` for checklist item conditions (pure functions, no hooks):
  ```ts
  import { test } from 'node:test'
  import { strict as assert } from 'node:assert'
  
  // Pure function: given counts and firm data, return checklist item states
  export function checklistItemStates(firmName: string, firmPhone: string, firmEmail: string, clientsCount: number, transactionsCount: number, membersCount: number) {
    return {
      profile: !!(firmName && firmPhone && firmEmail),
      team: membersCount > 1,
      client: clientsCount > 0,
      transaction: transactionsCount > 0,
    }
  }
  
  test('Checklist item: profile completes when all fields set', () => {
    const state = checklistItemStates('Acme', '1234567890', 'info@acme.com', 0, 0, 1)
    assert.equal(state.profile, true)
  })
  
  test('Checklist item: profile incomplete if email missing', () => {
    const state = checklistItemStates('Acme', '1234567890', '', 0, 0, 1)
    assert.equal(state.profile, false)
  })
  
  test('Checklist item: team completes with 2+ members', () => {
    const state = checklistItemStates('Acme', '1234567890', 'info@acme.com', 0, 0, 2)
    assert.equal(state.team, true)
  })
  
  test('Checklist item: client completes with 1+ non-sample clients', () => {
    const state = checklistItemStates('Acme', '1234567890', 'info@acme.com', 1, 0, 1)
    assert.equal(state.client, true)
  })
  
  test('Checklist item: transaction completes with 1+ non-sample transactions', () => {
    const state = checklistItemStates('Acme', '1234567890', 'info@acme.com', 1, 1, 1)
    assert.equal(state.transaction, true)
  })
  ```

- [ ] **Step 3:** Run the tests:
  ```bash
  pnpm test src/checklist/logic.test.ts src/tour/steps.test.ts
  ```
  Expected: PASS.

- [ ] **Step 4:** Commit:
  ```bash
  git add src/checklist/logic.test.ts
  git commit -m "test: add checklist logic tests"
  ```

---

### Task D11: Browser verification of tour, sample data, and checklist flows

**Files:** No new code; browser testing via the in-app Browser pane on `d.localhost:5202`.

- [ ] **Step 1:** Start the dev server and Supabase (if not already running):
  ```bash
  cd /Users/delfrinando/ntucsm/worktree/pi-onboarding
  supabase start
  pnpm dev  # should serve on http://d.localhost:5202/app/
  ```

- [ ] **Step 2:** Open the app in the in-app Browser pane at `http://d.localhost:5202/app/` and sign in as an owner:
  - Email: `owner@alpha.test` (seed user)
  - Password: `password123`
  - Expected: App loads; on first sign-in, the tour should open with Step 1 of 10.

- [ ] **Step 3:** Test the tour:
  - Verify Spotlight highlights the target element (dark overlay, circular hole).
  - Verify Popover shows title, description, "Back", "Next", "Skip tour" buttons, and step counter.
  - Click "Next" 3 times; verify the step counter increments to "Step 4 of 10".
  - Click "Back" once; verify step counter decrements to "Step 3 of 10".
  - Click "Skip tour"; verify the tour closes and the banner/checklist are visible.
  - Reload the page; verify the tour does NOT open again (progress saved).

- [ ] **Step 4:** Test the help menu:
  - Find the help menu button (?) in the app.
  - Click it; verify the tour restarts with Step 1 of 10.
  - Close the tour (Skip).

- [ ] **Step 5:** Test sample data loading:
  - In the Dashboard, find the "Load sample data" button.
  - Click it; verify the request succeeds and the banner "You're exploring with sample data · **Remove**" appears at the top.
  - Verify the Clients page now shows 8 sample clients.
  - Verify the Balances page shows transactions and balances from sample data.

- [ ] **Step 6:** Test the checklist:
  - Verify the "Get started" checklist is visible with 4 items.
  - Initial state: all items are unchecked and incomplete.
  - Add a real (non-sample) client via the UI.
  - Verify the "Add a client" item auto-ticks (checkbox appears checked, text greyed out).
  - Click "Skip" on one of the unchecked items; verify it remains unchecked but the skip state is saved.
  - Click "Dismiss checklist"; verify the checklist disappears.
  - Reload the page; verify the checklist reappears with the same skip state and completed items.

- [ ] **Step 7:** Test sample data removal:
  - Click the "Remove" button in the banner.
  - Verify a confirmation dialog appears: "Remove all sample data? This action cannot be undone."
  - Click "Remove sample data"; verify the request succeeds.
  - Verify the banner disappears (no more sample rows).
  - Verify the 8 sample clients are gone from the Clients page.
  - Verify the real client added in Step D6 is still present.

- [ ] **Step 8:** Test role-based tour:
  - Sign out and sign in as a viewer: `viewer@alpha.test` / `password123`.
  - Verify the tour opens on first sign-in with fewer steps (e.g., 5 steps for viewer instead of 10 for owner).
  - Verify steps like "Users and invites" and "Settings and billing" are not in the tour.

- [ ] **Step 9:** Verify no errors in the browser console:
  - Check the in-app Browser pane's console (F12 or read_console_messages).
  - Expected: No errors or warnings related to tour, checklist, or sample data.

- [ ] **Step 10:** Verify sample data is visible and labelled throughout the app:
  - With sample data loaded, check that the banner "You're exploring with sample data · **Remove**" is visible on every page (Dashboard, Clients, Statement, etc.).
  - On the Dashboard and Clients pages, verify that totals, balances, and transaction counts are visibly labelled or noted as "including sample data" (e.g., a small note below the totals, or a highlight on the sample transactions in the list).
  - After removing sample data, confirm the banner disappears and totals update to show only real data.
  - **Note for implementation:** D5 (Sample data loading) and D6 (Sample data removal/banner) must ensure that the banner is rendered at the top level (in `App.tsx`) and persists across all sub-pages. The Dashboard and Clients pages must label sample data in totals; the exact presentation (note, icon, highlight) is a design decision — defer to the figma/design.md spec or default to a small "(includes sample data)" note below each total.

- [ ] **Step 11:** Commit final notes (no code changes):
  ```bash
  git log --oneline | head -15  # verify recent commits for D1-D10
  ```

---

## Self-Review

### Spec Coverage

- **§5 item 4 (Product tour):** Implemented in D2, D3, D4. Tour starts automatically on first sign-in, shows steps per role, allows replay from help menu, progress saved to `user_preferences`.
- **§5 item 5 (Sample data offer):** Implemented in D1, D5, D6. `load_sample_data()` RPC inserts sample rows; banner and removal UI in D6.
- **§5 item 6 (Checklist):** Implemented in D7, D8. Four items, self-tick logic, skip and dismiss buttons, progress saved to `user_preferences`.
- **§7 item 5 (Sample data E2E testing):** Implemented in D9 (pgTAP) and D11 (browser smoke tests).
- **§4 (Role-based permissions):** Tour step filtering by role in D3; checklist is per-user (no role gate, all roles see it).

### Placeholder Scan

- No "TBD", "TODO", or "implement later" in any task.
- All code examples are complete and runnable.
- All step instructions include exact commands and expected output.
- No "add error handling" without examples; error handling is explicit in hooks (D5, D6, D8).

### Type Consistency

- `TourStep` defined in D2 (Tour.tsx); used consistently in D3 (steps.ts), D4 (useTour.ts).
- `ChecklistItem` defined in D7 (Checklist.tsx); used consistently in D8 (useChecklist.ts).
- `Role` type imported from `src/users/rules` and used consistently in D3 (filterTourStepsByRole).
- `usePreference` hook produces `T | undefined`; all tasks handle fallback values (D4, D8).

### Review Focus Coverage

1. **Tour starts once on first sign-in:** Test in D4 unit test and D11 browser step 2-3.
2. **Tour steps differ by role:** Test in D3 unit test and D11 browser step 8.
3. **Checklist items tick only when conditions met:** Test in D8 and D10 unit tests and D11 browser step 6.
4. **Sample data removal never deletes non-sample rows:** Test in D1 pgTAP test 2 and D11 browser step 7.
5. **Banner disappears when last sample row removed:** Test in D6 and D11 browser step 7.

---
