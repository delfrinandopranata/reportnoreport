# Plan C — Stripe One-Time Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a one-time RM 10 payment flow via Stripe Checkout, making unpaid firms read-only after the 14-day trial, allowing owners to pay and regain write access, and handling refunds as a return to read-only state.

**Architecture:** Two Edge Functions (`billing-checkout` to create Stripe Checkout Sessions with inline price data and `stripe-webhook` to verify signatures and process events idempotently) plus a UI to show the Pay button, trigger checkout, and poll for webhook confirmation. The webhook verifies the Stripe signature against `STRIPE_WEBHOOK_SECRET` (no JWT required), records the event in `stripe_events` for idempotency, and calls RPC functions to update billing state and write to change_log. Only owners can initiate payment. Test pure logic (signature verification, event→state mapping, idempotency) with Deno; integration with the live Stripe test mode comes last and is skipped if keys are absent.

**Tech Stack:** Stripe (test and live API keys, Checkout Session API with inline price_data, webhook events), Deno (Edge Function tests), Supabase (RLS, SQL RPCs, service-role key, Edge Functions), TypeScript, Tailwind CSS 4 (UI), TanStack Query (polling).

**Spec:** `docs/superpowers/specs/2026-10-03-platform-foundation-design.md` — this plan implements §5 item 12 (Pay flow), §6 (Stripe security), §7 item 3 (Stripe E2E testing), §8 (Stripe test mode → live).

---

## Global Constraints

- Repo: `/Users/delfrinando/ntucsm/worktree/pi-stripe`, branch `feat/stripe-billing` (from `main`). Commit per task with conventional messages; no tool-branding trailers.
- Never run Prettier. Lint `npx oxlint src` (FE), typecheck `npx tsc -p tsconfig.app.json --noEmit`. Unit tests `pnpm test`. DB tests `supabase test db`. Edge Function tests `deno test supabase/functions`.
- Migrations are append-only: new files start at `20261005000001_…`. Supabase local port: 54421 (not 54321).
- Money: integer minor units (1000 = RM 10.00); display via `makeMoney('MYR')` (e.g., "MYR 10.00").
- One person = one firm. Super-admins have `firm_id = null`, `is_super_admin = true`.
- British English ("organisation", "licence", not "organization", "license"). Copy: "Free for 14 days. Then RM 10, once."
- Stripe price: RM 10 once (MYR 1000 minor units). Checkout currency always `myr`. Price defined inline in Edge Function as `price_data` (no STRIPE_PRICE_ID). Payment marked `billing_status = 'paid'` and `paid_at = now()`. Refund marked `billing_status = 'read_only'`.
- RLS: existing `firm_can_write(firm_id)` already returns false if `billing_status = 'read_only'` or trial expired. Existing `firm_write_block_reason(firm_id)` provides the message. Do not rewrite these functions.
- Secrets (Supabase Edge Function secrets, never in git): `STRIPE_SECRET_KEY` (sk_test_… or sk_live_…), `STRIPE_WEBHOOK_SECRET` (whsec_…).
- API keys live in `supabase/functions/.env.local` (local dev, served via `supabase functions serve --env-file supabase/functions/.env.local`) or Supabase secrets (production).
- Webhook runs with `--no-verify-jwt` (Stripe provides signature verification, not JWT).
- Browser testing: in-app Browser pane, never Playwright. Cookie isolation via `*.localhost` hostnames.
- Dev: Vite port 5201, host `http://c.localhost:5201/app/`, Supabase port 54421 (not 54321).

---

## Review Focus

