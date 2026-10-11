# Go live: v2 on reportnoreport.com, v1 on ledger.reportnoreport.com

Every step is done by the owner, in this order, in the Supabase, Vercel, DNS (Cloudflare), Resend and GitHub dashboards. Secret **values** never go in this file, a pull request, an issue or a chat; where a step says "generate", store the value in the password manager first, then paste it where the step says.

## 0. Before you start

- [ ] PR #45 is green and the Phase 7 QA report (`docs/superpowers/qa/phase-7-round-1.md`) passes.
- [ ] The landing page prices are filled in: `grep -n "TBD price" v2/index.html` prints nothing (`pnpm build` refuses to build while it does).
- [ ] You can sign in to: the Supabase organisation that owns the v1 project, the Vercel team that owns the v1 project, Cloudflare for `reportnoreport.com`, Resend, and the GitHub repository settings.
- [ ] Pick a quiet hour for section D (the domain move); sections A–C cause no downtime.

## A. Move v1 to ledger.reportnoreport.com (before merging)

Merging #45 changes v1's `deploy.yml`, so v1 deploys once on that merge and sets its `APP_URL` to the ledger address. The ledger address must work before then.

1. **Cloudflare → DNS:** add `CNAME ledger → cname.vercel-dns.com`, proxy status **DNS only**.
2. **Vercel → v1 project → Settings → Domains:** add `ledger.reportnoreport.com`; wait until it shows a valid certificate.
3. **Supabase → v1 project → Authentication → URL Configuration → Redirect URLs:** add
   `https://ledger.reportnoreport.com/app/`, `https://ledger.reportnoreport.com/app/?flow=set-password`, `https://ledger.reportnoreport.com/app/**`, `https://ledger.reportnoreport.com/**`.
   Keep the existing `reportnoreport.com` entries and the Site URL for now.
4. Check: `https://ledger.reportnoreport.com/app/` shows v1 and a v1 user can sign in.
5. **Vercel → v1 project → Settings → Git:** confirm production deploys come only from the GitHub workflow (no automatic Git production deploys), so merging #45 cannot trigger a second v1 build.

## B. Create the v2 backend

6. **Supabase → New project** `reportnoreport-v2`, same organisation and region as v1. Generate a database password and store it.
7. **Supabase → v2 → Authentication → URL Configuration:** Site URL `https://reportnoreport.com/app/`; Redirect URLs `https://reportnoreport.com/app/`, `https://reportnoreport.com/app/?flow=set-password`, `https://reportnoreport.com/app/**`.
8. **Supabase → v2 → Authentication → SMTP:** the same Resend SMTP settings as v1 (root `docs/operations.md`), sender `noreply@mail.reportnoreport.com`.
9. **Supabase → Account → Access tokens:** create a token named `github-deploy-v2` and store it.
10. **Resend:** add the sending subdomain `mail.reportnoreport.com` (Domains → Add domain), add the DNS records Resend lists in Cloudflare, and wait for it to verify. Using a subdomain keeps v2's open and click tracking off v1's emails. Create an API key `v2 production` (sending access) and store it. Add a webhook to `https://<v2 project ref>.supabase.co/functions/v1/resend-webhook` for `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, and store its signing secret (`whsec_...`). Use `ReportNoReport <noreply@mail.reportnoreport.com>` for `V2_EMAIL_FROM` and as the sender in step 8.
11. **Generate** two random values of 32+ characters (`openssl rand -hex 32`) for `V2_CRON_SECRET` and `V2_UNSUBSCRIBE_SECRET`, and store them.
12. **GitHub → Settings → Environments → New environment** `production-v2`.
    Secrets: `SUPABASE_V2_ACCESS_TOKEN` (step 9), `SUPABASE_V2_DB_PASSWORD` (step 6), `V2_CRON_SECRET`, `V2_UNSUBSCRIBE_SECRET` (step 11), `V2_RESEND_API_KEY`, `V2_RESEND_WEBHOOK_SECRET` (step 10), `VERCEL_TOKEN` (the same Vercel token v1's `production` environment uses, or a new one).
    Variables: `SUPABASE_V2_PROJECT_REF` (the v2 project ref), `VERCEL_ORG_ID` (as v1), `VERCEL_V2_PROJECT_ID` (step 13), `V2_EMAIL_FROM` (`ReportNoReport <noreply@mail.reportnoreport.com>`).
13. **Vercel → v2 project** (create it, or reuse the existing v2 preview project): Root Directory `v2`, framework Vite (build and output come from `v2/vercel.json`). Settings → Environment Variables → Production: `VITE_SUPABASE_URL` = `https://<v2 project ref>.supabase.co`, `VITE_SUPABASE_ANON_KEY` = the v2 project's anon (publishable) key. Settings → Git: no automatic production deploys (the workflow deploys). Copy the Project ID into `VERCEL_V2_PROJECT_ID`.

