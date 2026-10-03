# Operations and Deployment

## Pre-launch checklist

### Supabase (PostgreSQL database, Auth, Edge Functions)

1. **Create a Supabase project** (Singapore region recommended for lower latency to Malaysia/Singapore)
   - Go to https://app.supabase.com → New Project
   - Region: Singapore (ap-southeast-1)
   - Database password: strong, stored securely
   - Keep the project URL and Anon Key (public)

2. **Verify the database** matches local schema
   - Supabase → SQL Editor
   - Run: `select count(*) from firms;` (should exist after migrations)

3. **Set up Auth**
   - Supabase → Authentication › Providers › Email
   - Check: Enable Email signup ✓, Email confirmations ✓
   - OTP expiry: 86400 (24 hours, the hosted maximum)
   - Require email verification before login ✓
   - Double confirm email changes ✓

4. **Configure custom SMTP for email** (Resend)
   - Go to resend.com → create account
   - Add your sending domain and verify DNS records (SPF, DKIM)
   - Create an API key with sending access
   - Supabase › Authentication › SMTP Settings:
     - Enable ✓
     - Host: `smtp.resend.com`
     - Port: 465
     - Username: `resend`
     - Password: <your-resend-api-key>
     - Sender name: "Platform"
     - From email: `no-reply@mail.<your-domain>` (must be a subdomain you've verified)
   - Save

5. **Upload email templates**
   - Supabase › Authentication › Email Templates
   - For each template (invite, recovery, confirmation, email_change):
     - Copy the HTML from `supabase/templates/<name>.html`
     - Paste into the template editor
     - Update the subject (from `supabase/config.toml`)
   - Send a test invite and verify it arrives with correct branding and clickable link

6. **Configure Auth URLs**
   - Supabase › Authentication › URL Configuration
   - Site URL: `https://<your-domain>/app/` (must end with `/`)
   - Redirect URLs:
     ```
     https://<your-domain>/app/?flow=set-password
     https://<your-domain>/app/**
     https://<your-domain>/**
     ```

7. **Deploy Edge Functions (Plan A + B only; Plan C functions added later)**
   - Locally, authenticate with Supabase CLI:
     ```bash
     supabase projects list  # or supabase login
     ```
   - Deploy the existing functions:
     ```bash
     supabase functions deploy team --project-id <your-project-id>
     supabase functions deploy admin --project-id <your-project-id>
     ```
   - Set secrets in Supabase › Project Settings › Edge Functions › Secrets:
     ```
     APP_URL = https://<your-domain>/app/
     SUPABASE_SERVICE_ROLE_KEY = <your-service-role-key>
     ```
   - **Plan C (future):** When Stripe billing is implemented, deploy `billing-checkout` and `stripe-webhook` functions and add:
     ```
     STRIPE_SECRET_KEY = <your-stripe-secret-key>
     STRIPE_WEBHOOK_SECRET = <your-stripe-webhook-secret>
     STRIPE_PRICE_ID = <your-stripe-price-id>
     RESEND_API_KEY = <your-resend-api-key>  (if needed)
     ```

8. **Verify Postgres functions are callable**
   - Supabase › SQL Editor
   - Run: `select platform_status();` (should return `{"accepting_signups": true}`)

### Stripe (billing, Plan C)

1. **Create a Stripe account** at stripe.com
2. **Create a one-time product and price:**
   - Products › Create product
   - Name: "Platform monthly access"
   - Pricing: One-time, MYR 10.00
   - Copy the Price ID (starts with `price_...`)
3. **Set API keys** (secret key) in Supabase Edge Function secrets (above)
4. **Configure webhook:**
   - Stripe › Developers › Webhooks › Add endpoint
   - Endpoint URL: `https://<your-domain>/.netlify/functions/stripe-webhook` (adjust to your hosting)
   - Events: `charge.refunded`, `checkout.session.completed`
   - Copy the signing secret, set as `STRIPE_WEBHOOK_SECRET` in Supabase
5. **Test in test mode** before going live:
   - Use Stripe test card: 4242 4242 4242 4242
   - Use Stripe test FPX (Malaysia): 4000 0900 0000 0002

### Vercel (frontend hosting)

1. **Create a Vercel account** and link your GitHub repo
2. **Create a new project:**
   - Select the `platform-internal` repo
   - Build command: `pnpm build`
   - Output directory: `dist`
3. **Set environment variables** in Vercel › Settings › Environment Variables:
   ```
   VITE_SUPABASE_URL = https://<your-supabase-project>.supabase.co
   VITE_SUPABASE_ANON_KEY = <your-anon-key>
   ```
4. **Deploy:**
   - Vercel auto-deploys on push to `main`
   - Or deploy manually: Vercel CLI (`vercel deploy`)
5. **Set custom domain** (optional):
   - Vercel › Settings › Domains
   - Add your domain (e.g., `platform.com`)
   - Update DNS records as instructed

### App setup (first sign-in)

1. **Create the super-admin profile:**
   - Go to https://<your-domain>/app/ (or localhost:5199/app/ if testing locally)
   - Open browser DevTools Console
   - Run SQL directly via Supabase Studio:
     ```sql
     insert into profiles (user_id, email, name, firm_id, role, status, is_super_admin)
     values (
       '<your-auth-user-id>',  -- get this from Supabase › Authentication › Users › select a user, copy the UID
       'you@example.com',
       'Your Name',
       null,
       'owner',  -- unused but required
       'active',
       true
     );
     ```
   - Or sign up via the app, then manually set `is_super_admin = true` in Postgres

2. **Check the platform is ready:**
   - Navigate to https://<your-domain>/app/#admin (super-admin console)
   - Check "Firms" list (may be empty initially)
   - Check "Platform settings" (firm_cap and trial_days)

### Go-live smoke tests

After deployment, verify:

1. **Homepage loads** at https://<your-domain>/ (fast, no sign-in required)
2. **Sign-up works:**
   - Go to https://<your-domain>/app/#signup
   - Enter firm name, currency, email, password
   - Check email for verification link (Mailosaur inbox if using the test sink)
   - Verify email and sign in
   - Dashboard loads
3. **Trial banner shows:** "14 days left in your trial" (or your configured trial length)
4. **Email works:**
   - Invite a team member from Users › Invite
   - Check your email (Resend inbox or Mailosaur)
   - Follow link, set password, sign in
5. **Sample data loads** (Settings › Data › Load sample data)
6. **Export works:** Clients › Transactions › Export to CSV
7. **Print works:** Clients › Client › Statement › Print (Cmd+P)
8. **Billing works** (Plan C):
   - Click Pay RM 10
   - Follow Stripe Checkout (test mode)
   - Use test card 4242 4242 4242 4242
   - Return to Billing and check "Paid on <date>"
9. **Super-admin console works:** Navigate to #admin as the super-admin
   - Create a new firm manually (test that it doesn't count toward cap)
   - Check the firms list updates
10. **Cap works:** Set platform_settings firm_cap to 2, create 2 self-serve firms, verify the 3rd bounces to waitlist

## Production logs and observability

**Not yet set up:** alerting, uptime checks, error tracking, automatic metrics collection.

**Available once live:**
- **Postgres logs:** Supabase dashboard › Logs (queries, slowest queries, replication)
- **Auth logs:** Supabase dashboard › Authentication › Auth logs
- **Edge Function logs:** Supabase dashboard › Edge Functions › Logs (requests, errors)
- **Frontend logs:** Vercel dashboard › Deployments › Logs and Runtime Logs
- **Email delivery:** Resend dashboard › Emails (bounces, opens, clicks)

**Backups:** Supabase provides automated daily backups (free tier keeps 7 days; enterprise keeps 30).

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

1. Redeploy from local: `supabase functions deploy <function-name> --project-id <your-project-id>`
2. Or use Vercel › Deployments › Promote to Production if the bug is in the frontend/API layer

## Secrets management (critical)

**Never commit secrets to git.** The following are secrets and must be:
- Set in environment variables (Vercel, Supabase, local .env files)
- `.env*.local` files are git-ignored
- `.env.example` lists variable names only (no values)

Secrets:
- `VITE_SUPABASE_ANON_KEY` (public, but don't hardcode; use .env)
- `RESEND_API_KEY` (private; Supabase secret only)
- `STRIPE_SECRET_KEY` (private; Supabase secret only)
- `STRIPE_WEBHOOK_SECRET` (private; Supabase secret only)
- Supabase `SERVICE_ROLE_KEY` (private; Supabase secret only)
- Supabase database password (private; set at project creation)
- Stripe test/live keys (depends on mode; test keys are safe in repos, live are private)

Audit: `git log -S '<api-key-fragment>' -- ':(exclude).gitignore'` to find any accidental commits.

## Important: do NOT run `supabase config push` while local SMTP is disabled

The `supabase/config.toml` has `[auth.email.smtp] enabled = false` locally (to avoid real email sends from dev accounts). **If you run `supabase config push` while this is enabled in the local config, it will push the disabled state to your hosted project and turn off SMTP.**

Instead, use the Supabase dashboard to configure SMTP (Auth › SMTP Settings) and set templates manually (Auth › Email Templates).

## Hosting architecture summary

```
User Browser
    ↓
Vercel (frontend)
    ├→ index.html (/)                  [static page]
    ├→ app/index.html (/app/)          [React app; hash routes]
    └→ demo/index.html (/demo/)        [archived MVP]
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
| Edge Function timeout | Function is too slow or Supabase is down | Check function logs (Supabase › Edge Functions › Logs); increase timeout if needed (default 60s) |
| Database locked / can't run migrations | Stale connection or migration in progress | Restart Supabase: `supabase stop && supabase start` |

## Future: Plan C and beyond

The deployment checklist above covers Plans A and B. Future plans will add:

- **Plan C:** RM 10 one-time payment via Stripe (requires Stripe account, API keys, webhook secret)
- **Plan D:** Product tour, Get started checklist, sample data UX
- **Later sub-projects:** Trust and compliance (audit views, locked periods, bank reconciliation); Client communication (emailed statements, reminders, client portal)

All use the same Supabase and Vercel infrastructure; only new migrations and Edge Functions are needed.