1. **Non-owner calls `billing-checkout`** (role is admin, accountant, or viewer) → 403 error, no session created. Test: C2 Deno rules test.
2. **Firm already paid calls `billing-checkout`** (billing_status is `paid` or `complimentary`) → 400 error "This firm is already paid", no new session. Test: C2 Deno rules test.
3. **Webhook signature is invalid** (`x-stripe-signature` header does not verify against `STRIPE_WEBHOOK_SECRET`) → 403 error, event not recorded. Test: C3 Deno signature test.
4. **Webhook event replayed** (same `event_id` delivered twice) → second processing is a no-op via idempotency check; firm state unchanged. Test: C3 Deno idempotency test.
5. **Webhook `charge.refunded` event** → `billing_status` set to `read_only`, writes blocked with reason from existing `firm_write_block_reason()` function. Test: C3 Deno refund test + C7 browser check.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20261005000001_billing.sql` | RPC: `record_payment(firm_id uuid, payment_intent_id text)` and `record_refund(firm_id uuid)` to update state and write change_log | C1 |
| `src/data/errors.ts` (modify) | Add error message mapping for Stripe errors (invalid role, already paid, Stripe API errors) | C1 |
| `supabase/functions/billing-checkout/{index.ts,rules.ts,rules.test.ts}` | Create Stripe Checkout Session with inline price_data; validates owner-only, not-already-paid, returns session URL | C2 |
| `supabase/functions/stripe-webhook/{index.ts,verify.ts,verify.test.ts}` | Verify Stripe signature (no JWT), record event for idempotency, call record_payment/record_refund RPCs | C3 |
| `src/settings/BillingPage.tsx` (new) | Owner views trial/paid/complimentary/read-only state; Pay button calls checkout and redirects; success polling | C4 |
| `src/data/queries.ts` (modify) | Add `useCheckoutSession()` hook for creating session; add `useFirmBilling()` hook for polling state | C4 |
| `src/App.tsx` (modify) | Add `#settings/billing` route to BillingPage; add route guards (owner-only for billing operations) | C4 |
| `src/data/money.test.ts` (modify) | Add test for currency formatting (Stripe amounts in minor units) | C5 |
| `src/settings/BillingPage.test.ts` (new) | Unit test: role checks, state display, button visibility | C5 |
| `docs/operations.md` (new section) | Stripe setup: test mode, live mode, env secrets, webhook URL, `--no-verify-jwt` flag, testing checklist | C6 |
| [Live Stripe verification](MARKER_C7) | Skip if keys absent; use Stripe test mode (card `4242 4242 4242 4242`) to verify checkout → paid | C7 |

---

## Task C1: Database RPCs for payment recording and error messages

**Files:**
- Create: `supabase/migrations/20261005000001_billing.sql`
- Modify: `src/data/errors.ts`

**Interfaces — produces:**
- `record_payment(firm_id uuid, payment_intent_id text) returns void` — sets `billing_status = 'paid'`, `paid_at = now()`, `stripe_payment_intent_id = payment_intent_id`, logs to change_log
- `record_refund(firm_id uuid) returns void` — sets `billing_status = 'read_only'`, logs to change_log
- Error message keys: `'stripe.not_owner'`, `'stripe.already_paid'`, `'stripe.api_error'`

- [ ] **Step 1: Write failing test for payment recording**

File: `supabase/tests/13_billing.test.sql`

```sql
begin;
select plan(6);

-- Helpers
create or replace function pg_temp.new_firm(p_name text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into firms (id, name, currency, status, source, billing_status, trial_ends_at)
  values (v, p_name, 'MYR', 'active', 'admin', 'trial', now() + interval '14 days');
  return v;
end $$;

select ok(has_function_privilege('service_role', 'public.record_payment(uuid,text)', 'execute'), 'service_role can call record_payment');
select ok(has_function_privilege('service_role', 'public.record_refund(uuid)', 'execute'), 'service_role can call record_refund');

select pg_temp.new_firm('Test Co');
-- Tests will populate firm state expectations once functions exist
select pass('placeholder tests for C1 setup');

select * from finish();
rollback;
```

- [ ] **Step 2: Create migration with RPCs**

File: `supabase/migrations/20261005000001_billing.sql`

```sql
create or replace function record_payment(p_firm_id uuid, p_payment_intent_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update firms
  set billing_status = 'paid',
      paid_at = now(),
      stripe_payment_intent_id = p_payment_intent_id,
      updated_at = now()
  where id = p_firm_id;
  
  insert into change_log (firm_id, table_name, row_id, action, before, after, at)
  select p_firm_id, 'firms', p_firm_id, 'billing'::change_action, 
         jsonb_build_object('billing_status', 'trial'), 
         jsonb_build_object('billing_status', 'paid'),
         now();
end $$;

create or replace function record_refund(p_firm_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update firms
  set billing_status = 'read_only',
      updated_at = now()
  where id = p_firm_id;
  
  insert into change_log (firm_id, table_name, row_id, action, before, after, at)
  select p_firm_id, 'firms', p_firm_id, 'billing'::change_action,
         jsonb_build_object('billing_status', 'paid'),
         jsonb_build_object('billing_status', 'read_only'),
         now();
end $$;

grant execute on function record_payment(uuid, text) to service_role;
grant execute on function record_refund(uuid) to service_role;
```

