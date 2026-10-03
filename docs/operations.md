# Operations and Deployment

## Hosted deployment checklist

This checklist describes every step to deploy ReportNoReport to production. The app will be available at `https://reportnoreport.com/app/`, with the homepage at `https://reportnoreport.com/`.

### Step 1: Create a Supabase project

1. Go to https://app.supabase.com › New Project
2. Choose region **Singapore** (ap-southeast-1) for lower latency to Malaysia and Singapore
3. Choose a strong database password and store it securely (never commit it)
4. Keep the project URL (in the format `https://<project-id>.supabase.co`) and the **Anon Key** (public, used by the browser)

### Step 2: Link your local copy to the project

```bash
supabase link --project-ref <your-project-ref>
```

Authenticate when prompted. This enables `supabase db push` and secrets management.

### Step 3: Deploy the database schema and functions

```bash
supabase db push
```

This runs all migrations in `supabase/migrations/` on the hosted database. Verify it completes without errors.

Confirm the schema is in place:
- Supabase dashboard › SQL Editor
- Run: `select count(*) from platform_settings;` (should return 1)

### Step 4: Deploy Edge Functions (team and admin)

```bash
supabase functions deploy team
supabase functions deploy admin
```

Verify the functions are listed at: Supabase dashboard › Edge Functions.

### Step 5: Set Edge Function secrets

Set the APP_URL secret from the CLI:

```bash
supabase secrets set APP_URL=https://reportnoreport.com/app/
```

Supabase automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions; these do not need to be set manually.

### Step 6: Set up Auth (email, confirmation, redirects)

**Email verification:**
- Supabase dashboard › Authentication › Providers › Email
  - ✓ Enable Email signup
  - ✓ Email confirmations required
  - OTP expiry: `86400` (24 hours, the hosted maximum)
  - ✓ Require email verification before login
  - ✓ Double confirm email changes

**Auth redirect URLs:**
- Supabase dashboard › Authentication › URL Configuration
  - Site URL: `https://reportnoreport.com/app/` (must end with `/`)
  - Redirect URLs (add all of these):
    ```
    https://reportnoreport.com/app/?flow=set-password
    https://reportnoreport.com/app/**
    https://reportnoreport.com/**
    ```

### Step 7: Set up Resend SMTP for email delivery

Resend sends emails on behalf of your domain. (Local development uses Mailpit and sends no real emails.)

1. Create a Resend account at https://resend.com
2. Add `reportnoreport.com` and add its DNS records in Cloudflare (SPF, DKIM, DMARC)
3. Create an API key with "Sending" permission
4. In Supabase dashboard › Authentication › SMTP Settings, enable custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: (paste your Resend API key)
   - Sender name: `ReportNoReport`
   - From email: `noreply@reportnoreport.com` (must match a verified domain at Resend)

### Step 8: Upload email templates to Supabase

Supabase dashboard › Authentication › Email Templates. For each of these templates:
- **Invite user:** Copy HTML from `supabase/templates/invite.html`, paste into the template editor, set subject to `You've been invited to ReportNoReport`
- **Reset password:** Copy HTML from `supabase/templates/recovery.html`, set subject to `Reset your ReportNoReport password`
- **Confirm sign up:** Copy HTML from `supabase/templates/confirmation.html`, set subject to `Confirm your ReportNoReport email address`
- **Change email:** Copy HTML from `supabase/templates/email_change.html`, set subject to `Confirm your new ReportNoReport email address`

Send a test invite to verify emails arrive with correct branding and clickable links.

### Step 9: Set up Vercel (frontend hosting)

1. Create a Vercel account and link your GitHub repo
2. Create a new Vercel project:
   - Select the `delfrinandopranata/reportnoreport` repo
   - Framework: Vite
   - Build command: `pnpm build`
   - Output directory: `dist`
   - Install command: `/opt/homebrew/bin/pnpm install`
3. In Vercel › Settings › Environment Variables, add:
   ```
   VITE_SUPABASE_URL = https://<your-project-id>.supabase.co
   VITE_SUPABASE_ANON_KEY = <your-anon-key>
   ```
