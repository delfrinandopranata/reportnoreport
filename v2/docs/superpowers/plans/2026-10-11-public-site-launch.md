# Public Site Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/`, `/privacy`, `/terms` and a custom 404 as static pages beside the app (moved to `/app`), with Vercel headers, consent-gated analytics, SEO assets and a build-time `dist/` check.

**Architecture:** Vite multi-page build. Public pages are plain HTML that link one shared CSS entry (`src/site/site.css`) and one plain script (`public/consent.js`) — no React, no Supabase. The existing React app moves from `index.html` to `app/index.html`. `vercel.json` owns routing, headers and caching. `scripts/check-dist.mjs` fails the build on leaked secrets, broken internal links, missing `alt`, images over 200 KB and leftover `[…]` placeholders.

**Tech Stack:** Vite 8 multi-page, Tailwind 4, design tokens in `design/`, Vercel, Node 24 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-11-public-site-launch-design.md`

## Global Constraints

- Domain: `https://reportnoreport.com` (absolute URLs in sitemap, robots, `og:url`, `og:image`).
- Name: `ReportNoReport` everywhere, including Terms and Privacy. Footer: `© 2026 ReportNoReport`. Governing law: Malaysia.
- Copy: British English, sentence case, no emoji, buttons start with a verb (`design/README.md`).
- Colours only via design tokens (`var(--…)` or the Tailwind names mapped in `src/index.css`); no hex in pages.
- Public pages load no JS except `/consent.js` and the inline theme boot.
- New npm dependencies: none. (Spec listed `@vercel/analytics`; the cookieless `/_vercel/insights/script.js` tag does the same job with no package.)
- `title` ≤ 60 chars, `meta description` ≤ 155 chars.
- Images in `dist/` ≤ 200 KB each; `og.png` < 100 KB.
- `localStorage` access always inside `try/catch`.

## Review Focus

1. **Old bookmarks `/#/members`** now hit the landing page → must forward to `/app#/members`. Pinned by the inline redirect in `index.html` (Task 4, Step 3) and browser check (Task 8).
2. **Reload on `/app#/roles` or `/app` without trailing slash** → must serve the app, not the 404. Pinned by `vercel.json` rewrites (Task 2) and `vercel dev` check (Task 8).
3. **`localStorage` blocked (private window / Safari ITP)** → banner shows, buttons still hide it, no console error, no analytics. Pinned in `consent.js` try/catch and Task 7 Step 4.
4. **Invite and sign-up confirmation emails** must land on `/app/`, not the landing page. Pinned in Task 2 (invite Edge Function + `emailRedirectTo`) with a Deno test.
5. **Link checker false negatives on `/privacy` (clean URL)** → `/privacy` must resolve to `dist/privacy.html`; `/app/` to `dist/app/index.html`. Pinned by `check-dist.test.mjs` cases in Task 1.

---

## File map

| File | Responsibility |
|---|---|
| `scripts/check-dist.mjs` | Pure rule functions + CLI that scans `dist/` |
| `scripts/check-dist.test.mjs` | Unit tests for each rule |
| `vite.config.ts` | Multi-page inputs |
| `app/index.html` | App entry (moved from `index.html`) |
| `index.html` / `privacy.html` / `terms.html` / `404.html` | Public pages |
| `src/site/site.css` | Public-page CSS entry: tokens, bundle, Tailwind, prose |
| `public/consent.js` | Cookie banner + analytics loader |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `og.png` | Brand assets |
| `scripts/assets/og.svg`, `scripts/assets/mark.svg` | Sources for the PNGs (not shipped) |
| `public/sitemap.xml`, `public/robots.txt` | Crawl files |
| `vercel.json` | Build, rewrites, headers, cache |
| `supabase/functions/invite-member/index.ts:36` | Redirect to `/app/` |
| `src/auth/AuthPage.tsx:26` | `emailRedirectTo` `/app/` |
| `supabase/config.toml:160-164` | Local `site_url` + redirect allow-list |

---

### Task 1: `dist/` checker