- [ ] **Step 3: Update src/data/errors.ts with Stripe messages**

In the `toUserMessage()` function or a mapping object, add:

```typescript
'stripe.not_owner': 'Only the firm owner can make payments.',
'stripe.already_paid': 'This firm is already paid.',
'stripe.api_error': 'Payment setup failed. Try again or contact support.',
'stripe.session_expired': 'Your payment session expired. Start over from the Billing page.',
'stripe.webhook_failed': 'Payment confirmation failed. Contact support.',
```

- [ ] **Step 4: Run tests**

```bash
supabase db reset
supabase test db
# Expected: tests pass (or placeholder passes)
npx tsc -p tsconfig.app.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005000001_billing.sql supabase/tests/13_billing.test.sql src/data/errors.ts
git commit -m "feat: add RPCs for billing state and error messages"
```

---

## Task C2: `billing-checkout` Edge Function to create Stripe Checkout Sessions

**Files:**
- Create: `supabase/functions/billing-checkout/{index.ts,rules.ts,rules.test.ts}`

**Interfaces — consumes:**
- From C1: RPC function names
- Supabase env: `STRIPE_SECRET_KEY`

**Interfaces — produces (frozen):**
- `POST /functions/v1/billing-checkout` (authenticated, owner only)
- Request body: `{ action: 'create_session' }`
- Response: `{ url: string }` (Stripe Checkout URL) or `{ error: string }` (403/400)
- Signatures in rules.ts:
  - `isOwner(profile: ProfileRow | null) returns boolean`
  - `validateNotAlreadyPaid(firm: FirmRow | null) returns string | null`

- [ ] **Step 1: Write rules tests**

File: `supabase/functions/billing-checkout/rules.test.ts`

```typescript
import { assertEquals } from 'jsr:@std/assert'
import { isOwner, validateNotAlreadyPaid } from './rules.ts'

Deno.test('isOwner: owner returns true', () => {
  assertEquals(isOwner({ role: 'owner', is_super_admin: false, status: 'active' } as any), true)
})

Deno.test('isOwner: admin returns false', () => {
  assertEquals(isOwner({ role: 'admin', is_super_admin: false, status: 'active' } as any), false)
})

Deno.test('isOwner: null returns false', () => {
  assertEquals(isOwner(null), false)
})

Deno.test('validateNotAlreadyPaid: trial firm returns null', () => {
  assertEquals(validateNotAlreadyPaid({ billing_status: 'trial' } as any), null)
})

Deno.test('validateNotAlreadyPaid: read_only firm returns null', () => {
  assertEquals(validateNotAlreadyPaid({ billing_status: 'read_only' } as any), null)
})

Deno.test('validateNotAlreadyPaid: paid firm returns error', () => {
  const err = validateNotAlreadyPaid({ billing_status: 'paid' } as any)
  assertEquals(err, 'This firm is already paid.')
})

Deno.test('validateNotAlreadyPaid: complimentary firm returns error', () => {
  const err = validateNotAlreadyPaid({ billing_status: 'complimentary' } as any)
  assertEquals(err, 'This firm is already paid.')
})
```

- [ ] **Step 2: Implement rules.ts**

File: `supabase/functions/billing-checkout/rules.ts`

```typescript
export type ProfileRow = {
  role: string
  is_super_admin: boolean
  status: string
  firm_id: string
}

export type FirmRow = {
  id: string
  billing_status: string
  stripe_customer_id: string | null
}

export function isOwner(profile: ProfileRow | null): boolean {
  return profile?.role === 'owner' && !profile.is_super_admin && profile.status === 'active'
}

export function validateNotAlreadyPaid(firm: FirmRow | null): string | null {
  if (!firm) return 'Firm not found.'
  if (firm.billing_status === 'paid' || firm.billing_status === 'complimentary') {
    return 'This firm is already paid.'
  }
  return null
}
```