4. (Optional) Set a custom domain:
   - Vercel › Settings › Domains
   - Add your domain and follow DNS instructions
5. Vercel auto-deploys on push to `main`; you may also deploy manually with `vercel deploy`

The three entry points (`vercel.json` rules):
- `GET /` → serves `dist/index.html` (homepage, public)
- `GET /app/` → serves `dist/app/index.html` (React app, requires sign-in)
- `GET /demo/` → serves `dist/demo/index.html` (demo build, public; see note below)

**Demo build note:** The `/demo/` endpoint serves a browser-only build from the `demo-local` git tag. Before deploying to production, create this tag locally pointing to a known-good commit:
```bash
git tag demo-local <commit-sha>
git push origin tag demo-local
```

The build script `scripts/build-demo.sh` will then include a demo build in the next production deployment. (For now, `/demo/` may 404 until the tag exists.)

### Step 10: Create the super-admin profile

The first sign-in must be a super-admin (no firm, `is_super_admin = true`). You have two options:

**Option A: Via Supabase dashboard (recommended)**
1. Go to Supabase dashboard › Authentication › Users
2. Click "Invite" and send an invite to your super-admin email
3. Accept the invite (you'll be redirected to `https://reportnoreport.com/app/?flow=set-password`)
4. Set your password and return to the app
5. Run this SQL in Supabase › SQL Editor to mark yourself as super-admin:
   ```sql
   insert into profiles (user_id, name, email, role, status, is_super_admin)
   values (
     '<your-user-id>',  -- copy from Supabase › Authentication › Users
     'Your Name',
     'your-email@example.com',
     'viewer',
     'active',
     true
   );
   ```

**Option B: Via SQL directly**
1. In Supabase › Authentication › Users, manually create a user (copy the UUID)
2. In Supabase › SQL Editor, run:
   ```sql
   insert into profiles (user_id, name, email, role, status, is_super_admin)
   values (
     '<user-uuid>',
     'Your Name',
     'your-email@example.com',
     'viewer',
     'active',
     true
   );
   ```

### Step 11: Set the homepage contact email

The homepage has a contact link. In `src/home/home.ts`, line 5, replace the default:
```typescript
const CONTACT_EMAIL = 'hello@reportnoreport.com'
```

Set it to your support or contact email address. Commit and redeploy to production.

### Step 12: Verify the deployment

**Homepage and public pages:**
1. Open `https://reportnoreport.com/` → should see the marketing homepage, no sign-in required
2. Click "Sign up" → should redirect to `https://reportnoreport.com/app/#signup`

**Sign-up flow:**
1. Fill in firm name, currency, email, password
2. Check your email (Resend dashboard › Emails) for the confirmation link
3. Click "Confirm my email" and sign in
4. Dashboard should load with 14 days trial remaining

**Admin console:**
1. Sign in as the super-admin
2. Navigate to `https://reportnoreport.com/app/#admin`
3. Verify the "Firms" list appears (may be empty if no sign-ups yet)
4. Verify "Platform settings" shows (firm cap, trial days)

**Smoke tests:**
- Waitlist sign-up at homepage (rate limited to one entry per email)
- Sign-up creates a firm with `source = 'self_serve'` and `trial_ends_at` set to 14 days from now
- Invite team member via Users › Invite (email confirms within 24 hours)
- Trial banner shows count of days remaining
- Trial expiry blocks writes with clear message
- Admin console can create a firm manually (outside the cap)
- Reaching the firm cap bounces new sign-ups to waitlist
- Export and print work (CSV and PDF generation)
- Change log records all writes for audit

### Waitlist rate limiting

The public waitlist endpoint (`/api/waitlist`) is rate-limited by Supabase/Vercel edge limits to one entry per email address per day. The limit is enforced at the database level (unique email) and cannot be circumvented by IP spoofing.

---

## Stripe Setup and Operations

### Test Mode (Local Development)

1. **Create a Stripe test account** at stripe.com if you haven't already.

2. **Get your test API keys:**
   - Go to Stripe Dashboard › Developers › API keys
   - Copy the **Secret key** (starts with `sk_test_…`)
   - Copy the **Webhook signing secret** (starts with `whsec_…`) from Webhooks

3. **Set environment variables** in `supabase/functions/.env.local` (git-ignored):
   ```
   STRIPE_SECRET_KEY=sk_test_…
   STRIPE_WEBHOOK_SECRET=whsec_…
   ```

4. **Webhook configuration (local testing):**
   - Use `stripe listen` (CLI) to forward webhook events to your local functions:
     ```bash
     stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
     ```
   - The output will show a `whsec_…` secret — copy this to `STRIPE_WEBHOOK_SECRET` in `supabase/functions/.env.local`

5. **Local testing flow:**
   ```bash
   supabase start                  # local database and services
   supabase functions serve --env-file supabase/functions/.env.local
   pnpm dev                        # app on http://localhost:5201/app/
   stripe listen --forward-to ...  # in another terminal
   ```
   - Navigate to `#settings/billing` (sign in as owner)
   - Click "Pay MYR 10.00"
   - Use test card: `4242 4242 4242 4242`, any future date, any CVC
   - Verify the payment succeeds and firm status updates to `paid`

### Live Mode (Production)

1. **Create a live Stripe account** (or use an existing one for production).

2. **Repeat the test setup with live API keys** (start with `sk_live_…`, `whsec_…`).

3. **Update Supabase Edge Function secrets** (hosted project):
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_…
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…
   ```
   Secrets are read at request time; no redeploy is needed after updating them.

4. **Create webhook endpoint in Stripe Dashboard:**
   - Developers › Webhooks › Add endpoint
   - URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `charge.refunded`
   - Copy the signing secret to the Supabase secrets above

### Webhook Deployment

The webhook function must be deployed with `--no-verify-jwt` because Stripe provides its own signature verification (HMAC-SHA256):

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy billing-checkout
```

Run these after schema changes or Edge Function code updates. Webhook events are processed asynchronously; failures are logged in the Supabase Edge Functions dashboard.

### Events Processed

The webhook handler (`supabase/functions/stripe-webhook/`) subscribes to two Stripe event types:

- **`checkout.session.completed`** (when `payment_status` is `paid`): Calls the `record_payment(firm_id, payment_intent_id)` RPC function. Sets the firm's `billing_status` to `paid`, records `paid_at`, and stores the Stripe `payment_intent_id` for refund lookups. Logged in `change_log` for audit.

- **`charge.refunded`**: Calls the `record_refund(firm_id)` RPC function. Sets the firm's `billing_status` to `read_only`, preventing further writes. Logged in `change_log`.

Each Stripe event id is recorded once in `stripe_events` (unique), so a repeated delivery is acknowledged without being processed again. If recording the payment or refund fails, the function releases that event id and returns 500, so Stripe's automatic retry processes it.

### Refunds and Reactivation

When a charge is refunded:
- The firm becomes `read_only` and cannot record new transactions
- The super-admin console can mark the firm `complimentary` to unblock writes without another payment
- Alternatively, the firm can pay again (MYR 10.00) to restore `paid` status

---

## Production logs and observability

**Not yet set up:** alerting, uptime checks, error tracking, automatic metrics collection.

**Available once live:**
- **Postgres logs:** Supabase dashboard › Logs (queries, slowest queries, replication)
- **Auth logs:** Supabase dashboard › Authentication › Auth logs
- **Edge Function logs:** Supabase dashboard › Edge Functions › Logs (requests, errors)
- **Frontend logs:** Vercel dashboard › Deployments › Logs and Runtime Logs
- **Email delivery:** Resend dashboard › Emails (bounces, opens, clicks)

**Backups:** Supabase provides automated daily backups. See the Supabase dashboard for retention policy.

## Rolling back a deployment

If a Vercel deployment breaks the app:

1. Go to Vercel › Deployments
2. Find the last known-good deployment
3. Click › Promote to Production

For Supabase (database migrations):

1. Migrations are append-only and never rolled back (Postgres best practice)
2. If a migration introduced a bug, create a new migration that fixes it
3. Never edit or delete an existing migration

For Edge Functions:

1. Redeploy from local: `supabase functions deploy <function-name>`
2. Or use Vercel › Deployments › Promote to Production if the bug is in the frontend/API layer

## Secrets management (critical)

**Never commit secrets to git.** The following are secrets and must be:
- Set in environment variables (Vercel, Supabase, local .env files)
- `.env*.local` files are git-ignored
- `.env.example` lists variable names only (no values)

Secrets:
- `VITE_SUPABASE_ANON_KEY` (public, but don't hardcode; use .env)
- `RESEND_API_KEY` (private; Supabase secret only)
- `STRIPE_SECRET_KEY` (private; Supabase secret only, Plan C)
- `STRIPE_WEBHOOK_SECRET` (private; Supabase secret only, Plan C)
- Supabase `SERVICE_ROLE_KEY` (private; used in Edge Functions only, never in browser or Vercel)
- Supabase database password (private; set at project creation)
- Stripe test/live keys (depends on mode; test keys are safe in repos, live are private)

Audit: `git log -S '<api-key-fragment>' -- ':(exclude).gitignore'` to find any accidental commits.

## Important: do NOT run `supabase config push` while local SMTP is disabled

The `supabase/config.toml` has `[auth.email.smtp] enabled = false` locally (to avoid real email sends from dev accounts). **If you run `supabase config push` while this setting is enabled in the local config, it will push the disabled state to your hosted project and turn off SMTP.**

Instead, use the Supabase dashboard to configure SMTP (Auth › SMTP Settings) and set templates manually (Auth › Email Templates).

## Hosting architecture summary

```
User Browser
    ↓
Vercel (frontend)
    ├→ index.html (/)                  [static page]
    ├→ app/index.html (/app/)          [React app; hash routes]
    └→ demo/index.html (/demo/)        [browser-only MVP]
    ↓
Supabase (backend)
    ├→ PostgreSQL 17 (Singapore)       [data, RLS, computed functions]
    ├→ Auth (Supabase)                 [user signup, sign-in, password reset]
    ├→ Edge Functions (Deno)           [team (invites), admin (super-admin ops)]
    ├→ Storage (S3-compatible)         [firm logos]
    └→ Logs, Backups
    ↓
Resend (email)
    └→ SMTP server                     [branded emails via Supabase Auth]
```

Services communicate via HTTPS. No server-to-server auth required; the frontend (via the anon key) is the only client.

**Note:** Stripe is integrated in Plan C (not yet started). The hosting diagram will expand when billing is added.

## Support and troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Invites don't arrive | SMTP misconfigured or Resend domain unverified | Check Supabase › SMTP Settings; check Resend › Domains |
| Users can't sign up (401) | Supabase Auth misconfigured or redirect URLs wrong | Check Auth › URL Configuration includes your domain |
| "Firm not found" for all reads | RLS misconfigured or auth_firm_id() returns null | Check RLS policies in Postgres; verify the user's profile exists |
| Trial expiry doesn't block writes | firm_can_write() has a bug | Check the logic: `billing_status = 'trial' AND now() < trial_ends_at` |
| Demo at /demo/ returns 404 | Demo build didn't run or the build script failed | Re-run `pnpm build` and check for errors; check `scripts/build-demo.sh` |
| Edge Function timeout | Function is too slow or Supabase is down | Check function logs (Supabase › Edge Functions › Logs) and see the Supabase dashboard for timeout settings |
| Database locked / can't run migrations | Stale connection or migration in progress | Restart Supabase: `supabase stop && supabase start` |

## Future: Plan D and beyond

The deployment checklist above covers Plans A, B, and C. Future plans will add:

- **Plan D:** Product tour, Get started checklist, sample data UX
- **Later sub-projects:** Trust and compliance (audit views, locked periods, bank reconciliation); Client communication (emailed statements, reminders, client portal)

All use the same Supabase and Vercel infrastructure; only new migrations and Edge Functions are needed.