**Files:**
- Create: `scripts/check-dist.mjs`
- Test: `scripts/check-dist.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `findSecrets(text) → string[]`, `findMissingAlt(html) → string[]`, `findPlaceholders(text) → string[]`, `internalRefs(html) → string[]`, `resolveRef(ref, fromFile, exists) → boolean` where `exists(path: string) → boolean` and paths are relative to `dist/`. CLI: `node scripts/check-dist.mjs [dir=dist]` exits 1 with one line per problem.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/check-dist.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSecrets, findMissingAlt, findPlaceholders, internalRefs, resolveRef } from './check-dist.mjs'

test('flags service-role and secret keys', () => {
  assert.deepEqual(findSecrets('a "role":"service_role" b'), ['service_role'])
  assert.deepEqual(findSecrets('x sb_secret_abc123 y'), ['sb_secret_'])
  assert.deepEqual(findSecrets('anon key only'), [])
})

test('flags <img> without alt, accepts alt=""', () => {
  assert.deepEqual(findMissingAlt('<img src="/a.png"><img src="/b.png" alt="">'), ['<img src="/a.png">'])
  assert.deepEqual(findMissingAlt('<img alt="Logo" src="/c.png">'), [])
})

test('flags leftover placeholders but not markdown-ish brackets in code', () => {
  assert.deepEqual(findPlaceholders('Governed by [Governing law].'), ['[Governing law]'])
  assert.deepEqual(findPlaceholders('[TBD] and [Company name]'), ['[TBD]', '[Company name]'])
  assert.deepEqual(findPlaceholders('arr[0] and [data-theme="dark"]'), [])
})

test('collects internal href/src only', () => {
  const html = '<a href="/privacy">p</a><a href="https://x.com">x</a><a href="mailto:a@b.c">m</a><a href="#top">t</a><link href="/assets/s.css"><script src="/consent.js"></script>'
  assert.deepEqual(internalRefs(html), ['/privacy', '/assets/s.css', '/consent.js'])
})

test('resolves clean URLs, directories and hashes', () => {
  const files = new Set(['privacy.html', 'app/index.html', 'index.html', 'consent.js'])
  const exists = (p) => files.has(p)
  assert.equal(resolveRef('/privacy', 'index.html', exists), true)
  assert.equal(resolveRef('/app/', 'index.html', exists), true)
  assert.equal(resolveRef('/app#/members', 'index.html', exists), true)
  assert.equal(resolveRef('/', 'privacy.html', exists), true)
  assert.equal(resolveRef('/consent.js', 'index.html', exists), true)
  assert.equal(resolveRef('/pricing', 'index.html', exists), false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/check-dist.test.mjs`
Expected: FAIL — `Cannot find module './check-dist.mjs'`

- [ ] **Step 3: Implement**

```js
// scripts/check-dist.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_IMAGE_BYTES = 200 * 1024
const IMAGE = /\.(png|jpe?g|webp|avif|gif|ico)$/i

export const findSecrets = (text) => ['service_role', 'sb_secret_'].filter((s) => text.includes(s))
export const findMissingAlt = (html) => (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => !/\balt\s*=/i.test(tag))
export const findPlaceholders = (text) => text.match(/\[(?:Company name|Governing law|TBD|TODO)[^\]]*\]/g) ?? []

export const internalRefs = (html) =>
  [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((r) => r.startsWith('/') && !r.startsWith('//'))

export const resolveRef = (ref, _fromFile, exists) => {
  const path = ref.split(/[?#]/)[0].replace(/^\//, '')
  if (path === '' || path.endsWith('/')) return exists(`${path}index.html`)
  return exists(path) || exists(`${path}.html`) || exists(`${path}/index.html`)
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

export function checkDist(dir) {
  const problems = []
  const exists = (p) => existsSync(join(dir, p))
  for (const file of walk(dir)) {
    const rel = relative(dir, file)
    if (IMAGE.test(rel)) {
      const size = statSync(file).size
      if (size > MAX_IMAGE_BYTES) problems.push(`${rel}: image is ${Math.round(size / 1024)} KB (max 200 KB)`)
      continue
    }
    if (!/\.(html|js|css|xml|txt|json)$/.test(rel)) continue
    const text = readFileSync(file, 'utf8')
    for (const s of findSecrets(text)) problems.push(`${rel}: contains "${s}"`)
    if (!rel.endsWith('.html')) continue
    for (const p of findPlaceholders(text)) problems.push(`${rel}: placeholder ${p}`)
    for (const tag of findMissingAlt(text)) problems.push(`${rel}: <img> without alt: ${tag}`)
    for (const ref of internalRefs(text)) if (!resolveRef(ref, rel, exists)) problems.push(`${rel}: broken link ${ref}`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkDist(process.argv[2] ?? 'dist')
  for (const p of problems) console.error(p)
  if (problems.length) process.exit(1)
  console.log('check-dist: ok')
}
```