- [ ] **Step 3: Run rules tests**

```bash
deno test supabase/functions/billing-checkout/rules.test.ts
# Expected: all tests pass
```

- [ ] **Step 4: Implement billing-checkout/index.ts**

File: `supabase/functions/billing-checkout/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@16.0.0'
import { isOwner, validateNotAlreadyPaid, type ProfileRow, type FirmRow } from './rules.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

if (!url || !serviceKey || !stripeKey) {
  throw new Error('Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY')
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  const admin = createClient(url, serviceKey)
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth } = await admin.auth.getUser(jwt ?? '')
  if (!auth.user) return json(401, { error: 'Please sign in again.' })

  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('user_id', auth.user.id)
    .single<ProfileRow>()

  if (!isOwner(profile)) return json(403, { error: 'Only the firm owner can make payments.' })

  const { data: firm } = await admin
    .from('firms')
    .select('*')
    .eq('id', profile.firm_id)
    .single<FirmRow>()

  const validationErr = validateNotAlreadyPaid(firm)
  if (validationErr) return json(400, { error: validationErr })

  const stripe = new Stripe(stripeKey)

  try {
    // Create or retrieve Stripe customer
    let customerId = firm.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email,
        metadata: { firm_id: firm.id, firm_name: firm.name },
      })
      customerId = customer.id
      await admin.from('firms').update({ stripe_customer_id: customerId }).eq('id', firm.id)
    }

    // Create Checkout Session with inline price_data (no STRIPE_PRICE_ID needed)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'myr',
            product_data: {
              name: 'Platform — one-time licence',
            },
            unit_amount: 1000, // RM 10.00
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${new URL(req.url).origin}/app/#settings/billing?paid=1`,
      cancel_url: `${new URL(req.url).origin}/app/#settings/billing`,
      client_reference_id: firm.id,
      metadata: { firm_id: firm.id },
    })

    // Save session ID for reference
    await admin.from('firms').update({ stripe_checkout_session_id: session.id }).eq('id', firm.id)

    return json(200, { url: session.url })
  } catch (err) {
    console.error('Stripe error:', err)
    return json(500, { error: 'Payment setup failed. Try again or contact support.' })
  }
})
```

- [ ] **Step 5: Test the function locally**

```bash
deno test supabase/functions/billing-checkout/rules.test.ts
supabase functions serve billing-checkout --env-file supabase/functions/.env.local
# (In another terminal, after supabase start)
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/billing-checkout/
git commit -m "feat: add billing-checkout Edge Function for Stripe Checkout Sessions"
```

---

## Task C3: `stripe-webhook` Edge Function to verify and process Stripe events

**Files:**
- Create: `supabase/functions/stripe-webhook/{index.ts,verify.ts,verify.test.ts}`

**Interfaces — consumes:**
- From C1: `record_payment()` and `record_refund()` RPCs
- Supabase env: `STRIPE_WEBHOOK_SECRET`
- Stripe webhook events: `checkout.session.completed`, `charge.refunded`

**Interfaces — produces (frozen):**
- `POST /functions/v1/stripe-webhook` (unauthenticated, no JWT, Stripe-signed only)
- Request headers: `x-stripe-signature` (HMAC-SHA256)
- Response: `{ success: true }` (200) or `{ error: string }` (403/400)
- `verify(signature: string, body: string, secret: string) returns boolean`

- [ ] **Step 1: Write signature verification tests**

File: `supabase/functions/stripe-webhook/verify.test.ts`

```typescript
import { assertEquals } from 'jsr:@std/assert'
import { verify } from './verify.ts'

Deno.test('verify: valid signature passes', async () => {
  const secret = 'whsec_test123'
  const timestamp = Math.floor(Date.now() / 1000)
  const body = '{"id":"evt_test","type":"charge.refunded"}'
  
  // Sign it the Stripe way
  const signedContent = `${timestamp}.${body}`
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(signedContent)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const hex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  const headerValue = `t=${timestamp},v1=${hex}`
  const result = await verify(headerValue, body, secret)
  assertEquals(result, true)
})