## C. Merge and deploy

14. **Merge #45** into `main`. Two workflows start:
    - **Deploy** (v1): runs because `deploy.yml` changed; redeploys v1 unchanged and sets v1's `APP_URL` to `https://ledger.reportnoreport.com/app/`.
    - **Deploy v2**: CI v2, then `supabase db push` and the function secrets and functions on the v2 project, then the Vercel production deploy of `v2/` (live on the v2 project's `*.vercel.app` address; the domain is still v1's).
    If `db push` stops at `create extension pg_cron` / `pg_net`, enable both in **Supabase → v2 → Database → Extensions** and re-run the workflow.
15. **Supabase → v2 → SQL editor**, once, with your values in place of the angle brackets (these are the Vault secrets `supabase/seed.sql` creates locally):
    ```sql
    select vault.create_secret('<V2_CRON_SECRET>', 'cron_secret');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/resume', 'resume_url');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-messages', 'send_messages_url');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/render-pdfs', 'render_pdfs_url');
    select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-campaigns', 'send_campaigns_url');
    select jobname, schedule, active from cron.job order by jobname;   -- expect render-pdfs, resume, send-campaigns, send-messages
    ```
16. **Smoke test on the `*.vercel.app` address:** add it temporarily to the v2 Redirect URLs (step 7), sign up, create an organisation, publish a form and a workflow, submit a record, receive the workflow email, render a PDF, send a campaign to yourself and unsubscribe from it. Then remove the temporary redirect URL.

## D. Move the domain (quiet hour)

17. **Vercel → v1 project → Domains:** remove `reportnoreport.com` (and `www.reportnoreport.com` if present). **Vercel → v2 project → Domains:** add them (`www` redirecting to the apex). DNS already points at Vercel, so no DNS change is needed; expect under a minute while the certificate attaches.
18. **Supabase → v1 → Authentication → URL Configuration:** Site URL `https://ledger.reportnoreport.com/app/`; remove the `reportnoreport.com` redirect entries so a v1 email can never land on v2.
19. Tell v1 users their address is now `https://ledger.reportnoreport.com/app/`. Links in emails v1 sent before the move (invites, password resets) now open v2 and will fail there; resend any pending v1 invites from the ledger address.

## E. Verify

- [ ] `https://reportnoreport.com/` shows the v2 landing; `/app/` signs in to v2; `/privacy`, `/terms`, `/unsubscribe` and a missing page (404) render.
- [ ] `curl -sI https://reportnoreport.com/ | grep -i strict-transport-security` shows the header from `v2/vercel.json`.
- [ ] `https://ledger.reportnoreport.com/app/` signs in to v1 with an existing v1 user; a v1 email (invite or reset) links to the ledger address.
- [ ] A v2 workflow email links to `https://reportnoreport.com/app/`; a v2 campaign email's unsubscribe link opens `https://reportnoreport.com/unsubscribe`.
- [ ] Resend → Webhooks shows 200 responses from the v2 endpoint.
- [ ] Supabase → v2 → SQL: `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 8;` shows succeeded runs.
- [ ] GitHub → Actions: the latest **Deploy v2** run is green; the latest **Deploy** (v1) run is green.

## F. Roll back

- **Domain (back to v1 on reportnoreport.com):** Vercel → v2 project → Domains: remove `reportnoreport.com` / `www`; v1 project: add them back. Supabase → v1 → Authentication: Site URL `https://reportnoreport.com/app/` and re-add its redirect URLs. Set v1's `APP_URL` back with `supabase secrets set --project-ref <v1 ref> APP_URL=https://reportnoreport.com/app/`, and revert the `deploy.yml` edits in a pull request before v1's next deploy (or it sets the ledger URL again). `ledger.reportnoreport.com` can stay attached to v1.
- **Stop v2 sending while rolled back:** Supabase → v2 → SQL: `update cron.job set active = false;` (`true` to resume).
- **A bad v2 web deploy:** Vercel → v2 project → Deployments → promote the previous production deployment.
- **A bad v2 migration:** migrations are forward-only; write a fixing migration and merge it. Never `supabase db reset` against a hosted project.

## Never

- Never put a secret value in this repository, a pull request, an issue, a chat or a screenshot.
- Never point v2's workflow at v1's project, or v1's at v2's: v1 uses the `production` environment, v2 uses `production-v2`.