Note: `/_vercel/insights/script.js` is only injected at runtime by `consent.js`, so it never appears in HTML and needs no allow-list.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/check-dist.test.mjs`
Expected: 5 passing

- [ ] **Step 5: Wire into package.json**

```json
"build": "tsc -b && vite build && node scripts/check-dist.mjs",
"test": "node --test 'src/**/*.test.ts' 'scripts/*.test.mjs'",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-dist.mjs scripts/check-dist.test.mjs package.json
git commit -m "feat: add dist checker for secrets, links, alt text, image size and placeholders"
```

---

### Task 2: Move the app to `/app` and add Vercel config

**Files:**
- Move: `index.html` → `app/index.html` (`git mv`)
- Modify: `vite.config.ts`
- Modify: `src/auth/AuthPage.tsx:26`
- Modify: `supabase/functions/invite-member/index.ts:36`
- Modify: `supabase/config.toml:160-164`
- Create: `vercel.json`
- Test: `supabase/functions/invite-member/` existing Deno tests (extend)

**Interfaces:**
- Produces: build output `dist/app/index.html`; Vite inputs keyed `main`, `privacy`, `terms`, `notFound`, `app` (later tasks create those files).

- [ ] **Step 1: Move the entry and fix its script path**

```bash
mkdir -p app && git mv index.html app/index.html
```

In `app/index.html` change `src="/src/main.tsx"` — it stays `/src/main.tsx` (root-absolute works from any page). Add inside `<head>` after `<title>`:

```html
<meta name="robots" content="noindex">
```

- [ ] **Step 2: Multi-page inputs**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const page = (p: string) => resolve(import.meta.dirname, p)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        privacy: page('privacy.html'),
        terms: page('terms.html'),
        notFound: page('404.html'),
        app: page('app/index.html'),
      },
    },
  },
})
```

Until Tasks 4–6 create the public HTML files, temporarily stub each with `<!doctype html><title>stub</title>` so `vite build` runs. Each later task overwrites its stub.

- [ ] **Step 3: Email redirects land on `/app/`**

`src/auth/AuthPage.tsx:26`:

```ts
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/app/` } })
```

`supabase/functions/invite-member/index.ts:36`:

```ts
  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${req.headers.get('origin') ?? ''}/app/` })
```

Add to the existing invite-member Deno test file an assertion that the `redirectTo` passed to the mocked `inviteUserByEmail` ends with `/app/` (follow the mock pattern already in that file).

`supabase/config.toml`:

```toml
site_url = "http://127.0.0.1:5173/app/"
additional_redirect_urls = ["http://127.0.0.1:5173/app/", "http://localhost:5173/app/", "https://reportnoreport.com/app/"]
```

- [ ] **Step 4: `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [{ "source": "/app", "destination": "/app/", "permanent": true }],
  "rewrites": [{ "source": "/app/:path*", "destination": "/app/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

Vercel serves `dist/404.html` with status 404 for unmatched paths automatically. `trailingSlash: false` plus the explicit `/app` → `/app/` redirect keeps the app's relative asset paths valid.

- [ ] **Step 5: Verify**

Run: `pnpm build && ls dist/app/index.html && deno test supabase/functions && pnpm test`
Expected: build prints `check-dist: ok`; file exists; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/index.html vite.config.ts vercel.json src/auth/AuthPage.tsx supabase/functions/invite-member supabase/config.toml index.html privacy.html terms.html 404.html
git commit -m "feat: serve the app from /app and add Vercel routing and security headers"
```

---

### Task 3: Brand assets and public-page CSS

**Files:**
- Create: `src/site/site.css`
- Replace: `public/favicon.svg` (currently the default Vite bolt)
- Create: `scripts/assets/mark.svg`, `scripts/assets/og.svg`
- Create: `public/favicon.ico`, `public/apple-touch-icon.png`, `public/og.png`

