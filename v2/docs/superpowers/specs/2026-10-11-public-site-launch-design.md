# Public site launch basics — design

Date: 2026-10-11 · Branch: `feat/public-site-launch` · Base: `feat/phase-1-foundation-rbac` @ `b1cd3e0`

## Goal

Make ReportNoReport v2 launch-ready on the public web: legal pages, crawlable and shareable public pages, safe headers, consent-gated analytics, and build-time checks that keep it that way.

## Decisions (from brainstorming)

| # | Decision |
|---|---|
| 1 | Host: **Vercel** (`vercel.json`) |
| 2 | Public pages `/`, `/privacy`, `/terms`; app moves to `/app` (hash routes kept: `/app#/members`) |
| 3 | Analytics: **Vercel Web Analytics**, loaded only after consent |
| 4 | Approach: **Vite multi-page build** — public pages are static HTML, no React/Supabase |
| 5 | Domain: `https://reportnoreport.com` |
| 6 | Legal entity: `[Company name]` placeholder; build fails while it remains |

## 1. Pages and routing

| Source | URL | JS |
|---|---|---|
| `index.html` | `/` landing | `consent.js` only |
| `privacy.html` | `/privacy` | `consent.js` only |
| `terms.html` | `/terms` | `consent.js` only |
| `404.html` | unknown paths | `consent.js` only |
| `app/index.html` | `/app` | `src/main.tsx` (existing app) |

- Current `index.html` (with its appearance boot script) moves to `app/index.html`.
- Public pages carry a theme-only inline boot script so dark mode matches.
- Every `/#/…` link moves to `/app#/…`: auth redirect URLs, the `invite-member` Edge Function, `supabase/config.toml` `site_url` / `additional_redirect_urls`.
- Header (wordmark, Sign in) and footer (Privacy, Terms, Cookie settings) are duplicated HTML across the four public pages — no templating.
- `vercel.json`: `cleanUrls: true`; rewrite `/app/(.*)` → `/app/index.html`; unknown paths → `404.html` with status 404.

## 2. Security and consent

- **Secrets:** keep `readEnv.ts` guard. Add `scripts/check-bundle.mjs`: fails if `dist/` contains `service_role` or `sb_secret_`. Confirm `.env.local` is gitignored.
- **HTTPS:** Vercel redirects HTTP. Add headers on all routes: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **CSP:** out of scope (follow-up).
- **Cookie banner:** `public/consent.js`, plain JS, included on every page including `/app`. Bar styled with `rnr-card` + `rnr-btn`; Accept / Decline / link to `/privacy`. Choice in `localStorage` key `rnr.consent` (`accepted` | `declined`). Footer "Cookie settings" clears it and re-shows the bar. Storage access wrapped in try/catch; no choice = no analytics.

## 3. SEO and sharing

- Unique `<title>` (≤60 chars) and `<meta name="description">` (≤155) per page; British English, sentence case.
- `/app` and `404.html`: `<meta name="robots" content="noindex">`.
- Open Graph + Twitter card tags on public pages; `og:url` absolute on `https://reportnoreport.com`.
- `public/og.png` 1200×630, <100 KB: wordmark + "Report without complicated reporting." on `surface-000`. Built once from SVG via `npx sharp-cli`, committed.
- Favicon: keep `favicon.svg`; add `favicon.ico` (32), `apple-touch-icon.png` (180), `<meta name="theme-color">`.
- `public/sitemap.xml`: `/`, `/privacy`, `/terms`. `public/robots.txt`: allow `/`, disallow `/app`, `Sitemap:` line.
- `404.html`: "This page doesn't exist." + links Home, Sign in.

## 4. Content, images, speed, analytics

- **Privacy:** data collected (account email, organisation data, anonymous page views), Supabase as processor, storage location, retention, deletion, contact, local storage used (auth session, appearance, consent). "Last updated" date.
- **Terms:** acceptable use, accounts and organisations, trial and payment, liability, termination, governing law. Draft only — legal review before launch.
- **Alt text:** every `<img>` has `alt` (decorative = `alt=""`); icons in `src/ui/icons.tsx` get `aria-hidden="true"`.
- **Images:** compressed once; build fails on any image in `dist/` over 200 KB.
- **Speed:** public pages ship only `consent.js`; preload Inter; `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`. Lighthouse run once against `vercel dev`, scores recorded in the PR; target ≥95 in all four categories on public pages.
- **Analytics:** add `@vercel/analytics`; `consent.js` injects `/_vercel/insights/script.js` after Accept. Tracks public pages and `/app`.

## Build checks

`pnpm build` → `vite build` → `node scripts/check-dist.mjs`, which fails on:
1. `service_role` / `sb_secret_` anywhere in `dist/`
2. an internal `href`/`src` in `dist/**/*.html` that does not resolve to a file
3. `<img>` without `alt`
4. image file > 200 KB
5. `[Company name]` still present

One script, no new dependency. Unit test: `scripts/check-dist.test.mjs` with fixture HTML for each rule.

## Out of scope

Content-Security-Policy · a CMS for legal text · i18n · server-side rendering of `/app` · cookie-setting analytics.

## Success criteria

- `/`, `/privacy`, `/terms` render without JS beyond `consent.js`; `/app` works as today.
- Unknown path returns HTTP 404 with the custom page.
- Sharing `https://reportnoreport.com` shows title, description and `og.png`.
- No analytics request before Accept; one after.
- `pnpm build` fails on each of the five check rules.
- Lighthouse ≥95 ×4 on public pages.