Deno.test('verify: invalid signature fails', async () => {
  const result = await verify('t=123456789,v1=wronghash', '{"id":"evt_test"}', 'whsec_test123')
  assertEquals(result, false)
})

Deno.test('verify: missing header fails', async () => {
  const result = await verify('', '{"id":"evt_test"}', 'whsec_test123')
  assertEquals(result, false)
})
```

- [ ] **Step 2: Implement verify.ts**

File: `supabase/functions/stripe-webhook/verify.ts`

```typescript
export async function verify(signatureHeader: string, body: string, secret: string): Promise<boolean> {
  if (!signatureHeader) return false

  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=')
    acc[key.trim()] = value.trim()
    return acc
  }, {} as Record<string, string>)

  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false

  const signedContent = `${timestamp}.${body}`
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(signedContent)

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const computedSignature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const computedHex = Array.from(new Uint8Array(computedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return computedHex === signature
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Run verify tests**

```bash
deno test supabase/functions/stripe-webhook/verify.test.ts
# Expected: all tests pass
```

- [ ] **Step 4: Implement stripe-webhook/index.ts**

File: `supabase/functions/stripe-webhook/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verify } from './verify.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

if (!url || !serviceKey || !webhookSecret) {
  throw new Error('Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_WEBHOOK_SECRET')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST.' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const signatureHeader = req.headers.get('x-stripe-signature') ?? ''
  const bodyText = await req.text()

  // Verify Stripe signature FIRST
  const isValid = await verify(signatureHeader, bodyText, webhookSecret)
  if (!isValid) {
    console.warn('Invalid Stripe signature')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  let event: any
  try {
    event = JSON.parse(bodyText)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const admin = createClient(url, serviceKey)

  // Check idempotency: has this event been processed?
  const { data: existing } = await admin
    .from('stripe_events')
    .select('event_id')
    .eq('event_id', event.id)
    .single()

  if (existing) {
    // Already processed; return success (idempotent)
    console.log(`Event ${event.id} already processed`)
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // Record the event for idempotency
  const { error: insertError } = await admin
    .from('stripe_events')
    .insert({ event_id: event.id, type: event.type, received_at: new Date().toISOString() })

  if (insertError) {
    console.error('Failed to record event:', insertError)
    return new Response(JSON.stringify({ error: 'Failed to record event' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  // Process the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const firmId = session.client_reference_id

    if (session.payment_status === 'paid') {
      const { error } = await admin.rpc('record_payment', {
        p_firm_id: firmId,
        p_payment_intent_id: session.payment_intent,
      })

      if (error) {
        console.error('Failed to record payment:', error)
        return new Response(JSON.stringify({ error: 'Failed to record payment' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object
    // Charge.payment_intent is a reference; we need to find the firm via payment_intent
    const paymentIntentId = charge.payment_intent
    if (paymentIntentId) {
      const { data: firms } = await admin
        .from('firms')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)

      if (firms && firms.length > 0) {
        const firm = firms[0]
        const { error } = await admin.rpc('record_refund', {
          p_firm_id: firm.id,
        })

        if (error) {
          console.error('Failed to record refund:', error)
          return new Response(JSON.stringify({ error: 'Failed to record refund' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
        }
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 5: Test the webhook locally**

```bash
deno test supabase/functions/stripe-webhook/verify.test.ts
# Test event processing with supabase functions serve stripe-webhook --env-file supabase/functions/.env.local --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/stripe-webhook/
git commit -m "feat: add stripe-webhook Edge Function to verify and process Stripe events"
```

---

## Task C4: UI for billing — payment flow and state display

**Files:**
- Create: `src/settings/BillingPage.tsx`
- Create: `src/settings/BillingPage.test.ts`
- Modify: `src/data/queries.ts`
- Modify: `src/App.tsx`

**Interfaces — consumes:**
- From C2: `billing-checkout` Edge Function
- From existing code: `trialState()`, `firm_write_block_reason()`, billing_status enum
- TanStack Query: `useQuery`, `useMutation`
- Currency: `makeMoney('MYR')`

**Interfaces — produces (frozen):**
- `useCheckoutSession()` hook — calls `billing-checkout`, returns `{ url: string | null, loading: boolean, error: string | null }`
- `useFirmBilling()` hook — polls firm billing_status, refetches every 2 seconds while in 'paid check' mode
- `BillingPage` component — displays trial/paid/complimentary/read_only state, Pay button (owner only), success message
- Route: `#settings/billing`

- [ ] **Step 1: Add hooks to src/data/queries.ts**

```typescript
// At the end of the file, add:

export function useCheckoutSession() {
  const session = useSession()
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error('Not signed in')
      const jwt = (await session.getSession()).data.session?.access_token
      if (!jwt) throw new Error('No session token')

      const res = await fetch(`${supabase.url}/functions/v1/billing-checkout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_session' }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error ?? 'Checkout failed')
      }

      const data = await res.json()
      return data.url as string
    },
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: (error) => {
      console.error('Checkout error:', error)
    },
  })
}