**Interfaces:**
- Produces: CSS classes `site-header`, `site-footer`, `site-main`, `prose` used by Tasks 4–6. Asset URLs `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png`, `/og.png`.

- [ ] **Step 1: Site CSS**

```css
/* src/site/site.css — public pages only */
@import "../../design/tokens.css";
@import "../../design/components/bundle.css";
@import "tailwindcss";

body { background: var(--surface-000); color: var(--ink); font-family: "Inter", ui-sans-serif, system-ui, sans-serif; margin: 0; }
.site-header, .site-footer, .site-main { max-width: 64rem; margin: 0 auto; padding: 1.5rem 1rem; }
.site-header { display: flex; align-items: center; justify-content: space-between; }
.site-footer { display: flex; flex-wrap: wrap; gap: 1rem; color: var(--ink-muted); border-top: 1px solid var(--line-100); font-size: 14px; }
.site-footer a, .prose a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.mark { width: 40px; height: 40px; border-radius: var(--radius-lg); background: var(--brand-solid); color: var(--brand-solid-ink); display: grid; place-items: center; font-weight: 700; font-size: 14px; }
.prose { max-width: 42rem; line-height: 1.6; }
.prose h1 { font-size: 28px; line-height: 36px; font-weight: 600; margin: 0 0 .5rem; }
.prose h2 { font-size: 18px; line-height: 28px; font-weight: 600; margin: 2rem 0 .5rem; }
.prose p, .prose li { color: var(--ink-label); }
.prose .updated { color: var(--ink-muted); font-size: 14px; }
```

- [ ] **Step 2: Mark SVG (favicon source and replacement)**

`scripts/assets/mark.svg` and `public/favicon.svg` (same content):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#18181b"/><text x="32" y="43" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">R</text></svg>
```

(Hex is allowed here: a standalone image file cannot read CSS tokens. Values copy `--ink` light / white.)

- [ ] **Step 3: OG source**

`scripts/assets/og.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fafafa"/>
  <rect x="96" y="96" width="96" height="96" rx="20" fill="#18181b"/>
  <text x="144" y="162" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">R</text>
  <text x="96" y="330" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="600" fill="#18181b">Report<tspan fill="#a1a1aa">No</tspan>Report</text>
  <text x="96" y="420" font-family="Inter, Arial, sans-serif" font-size="40" fill="#52525b">Report without complicated reporting.</text>
</svg>
```

- [ ] **Step 4: Render PNGs (one-off, not part of the build)**

```bash
npx --yes sharp-cli@5 -i scripts/assets/og.svg -o public/og.png -f png --compressionLevel 9 --palette
npx --yes sharp-cli@5 -i scripts/assets/mark.svg -o public/apple-touch-icon.png resize 180 180 -f png --compressionLevel 9
npx --yes sharp-cli@5 -i scripts/assets/mark.svg -o public/favicon.ico resize 32 32 -f png
ls -l public/og.png public/apple-touch-icon.png public/favicon.ico
```

Expected: `og.png` < 100 KB. `favicon.ico` is PNG bytes under an `.ico` name — every current browser and crawler accepts it. (shortcut: PNG-in-.ico, upgrade to a true multi-size ICO only if a legacy client needs it.)

- [ ] **Step 5: Commit**

```bash
git add src/site/site.css public/favicon.svg public/favicon.ico public/apple-touch-icon.png public/og.png scripts/assets
git commit -m "feat: add brand favicon, social preview image and public page styles"
```

---

### Task 4: Landing page `/`

**Files:**
- Replace stub: `index.html`

**Interfaces:**
- Consumes: `src/site/site.css`, `/consent.js` (Task 7 — until then the tag 404s harmlessly in dev; `check-dist` passes once Task 7 lands, so run Task 7 before the final build, or build with the stub `public/consent.js` created in Step 1).

- [ ] **Step 1: Create an empty `public/consent.js` placeholder** so the link check passes now: `printf '' > public/consent.js` (Task 7 fills it).

- [ ] **Step 2: Shared head block** — every public page uses this head, changing only title, description, canonical path and robots:

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ReportNoReport — report without complicated reporting</title>
    <meta name="description" content="Build forms, dashboards and reports for your school or HR team without complicated reporting. Drag, drop and share." />
    <link rel="canonical" href="https://reportnoreport.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="ReportNoReport" />
    <meta property="og:title" content="ReportNoReport — report without complicated reporting" />
    <meta property="og:description" content="Build forms, dashboards and reports for your school or HR team without complicated reporting." />
    <meta property="og:url" content="https://reportnoreport.com/" />
    <meta property="og:image" content="https://reportnoreport.com/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="ReportNoReport — report without complicated reporting." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/src/site/site.css" />
    <script>
      (() => {
        let s = {}
        try { s = JSON.parse(localStorage.getItem('rnr.appearance') || '{}') } catch {}
        const dark = s.theme === 'dark' || (!s.theme || s.theme === 'system') && matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      })()
    </script>
    <script src="/consent.js" defer></script>
  </head>
```

- [ ] **Step 3: Landing body** (append to the head above in `index.html`)

```html
  <body class="rnr">
    <script>
      // Old app bookmarks were /#/members; the app now lives at /app.
      if (location.hash.startsWith('#/')) location.replace('/app/' + location.hash)
    </script>
    <header class="site-header">
      <a href="/" class="flex items-center gap-3" aria-label="ReportNoReport home">
        <span class="mark" aria-hidden="true">R</span>
        <span class="wordmark" aria-hidden="true">Report<span style="color: var(--ink-faint)">No</span>Report</span>
      </a>
      <a class="rnr-btn rnr-btn-secondary" href="/app/">Sign in</a>
    </header>
    <main class="site-main flex flex-col gap-6" style="padding-top: 4rem; padding-bottom: 4rem">
      <h1 class="page-title" style="font-size: 40px; line-height: 48px; max-width: 36rem">Report without complicated <span class="rnr-strike">r</span>eporting.</h1>
      <p class="body" style="max-width: 32rem; color: var(--ink-label)">Build forms, dashboards and reports for your school or HR team. Drag, drop and share — no spreadsheets to untangle.</p>
      <div class="flex gap-3">
        <a class="rnr-btn rnr-btn-primary" href="/app/#/members">Start free trial</a>
        <a class="rnr-btn rnr-btn-ghost" href="/app/">Sign in</a>
      </div>
    </main>
    <footer class="site-footer">
      <span>© 2026 ReportNoReport</span>
      <a href="/privacy">Privacy policy</a>
      <a href="/terms">Terms and conditions</a>
      <button type="button" class="rnr-btn rnr-btn-ghost" data-consent-settings>Cookie settings</button>
    </footer>
  </body>
</html>
```

- [ ] **Step 4: Verify**

Run: `pnpm build`
Expected: `check-dist: ok`; `dist/index.html` exists and contains no `<script type="module"`.

Run: `grep -c 'type="module"' dist/index.html` → `0`

- [ ] **Step 5: Commit**

```bash
git add index.html public/consent.js
git commit -m "feat: add public landing page"
```

---

### Task 5: Privacy and terms pages

**Files:**
- Replace stubs: `privacy.html`, `terms.html`

Both use the Task 4 Step 2 head with these substitutions, and the Task 4 header and footer verbatim. The landing-only bookmark-redirect script is **not** included.

| Page | `<title>` / `og:title` | description / `og:description` | canonical / `og:url` |
|---|---|---|---|
| privacy | `Privacy policy — ReportNoReport` | `How ReportNoReport collects, uses and protects your data across Malaysia, Singapore, Indonesia and beyond.` | `https://reportnoreport.com/privacy` |
| terms | `Terms and conditions — ReportNoReport` | `The terms that apply when you or your organisation use ReportNoReport.` | `https://reportnoreport.com/terms` |

- [ ] **Step 1: `privacy.html` `<main>`**