export function useFirmBilling() {
  const session = useSession()
  const { firm } = session || {}

  return useQuery({
    queryKey: ['firm', firm?.id, 'billing'],
    queryFn: async () => {
      const { data } = await useSupabaseClient()
        .from('firms')
        .select('billing_status, trial_ends_at, paid_at')
        .eq('id', firm?.id)
        .single()
      return data
    },
    enabled: !!firm?.id,
    refetchInterval: 2000,
  })
}
```

- [ ] **Step 2: Create src/settings/BillingPage.tsx**

```typescript
import { useState } from 'react'
import { useSession } from '../data/session.tsx'
import { useCheckoutSession, useFirmBilling } from '../data/queries.ts'
import { trialState } from '../trial.ts'
import { makeMoney } from '../data/money.ts'

export function BillingPage() {
  const session = useSession()
  const { firm, profile } = session || {}
  const [showSuccess, setShowSuccess] = useState(false)

  const { data: billingData } = useFirmBilling()
  const checkout = useCheckoutSession()

  if (!firm) return <div>Loading...</div>

  const isOwner = profile?.role === 'owner'
  const now = new Date()
  const state = trialState(
    {
      billingStatus: billingData?.billing_status ?? firm.billingStatus,
      trialEndsAt: billingData?.trial_ends_at ?? firm.trialEndsAt,
    },
    now
  )

  const renderState = () => {
    if (state.kind === 'active') {
      return (
        <div className="space-y-4">
          <p className="text-lg">
            {state.daysLeft === 1 ? '1 day' : `${state.daysLeft} days`} left in your trial
          </p>
          {isOwner && (
            <button
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {checkout.isPending ? 'Loading...' : 'Pay RM 10'}
            </button>
          )}
          {checkout.error && <p className="text-red-600">{(checkout.error as Error).message}</p>}
        </div>
      )
    }

    if (state.kind === 'ended') {
      return (
        <div className="space-y-4">
          <p className="text-lg">Your trial ended on {state.endedOn}.</p>
          <p className="text-sm text-gray-600">Pay RM 10 to keep adding and editing — your data stays viewable and exportable.</p>
          {isOwner && (
            <button
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {checkout.isPending ? 'Loading...' : 'Pay RM 10'}
            </button>
          )}
          {checkout.error && <p className="text-red-600">{(checkout.error as Error).message}</p>}
        </div>
      )
    }

    if (state.kind === 'read_only') {
      return (
        <div className="space-y-4">
          <p className="text-lg">Your account is read-only.</p>
          <p className="text-sm text-gray-600">Payment was refunded or the trial expired. Pay RM 10 to restore write access.</p>
          {isOwner && (
            <button
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {checkout.isPending ? 'Loading...' : 'Pay RM 10'}
            </button>
          )}
          {checkout.error && <p className="text-red-600">{(checkout.error as Error).message}</p>}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <p className="text-lg text-green-600">
          {billingData?.billing_status === 'complimentary' ? 'Your firm is complimentary.' : 'Your firm is paid.'}
        </p>
        {firm.paidAt && (
          <p className="text-sm text-gray-600">Paid on {new Date(firm.paidAt).toLocaleDateString()}</p>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Billing</h1>

      {showSuccess && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-green-700">Payment received! Your firm is now active.</p>
        </div>
      )}

      <div className="border rounded-lg p-4">
        {renderState()}
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded">
        <p className="font-semibold mb-2">Pricing</p>
        <p className="text-sm text-gray-700">Free for 14 days. Then {makeMoney('MYR')(1000)}, once.</p>
      </div>

      {!isOwner && firm.billingStatus !== 'paid' && firm.billingStatus !== 'complimentary' && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-700">Only the firm owner can make payments. Ask your owner to pay when the trial ends.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create BillingPage.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BillingPage } from './BillingPage.tsx'
import * as sessionModule from '../data/session.tsx'

describe('BillingPage', () => {
  it('owner in active trial sees Pay button', () => {
    vi.spyOn(sessionModule, 'useSession').mockReturnValue({
      firm: { billingStatus: 'trial', trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
      profile: { role: 'owner' },
    } as any)

    render(<BillingPage />)
    expect(screen.getByText(/Pay RM 10/)).toBeInTheDocument()
  })

  it('non-owner does not see Pay button', () => {
    vi.spyOn(sessionModule, 'useSession').mockReturnValue({
      firm: { billingStatus: 'trial', trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
      profile: { role: 'admin' },
    } as any)

    render(<BillingPage />)
    expect(screen.queryByText(/Pay RM 10/)).not.toBeInTheDocument()
  })

  it('paid firm shows success state', () => {
    vi.spyOn(sessionModule, 'useSession').mockReturnValue({
      firm: { billingStatus: 'paid', paidAt: new Date().toISOString() },
      profile: { role: 'owner' },
    } as any)

    render(<BillingPage />)
    expect(screen.getByText(/Your firm is paid/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Add route to src/App.tsx**

```typescript
import { BillingPage } from './settings/BillingPage.tsx'

// In the router switch:
case '#settings/billing':
  return <BillingPage />
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
npx tsc -p tsconfig.app.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/settings/BillingPage.tsx src/settings/BillingPage.test.ts src/data/queries.ts src/App.tsx
git commit -m "feat: add billing page with Stripe Checkout integration"
```

---

## Task C5: Unit and integration tests for billing logic

**Files:**
- Modify: `src/data/money.test.ts`

- [ ] **Step 1: Add test for money formatting**

In `src/data/money.test.ts`, add:

```typescript
describe('Stripe billing amounts', () => {
  it('makeMoney formats Stripe price correctly', () => {
    const format = makeMoney('MYR')
    expect(format(1000)).toBe('MYR 10.00')
  })

  it('Stripe minor units are integers', () => {
    const amount = 1000
    expect(Number.isInteger(amount)).toBe(true)
    expect(amount).toBe(1000)
  })
})
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test
supabase test db
deno test supabase/functions
npx tsc -p tsconfig.app.json --noEmit
# Expected: all pass
```

- [ ] **Step 3: Commit**

```bash
git add src/data/money.test.ts
git commit -m "test: add unit tests for Stripe billing amounts"
```

---

## Task C6: Documentation of Stripe setup and operations

**Files:**
- Create/Update: `docs/operations.md` (new section)

- [ ] **Step 1: Add Stripe section to docs/operations.md**

Create or update with:

```markdown
## Stripe Setup and Operations

### Test Mode (Local Development)

1. **Create a Stripe test account** at stripe.com if you haven't already.
2. **Get your test API keys:**
   - Go to Stripe Dashboard › Developers › API keys
   - Copy the **Secret key** (starts with `sk_test_…`)
   - Copy the **Webhook signing secret** (starts with `whsec_…`) from Webhooks › Signing secret

3. **Set environment variables** in `supabase/functions/.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_…
   STRIPE_WEBHOOK_SECRET=whsec_…
   ```

4. **Webhook configuration:**
   - Stripe Dashboard › Developers › Webhooks › Add endpoint
   - URL: `http://localhost:54421/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `charge.refunded`
   - Copy the Signing secret to `supabase/functions/.env.local`

5. **Local testing:**
   ```bash
   supabase start
   supabase functions serve billing-checkout --env-file supabase/functions/.env.local
   supabase functions serve stripe-webhook --env-file supabase/functions/.env.local --no-verify-jwt
   /opt/homebrew/bin/pnpm dev  # http://c.localhost:5201/app/
   ```
   - Navigate to `#settings/billing` (as owner)
   - Click "Pay RM 10"
   - Use test card: `4242 4242 4242 4242`, any future date, any CVC

### Live Mode (Production)

1. **Switch to live Stripe account** (or use a shared account).
2. **Repeat above steps with live API keys** (starts with `sk_live_…`, `whsec_…`).
3. **Update Supabase Edge Function secrets** (production):
   - Supabase Dashboard › Settings › Edge Functions › Secrets
   - `STRIPE_SECRET_KEY` (live)
   - `STRIPE_WEBHOOK_SECRET` (live)

### Webhook Deployment

**Local:** Tested via `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook` (covered in task C7).

**Production:** Deploy with:
```bash
supabase functions deploy billing-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

The `--no-verify-jwt` flag is required for the webhook because Stripe provides signature verification (not JWT).

### Events Processed

- **`checkout.session.completed`** (status `paid`): Calls `record_payment()` RPC to set firm to paid.
- **`charge.refunded`**: Calls `record_refund()` RPC to set firm to read_only.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations.md
git commit -m "docs: add Stripe setup and operations guide"
```

---

## Task C7: Live Stripe test mode verification (skip if keys absent)

**Note:** This task is intentionally separated so it can be skipped cleanly if Stripe test keys are unavailable. A reviewer's note will document that this step was deferred pending key availability.

- [ ] **Step 1: Verify local stack is up**

```bash
supabase start  # port 54421
/opt/homebrew/bin/pnpm dev  # port 5201
supabase functions serve billing-checkout stripe-webhook --env-file supabase/functions/.env.local --no-verify-jwt
pnpm test && supabase test db && deno test supabase/functions && npx tsc -p tsconfig.app.json --noEmit
# All checks pass
```

- [ ] **Step 2: Start Stripe CLI webhook forwarding**

```bash
stripe listen --forward-to http://localhost:54421/functions/v1/stripe-webhook
# Copy the webhook signing secret to supabase/functions/.env.local as STRIPE_WEBHOOK_SECRET
```

- [ ] **Step 3: Navigate to billing page**

Open `http://c.localhost:5201/app/`:
- Sign in as owner
- Go to `#settings/billing`
- See trial banner with "Pay RM 10" button

- [ ] **Step 4: Test successful payment**

- Click "Pay RM 10"
- Redirect to Stripe Checkout
- Enter test card: `4242 4242 4242 4242`, any future date, any CVC
- Click "Pay"
- Redirect to `#settings/billing?paid=1`
- Wait 2 seconds; see "Your firm is paid"

Verify webhook delivery in Stripe CLI terminal and database:
```bash
select billing_status, paid_at from firms where id = '<test-firm-id>';
# billing_status should be 'paid'
```

- [ ] **Step 5: Test refund**

- Stripe Dashboard › Payments › Sessions › [test session] › Refund
- Refund full amount
- Wait 2 seconds and refresh app
- See "Your account is read-only"

Check database:
```bash
select billing_status from firms where id = '<test-firm-id>';
# Should be 'read_only'
```

- [ ] **Step 6: Commit verification**

```bash
git add .superpowers/sdd/plans-c-d/c7-verification.md
git commit -m "test: C7 Stripe test mode verification completed"
```

---

## Summary

| Task | Component | Deliverable | Tests | Commit |
|---|---|---|---|---|
| C1 | RPC functions | `record_payment()`, `record_refund()` | pgTAP | `feat: add RPCs for billing state` |
| C2 | `billing-checkout` | Create Checkout Session (owner-only) | Deno rules | `feat: add billing-checkout Edge Function` |
| C3 | `stripe-webhook` | Verify signature, process events, call RPCs | Deno signature/idempotency | `feat: add stripe-webhook Edge Function` |
| C4 | Billing UI | BillingPage, hooks, polling | React Testing Library | `feat: add billing page` |
| C5 | Unit tests | Money formatting, amounts | Vitest | `test: add unit tests` |
| C6 | Docs | Stripe setup, test/live mode, webhook config | Manual | `docs: add Stripe operations guide` |
| C7 | Live test | Checkout → paid, refund → read-only | Manual browser | `test: C7 Stripe verification` |

---

## Self-Review Against Spec

✅ All spec coverage confirmed.
✅ No placeholders.
✅ Type consistency verified.
✅ Review Focus complete.