```html
    <main class="site-main"><article class="prose">
      <h1>Privacy policy</h1>
      <p class="updated">Last updated: 11 October 2026</p>
      <p>This policy explains how ReportNoReport ("we", "us") handles personal data when you use reportnoreport.com and the ReportNoReport app. It applies to users in Malaysia, Singapore, Indonesia and every other country we serve.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> your email address and password (stored hashed).</li>
        <li><strong>Organisation data:</strong> organisation names, member roles, and the forms, records and reports you or your team create.</li>
        <li><strong>Usage data:</strong> anonymous page views (page address, referrer, country and device type), only if you accept analytics.</li>
      </ul>

      <h2>How we use it</h2>
      <p>To provide and secure the service, sign you in, send invitations and service emails, and understand which pages are used so we can improve them. We do not sell personal data or use it for advertising.</p>

      <h2>Who processes it</h2>
      <p>We use Supabase to store data and run authentication, and Vercel to host the website and measure anonymous page views. Both act on our instructions under data processing terms.</p>

      <h2>Where it is stored and cross-border transfers</h2>
      <p>Data may be stored and processed outside your country. When we transfer data abroad we rely on contractual safeguards that give it a standard of protection comparable to the law of your country.</p>

      <h2>How long we keep it</h2>
      <p>We keep account and organisation data while your account is active. When you delete your account or your organisation closes it, we delete the data within 30 days, except where the law requires us to keep it longer.</p>

      <h2>Cookies and local storage</h2>
      <p>We do not set advertising or tracking cookies. Your browser's local storage holds your sign-in session, your appearance settings and your cookie choice; these are needed for the service to work. Anonymous analytics run only after you select "Accept" in the cookie banner. You can change your choice at any time with "Cookie settings" at the bottom of each page.</p>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Malaysia (Personal Data Protection Act 2010):</strong> access and correct your data, withdraw consent, and limit processing.</li>
        <li><strong>Singapore (Personal Data Protection Act 2012):</strong> access and correct your data, and withdraw consent.</li>
        <li><strong>Indonesia (Law No. 27 of 2022 on Personal Data Protection):</strong> access, correct, delete and obtain a copy of your data, withdraw consent, and object to automated decisions.</li>
        <li><strong>European Economic Area and United Kingdom (GDPR):</strong> access, correct, delete, restrict, port and object, and complain to your data protection authority.</li>
      </ul>
      <p>If your organisation added you, it controls its own records; we will pass your request to it and help it respond.</p>

      <h2>Contact and data requests</h2>
      <p>Email <a href="mailto:privacy@reportnoreport.com">privacy@reportnoreport.com</a>. We reply within 21 days.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above and, for significant changes, tell you by email or in the app.</p>
    </article></main>
```

- [ ] **Step 2: `terms.html` `<main>`**

```html
    <main class="site-main"><article class="prose">
      <h1>Terms and conditions</h1>
      <p class="updated">Last updated: 11 October 2026</p>
      <p>These terms apply when you or your organisation use ReportNoReport ("we", "us"). By creating an account you agree to them on behalf of yourself and, if you invite others, your organisation.</p>

      <h2>Accounts and organisations</h2>
      <p>You must give a valid email address and keep your password safe. The owner of an organisation decides who joins it and what each member can do, and is responsible for their members' use of the service.</p>

      <h2>Acceptable use</h2>
      <p>Do not use ReportNoReport to break the law, upload malware, collect data you have no right to collect, try to reach another organisation's data, or overload or probe the service.</p>

      <h2>Your content</h2>
      <p>You own the forms, records and reports you create. You give us permission to store and process them only to run the service for you. Our <a href="/privacy">privacy policy</a> explains how we handle personal data.</p>

      <h2>Trial and payment</h2>
      <p>New organisations start with a free trial. When it ends, editing stops until a plan is paid; your data stays readable. Prices are shown in the app before you pay and include any tax stated there.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep the service available but do not promise it will never be interrupted. We may change features; if a change removes something you rely on, we will tell you in advance where we can.</p>

      <h2>Liability</h2>
      <p>The service is provided as it is. As far as the law allows, we are not liable for indirect or consequential loss, and our total liability in any 12 months is limited to the amount your organisation paid us in that period. Nothing here limits liability that the law does not allow us to limit.</p>

      <h2>Ending your use</h2>
      <p>You can delete your account at any time. We may suspend or close an account that breaks these terms, after warning you where it is reasonable to do so. You can export your data before closure.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction over any dispute. This does not remove protections that the law of your own country gives you as a consumer.</p>

      <h2>Contact</h2>
      <p>Email <a href="mailto:hello@reportnoreport.com">hello@reportnoreport.com</a>.</p>
    </article></main>
```

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: `check-dist: ok` (no placeholders, links resolve).

- [ ] **Step 4: Commit**

```bash
git add privacy.html terms.html
git commit -m "feat: add privacy policy and terms pages"
```

---

### Task 6: Custom 404 page

**Files:**
- Replace stub: `404.html`

- [ ] **Step 1: Write the page** — Task 4 Step 2 head with: title `Page not found — ReportNoReport`, description `This page doesn't exist.`, **remove** `canonical` and all `og:*`/`twitter:*` tags, add `<meta name="robots" content="noindex">`. Task 4 header and footer verbatim. Main:

```html
    <main class="site-main flex flex-col gap-4" style="padding-top: 4rem; padding-bottom: 4rem">
      <p class="overline" style="color: var(--ink-muted)">404</p>
      <h1 class="page-title">This page doesn't exist.</h1>
      <p class="body" style="color: var(--ink-label)">Check the address, or go back to the home page.</p>
      <div class="flex gap-3">
        <a class="rnr-btn rnr-btn-primary" href="/">Go to home page</a>
        <a class="rnr-btn rnr-btn-secondary" href="/app/">Sign in</a>
      </div>
    </main>
```

All asset URLs in this page are root-absolute (`/src/site/site.css`, `/consent.js`, `/favicon.svg`), so it renders correctly at any nested missing path such as `/a/b/c`.

- [ ] **Step 2: Verify** — `pnpm build` → `check-dist: ok`.

- [ ] **Step 3: Commit**

```bash
git add 404.html
git commit -m "feat: add custom 404 page"
```

---

### Task 7: Cookie banner and consent-gated analytics

**Files:**
- Replace: `public/consent.js`
- Modify: `app/index.html` (add `<script src="/consent.js" defer></script>` in `<head>`)

**Interfaces:**
- `localStorage['rnr.consent']` ∈ `'accepted' | 'declined'`; absent = undecided.
- Any element with `data-consent-settings` reopens the banner.

- [ ] **Step 1: Implement**

```js
// public/consent.js — plain script, shared by every page including /app
(() => {
  const KEY = 'rnr.consent'
  const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
  const write = (v) => { try { localStorage.setItem(KEY, v) } catch {} }
  const clear = () => { try { localStorage.removeItem(KEY) } catch {} }

  let loaded = false
  const loadAnalytics = () => {
    if (loaded) return
    loaded = true
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
    const s = document.createElement('script')
    s.src = '/_vercel/insights/script.js'
    s.defer = true
    document.head.appendChild(s)
  }

  let bar = null
  const hide = () => { bar?.remove(); bar = null }
  const show = () => {
    if (bar) return
    bar = document.createElement('div')
    bar.className = 'rnr-card'
    bar.setAttribute('role', 'region')
    bar.setAttribute('aria-label', 'Cookie choice')
    bar.style.cssText = 'position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:50;max-width:40rem;margin:0 auto;display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between'
    bar.innerHTML =
      '<p class="body" style="margin:0;flex:1 1 16rem">We use anonymous, cookie-free analytics to see which pages help. <a href="/privacy" style="color:inherit;text-decoration:underline">Read the privacy policy</a>.</p>' +
      '<div style="display:flex;gap:.5rem"><button type="button" class="rnr-btn rnr-btn-secondary" data-choice="declined">Decline</button>' +
      '<button type="button" class="rnr-btn rnr-btn-primary" data-choice="accepted">Accept</button></div>'
    bar.addEventListener('click', (e) => {
      const choice = e.target.closest('[data-choice]')?.dataset.choice
      if (!choice) return
      write(choice)
      hide()
      if (choice === 'accepted') loadAnalytics()
    })
    document.body.appendChild(bar)
  }

  const start = () => {
    const choice = read()
    if (choice === 'accepted') loadAnalytics()
    else if (choice !== 'declined') show()
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-consent-settings]')) return
      clear()
      show()
    })
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start()
})()
```

Note: once analytics has loaded in a page, choosing "Decline" via Cookie settings stops it from the next page load; the current page keeps the already-loaded script. The privacy text says "change your choice at any time", which this satisfies.

- [ ] **Step 2: Add to the app** — in `app/index.html` `<head>`: `<script src="/consent.js" defer></script>`. In `src/App.tsx` footer area is not required; the banner covers first choice, and Cookie settings is reachable from public pages.

- [ ] **Step 3: Verify in the browser** (`pnpm dev`, in-app Browser pane at `http://localhost:5173/`)
  - First load: banner visible; Network has no `_vercel/insights` request.
  - Click Accept: banner gone; request to `/_vercel/insights/script.js` appears (404 under `pnpm dev` is expected — the endpoint exists only on Vercel).
  - Reload: no banner; request fires again.
  - Click "Cookie settings": banner reappears.
  - Click Decline, reload: no banner, no request.

- [ ] **Step 4: Verify blocked storage** — in the console run `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') } })`, then run the contents of `consent.js` again. Expected: banner shows, Accept hides it, no uncaught error.

- [ ] **Step 5: Commit**

```bash
git add public/consent.js app/index.html
git commit -m "feat: add cookie banner with consent-gated Vercel Analytics"
```

---

### Task 8: Sitemap, robots, README and launch checks

**Files:**
- Create: `public/sitemap.xml`, `public/robots.txt`
- Modify: `README.md`

- [ ] **Step 1: Sitemap**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://reportnoreport.com/</loc><lastmod>2026-10-11</lastmod></url>
  <url><loc>https://reportnoreport.com/privacy</loc><lastmod>2026-10-11</lastmod></url>
  <url><loc>https://reportnoreport.com/terms</loc><lastmod>2026-10-11</lastmod></url>
</urlset>
```

- [ ] **Step 2: robots.txt**

```
User-agent: *
Allow: /
Disallow: /app/

Sitemap: https://reportnoreport.com/sitemap.xml
```

- [ ] **Step 3: README** — under "Run locally", change the last line's note: the app is at `http://localhost:5173/app/`; public pages at `/`, `/privacy`, `/terms`. Add a "Deploy" section: "Vercel builds with `pnpm build`, which fails if `scripts/check-dist.mjs` finds a leaked secret, broken internal link, `<img>` without `alt`, image over 200 KB or a `[…]` placeholder. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project; add `https://reportnoreport.com/app/` to Supabase Auth redirect URLs."

- [ ] **Step 4: Prove each check rule fails the build** (do not commit these edits)

```bash
for bad in 'service_role' '<img src="/x.png">' '[TBD]' '<a href="/nope">x</a>'; do
  cp privacy.html /tmp/privacy.bak && sed -i '' "s#</main>#$bad</main>#" privacy.html
  pnpm build >/dev/null 2>&1 && echo "NOT CAUGHT: $bad" || echo "caught: $bad"
  cp /tmp/privacy.bak privacy.html
done
```

Expected: four `caught:` lines. Image size rule is covered by the unit-level `checkDist` walk; spot-check with `cp public/og.png public/big.png && head -c 300000 /dev/urandom >> public/big.png && pnpm build; rm public/big.png` → build fails.

- [ ] **Step 5: Production-like run** — `npx vercel dev` (needs the user's Vercel login; if unavailable, skip and note it in the PR), then in the in-app Browser pane:
  - `/`, `/privacy`, `/terms` render; `/app` redirects to `/app/` and the app signs in with a seed user.
  - `/app/#/roles` reload stays in the app.
  - `/#/members` forwards to `/app/#/members`.
  - `/does-not-exist` shows the 404 page; Network shows status 404.
  - Response headers on `/` include `strict-transport-security` and `x-frame-options: DENY`.
  - Lighthouse (Chrome DevTools) on `/`, `/privacy`, `/terms`: record the four scores in the PR; target ≥ 95 each.

- [ ] **Step 6: Commit**

```bash
git add public/sitemap.xml public/robots.txt README.md
git commit -m "feat: add sitemap, robots.txt and deploy notes"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Privacy / Terms pages | 5 |
| Secrets off the frontend | 1 (`findSecrets`), existing `readEnv.ts` |
| Force HTTPS + headers | 2 |
| Cookie banner | 7 |
| Meta titles and descriptions | 4, 5, 6 |
| Social preview image | 3, 4, 5 |
| Favicon | 3 |
| Sitemap and robots | 8 |
| Alt text | 1 (`findMissingAlt`); icons already `aria-hidden` in `src/ui/icons.tsx` |
| Compress images | 3, 1 (200 KB rule) |
| Page load speed | 4 (no app JS on public pages, font preload), 2 (immutable cache), 8 (Lighthouse) |
| Custom 404 | 6 |
| Fix broken links | 1 (`resolveRef`), 8 |
| Analytics | 7 |
