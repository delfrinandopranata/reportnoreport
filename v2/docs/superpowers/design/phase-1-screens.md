# Phase 1 screens: implementation spec

Sources: `design/README.md`, `tokens.css`, `components/bundle.css` + component READMEs/previews, plan Task 7. Tailwind utilities are for **layout only** (flex, grid, gap, max-w, sr-only); colour, type, radius and controls come from `rnr-*` classes and tokens. "DD" = design decision (design system silent; most conservative option).

## 0. Global

| Item | Spec |
|---|---|
| `<body>` | `class="rnr rnr-ground"` (sets Inter 14/20 and the `surface-000` page). `<html>` carries the five `data-*` mode attributes. |
| Page title | One `<h1 class="page-title">` per view (24/32/600). Never two. |
| Spacing | Page padding `space-6` (24px, `p-6`); vertical rhythm between blocks `space-4` (`gap-4`); inside forms `space-3` (`gap-3`). Never `space-*` outside the 4px scale. |
| Widths | Auth/create-org card `max-w-[400px]`; app content `max-w-5xl` (1024px) centred. |
| Primary button | Exactly one `rnr-btn-primary` visible per view. |
| Buttons | Verb first, sentence case, no icon-only. Busy: `aria-busy="true"` + `<span class="rnr-spin" aria-hidden="true">` + -ing label ("Saving…"). **Never `disabled`** while busy or invalid. Second click while busy is ignored in the handler. |
| Saved | After success, button shows `check` icon + past tense ("Saved") for 1.6s, then reverts (Button README). Only where the form stays on screen (role save, invite). |
| Validation | `required`/`type`/`minLength` natively; `.rnr-error-text` sibling inside the `rnr-field` label shows on `:user-invalid`. On submit click with an invalid form, focus the first invalid field (`form.reportValidity()` does this). Server errors: `<p class="rnr-error" role="alert">` plus `aria-invalid="true"` + `aria-describedby` on the offending field when known. |
| Error copy | Never `error.message` raw. Map known cases; fallback "Something went wrong. Try again, and contact support if it keeps happening." |
| Skeleton | `<div class="rnr-skeleton" style="height:..;width:..">` empty (no text inside), wrapped in a region with `role="status"` and `<span class="sr-only">Loading…</span>`. Painted the instant the view mounts. |
| Checkbox | **Design system silent** (no checkbox class). DD: native `<input type="checkbox">`, `style="accent-color:var(--brand-solid)"` (or Tailwind `accent-brand`), 16×16, inside a `<label class="flex items-center gap-2 text-ink-label">`. Hit area is the whole label; on coarse pointers label `min-h-[44px]`. |
| Status | `rnr-status` = grey 14px icon + word. Not a coloured pill. |
| Icons | 24-grid stroke set, 16px in buttons/menus, 20px nav, `aria-hidden`. Needed: `check`, `x` (close), `trash`, `plus`, `user`. Copy paths from the Icon component. |
| Dialog | Native `<dialog class="rnr-dialog">` (see §8). |

## 1. Auth (sign in / create account)

**Layout:** `<main class="min-h-screen grid place-items-center p-6">` → column `max-w-[400px] w-full flex flex-col gap-6`: Wordmark (centred), then `<form class="rnr-card gap-3" noValidate={false}>` (card is already `display:flex; column`, padding `--rnr-card-pad`). Mobile: same, card goes full width (gutter `p-6` → use `p-4` below `sm`).

```html
<main class="min-h-screen grid place-items-center p-4 sm:p-6">
 <div class="w-full max-w-[400px] flex flex-col gap-6">
  <div class="flex items-center justify-center gap-3" aria-label="ReportNoReport" role="img">  <!-- Wordmark, §3 -->
  <form class="rnr-card gap-3" aria-busy="false">
   <h1 class="page-title">Sign in</h1>
   <p class="rnr-muted">Welcome back. Sign in to your organisation.</p>
   <label class="rnr-field"><span class="rnr-label">Email</span>
     <input class="rnr-input" type="email" name="email" autocomplete="email" required>
     <span class="rnr-error-text">Enter a valid email address.</span></label>
   <label class="rnr-field"><span class="rnr-label">Password</span>
     <span class="rnr-hint">At least 8 characters</span>   <!-- sign-up only -->
     <input class="rnr-input" type="password" name="password" required minlength="8"
            autocomplete="current-password"> <!-- sign-up: new-password -->
     <span class="rnr-error-text">Enter at least 8 characters.</span></label>
   <p class="rnr-error" role="alert">…</p>             <!-- only when set, above the buttons -->
   <button class="rnr-btn rnr-btn-primary" type="submit">Sign in</button>
   <button class="rnr-btn rnr-btn-ghost" type="button">Create an account</button>
  </form>
 </div>
</main>
```

| Element | Sign in | Create account |
|---|---|---|
| h1 | Sign in | Create account |
| Intro | Welcome back. Sign in to your organisation. | Create an account to set up or join an organisation. |
| Primary | Sign in / busy "Signing in…" | Create account / busy "Creating account…" |
| Toggle (ghost) | Create an account | I already have an account (DD: keep Task 7 copy; "Sign in instead" is the better verb-first label, use it) |
| Password autocomplete | `current-password` | `new-password`, hint shown |

Errors (role=alert, inside card, above primary): invalid credentials → "That email or password is incorrect. Check them and try again." Already registered → "That email already has an account. Sign in instead." Network/other → fallback. Sign-up that needs email confirmation (if enabled): replace form body with `<p role="status">` "Check your email. We sent a link to {email}. Open it to finish creating your account." (no layout change otherwise).
States: idle / busy (`aria-busy` on both form and primary; inputs stay editable but ignore resubmit) / error. Toggling mode clears error, keeps email, clears password.
A11y: `<h1>` first heading; focus the email field on mount and on mode toggle; tab order Email, Password, Primary, Toggle; error announced by `role="alert"`; on a failed submit move focus to Password (credentials) or first invalid field.

## 2. Create organisation

Same shell as Auth (centred card, Wordmark above, `max-w-[400px]`), used both as first-run (no orgs) and as "new organisation" (from the switcher). When the person already has orgs, show header-less (current Task 7 behaviour is fine) but add a `Cancel` secondary button that goes `#/members`.

```html
<form class="rnr-card gap-3" aria-busy="false">
 <h1 class="page-title">Create your organisation</h1>
 <p class="rnr-muted">You will be its first owner. You can invite others afterwards.</p>
 <label class="rnr-field"><span class="rnr-label">Organisation name</span>
   <span class="rnr-hint">For example, the name of your school or company</span>
   <input class="rnr-input" name="name" required maxlength="120" autocomplete="organization">
   <span class="rnr-error-text">Enter a name for your organisation.</span></label>
 <p class="rnr-error" role="alert">…</p>
 <button class="rnr-btn rnr-btn-primary" type="submit">Create organisation</button>   <!-- busy: Creating… -->
 <button class="rnr-btn rnr-btn-secondary" type="button">Cancel</button>              <!-- only if orgs.length > 0 -->
</form>
```
Errors: blank/whitespace → field-level above; server → "We could not create your organisation. Try again." Success: navigate `#/members`; no saved state needed. Focus name field on mount. Hint line has `rnr-hint` (placed between label and input per README anatomy).

## 3. App shell

**Layout:** header sticky? DD: not sticky. `<header class="bg-surface-100 border-b border-line-200">` (**Tailwind `border-b` needs an explicit colour; `border-line-200` is required**; bare `border-t`/`border-b` render `currentColor`). Inner row `mx-auto max-w-5xl flex items-center gap-4 px-6 py-3`. Order: Wordmark, OrgSwitcher, nav, spacer, Sign out. `<main id="main" class="mx-auto max-w-5xl p-6">`. First focusable element: `<a href="#main" class="sr-only focus:not-sr-only rnr-btn rnr-btn-secondary">Skip to content</a>`.

Mobile (<640px): row wraps (`flex-wrap`): line 1 Wordmark + Sign out (`ml-auto`), line 2 OrgSwitcher full width (`w-full order-last`), nav as line 3 below it. Wordmark text hidden under 360px? DD: keep tile + text; do not hide.

| Part | Markup |
|---|---|
| Wordmark | `<a href="#/members" class="flex items-center gap-3" aria-label="ReportNoReport"><div style="width:40px;height:40px;border-radius:var(--radius-lg);background:var(--brand-solid);display:grid;place-items:center"><span style="font-size:14px;font-weight:700;color:var(--brand-solid-ink)">R</span></div><span class="wordmark" aria-hidden="true">Report<span style="color:var(--ink-faint)">No</span>Report</span></a>` (exactly as `Wordmark/preview.html`). In-header tile is the "sidebar mark" brand use. |
| OrgSwitcher | `<select aria-label="Organisation" class="rnr-input" style="width:auto;max-width:240px">`; options org names, last `<option value="__new">Create organisation…</option>` (Task 7 label "+ New organisation" is not verb-first). DD: keep a `<select>`; after choosing `__new` the select must revert to the current org value if the person cancels. One org only: still render select (consistent), no special case. |
| Nav | `<nav aria-label="Main" class="flex gap-1">` links styled `class="rnr-btn rnr-btn-ghost"`; current page: `aria-current="page"` and class `rnr-btn rnr-btn-primary` (**active nav is a permitted brand-solid use**; this is the only primary-styled link and is not a "primary action", but to honour "one primary per view" DD: active link uses `rnr-btn-secondary` + `aria-current="page"`, because Members and Roles pages carry their own primary). Roles link hidden unless `can('roles.manage')`. |
| Sign out | `<button class="rnr-btn rnr-btn-ghost ml-auto" type="button">Sign out</button>`; busy "Signing out…". |
| Loading | Before orgs load: header skeleton (`rnr-skeleton` 40px tile + 160×36 bar) and a page skeleton (title 200×32, table card 100% × 240) in a `role="status"` region. Task 7 renders one `<p class="rnr-skeleton">Loading…</p>` with text inside: replace. |
| Org load failure | `<main>` card: h1 "We could not load your organisations", `rnr-error`-free body "Check your connection and reload the page.", `rnr-btn-secondary` "Reload page". |

## 4. Members page

**Layout:** `<section class="flex flex-col gap-4" aria-labelledby="h">`: row (h1 `page-title`), page-level `rnr-error` alert, invite card (if `members.manage`), members table card.

**Invite form** (`<form class="rnr-card gap-3">`, aria-busy while sending):
- `<h2 class="dialog-title">Invite someone</h2>` (16/24/600).
- Grid: `grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end`: Email `rnr-field` (label "Email", placeholder `name@school.edu` as `ink-faint` hint only, `.rnr-error-text` "Enter a valid email address."), then primary button "Send invite" (busy "Sending…", saved "Sent" with check 1.6s).
- Roles: `<fieldset class="grid gap-2"><legend class="rnr-label" style="color:var(--ink-label)">Roles</legend>` + checkbox labels in `flex flex-wrap gap-x-4 gap-y-2`. The legend is **visible** (Task 7 hides it with `sr-only`; sighted people need it). Owner is excluded. No role selected is allowed (member without roles); hint `rnr-hint` "Choose none to add them with no permissions."
- Success: `<p role="status" class="rnr-status"><svg check/> Invite sent to {email}.</p>` below form; clears fields; keeps focus on Email.
- Existing member (`status === 'existing'`): **not an error** (Task 7 uses `rnr-error`): `role="status"` "{email} is already in this organisation." Same line style, neutral (`rnr-status`).

**Members table** (`<div class="rnr-card" style="padding:0;overflow-x:auto">` per DataTable preview):
```html
<table class="rnr-table"><caption class="sr-only">Members of {org}</caption>
 <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Roles</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
 <tbody><tr>
  <td>{email}</td>
  <td><span class="rnr-status"><svg 14px aria-hidden/>Active</span></td>
  <td><div class="flex flex-wrap gap-x-4 gap-y-2"><label class="flex items-center gap-2 text-ink-label"><input type="checkbox" …>{role}</label>…</div></td>
  <td><button class="rnr-btn rnr-btn-danger" aria-label="Remove {email}">Remove</button></td>
 </tr></tbody></table>
```
- Status icons: Active = `check`; Invited = `clock`/`mail` (grey). Word is always present.
- Header `th` styling comes from `.rnr-table th` (12/500 `ink-muted`); do not add `text-ink-muted`/`p-2`/`text-left`.
- Do not put `flex` on a `<td>` (Task 7 does; breaks table layout). Wrap contents in a div.
- No `border-t` on rows (`rnr-table td` already has `line-100` bottom rule).
- Mobile: card scrolls horizontally; first column sticky `position:sticky;left:0;background:var(--rnr-card-bg)`; min column width 96px.
- Role checkbox change is **server-confirmed** (DD, not optimistic: it can be refused, e.g. last Owner): set `aria-busy="true"` on the row, checkbox keeps its previous value until the response, then refetch. On error: page `rnr-error`: "An organisation needs at least one Owner. Make someone else an Owner first." (map server text); focus stays on the checkbox. Each checkbox `aria-label` not needed (wrapped label). If `!manage`: checkboxes `disabled`, no Remove column content, no invite form.
- **Remove** opens the confirm dialog (§8): title "Remove {email}?", body "They lose access to {org} straight away. Their records stay." (DD: only claim what the schema supports; if records are deleted say so), buttons secondary "Cancel", danger "Remove member" (busy "Removing…"). Never `window.confirm`.

States:
| State | Spec |
|---|---|
| Loading | Card with header row + 4 skeleton rows: `rnr-skeleton` bars (h 20px, widths 40% / 12% / 30% / 10%) per `tr`, wrapped `role="status"`. Invite form renders immediately (needs only roles; roles skeleton = 3 pill-shaped 80×20 skeletons). |
| Empty (cannot happen: you are a member). If it does | Card body centred: "No members yet" is forbidden; use "Invite your first member to start sharing work." + point at the form above. |
| Error | Inside the table card: "We could not load members." + `rnr-btn-secondary` "Try again". Alert uses `role="alert"`. |
| Busy | Row `aria-busy`, invite button spinner. |

## 5. Roles page

**Layout:** `section.flex.flex-col.gap-4`: header row `flex items-center gap-3` (h1 `page-title` "Roles"; button `ml-auto`), page alert, optional editor card, roles list card.

- Header button: "New role". It is primary **only when no editor is open**; when the editor is open it becomes `rnr-btn-secondary` (Task 7 keeps two primaries on screen: "New role" and "Save role").
- Roles list: `<ul class="rnr-card" style="padding:0">` (**override card padding**; Task 7 stacks card padding + `p-3` per row). Rows `<li class="flex flex-wrap items-center gap-3 px-4 py-3" style="border-bottom:1px solid var(--line-100)">` (last: none; Tailwind `divide-y divide-line-100` is acceptable if the colour class stays). Row: name `<span class="label">`, summary `<span class="rnr-muted">`, actions `ml-auto flex gap-2`.
- Summary copy: Owner "All permissions"; others "{n} permission(s)" (singular "1 permission", zero "No permissions"); system roles show `<span class="rnr-chip">Default</span>`.
- Row buttons: ghost "Edit" (Owner: "View"), danger "Delete"; both with `aria-label` "Edit {name} role" / "View Owner role" / "Delete {name} role". Owner has no Delete.
- Delete uses §8 dialog: title "Delete the {name} role?", body "Members who hold it lose its permissions. This cannot be undone.", buttons "Cancel" / danger "Delete role" (busy "Deleting…"). If members hold it, server error: "{name} is still assigned to members. Remove it from them first." (DD: server decides; show verbatim mapped message).
- Empty list impossible (Owner always exists); a list with only seeded roles needs no empty state.
- Loading: card with 4 skeleton rows (h 20px, widths 30% / 20% / 12%). Error: card body "We could not load roles." + secondary "Try again".

### RoleEditor (inline card above the list)

DD: inline, not a dialog (it is a long form; dialogs are for single focused tasks and confirmations). On open: scroll into view and focus Role name (or the card heading for the read-only Owner view). Close returns focus to the button that opened it.

```html
<section class="rnr-card gap-4" aria-labelledby="re-h">
 <h2 id="re-h" class="dialog-title">New role</h2>       <!-- or "Edit {name}" / "Owner role" -->
 <label class="rnr-field"><span class="rnr-label">Role name</span>
   <input class="rnr-input" required maxlength="60" style="max-width:320px">
   <span class="rnr-error-text">Enter a name for this role.</span></label>
 <fieldset class="grid gap-2"><legend class="rnr-label">{Group}</legend>
   <label class="flex items-start gap-2 text-ink-label"><input type="checkbox">{label}</label> …</fieldset>
 <p class="rnr-error" role="alert">…</p>
 <div class="flex gap-2"><button class="rnr-btn rnr-btn-primary">Save role</button><button class="rnr-btn rnr-btn-ghost" type="button">Cancel</button></div>
</section>
```
- Groups: one `<fieldset>` per `PERMISSION_GROUPS` entry; **legend = `rnr-label`** (14/500 `ink-label`, not Tailwind `font-medium`). Layout `grid gap-4 md:grid-cols-2` across groups; items stacked `gap-2`.
- Permission you do not hold: checkbox `disabled`, label stays `ink-label`; helper `<span class="rnr-hint">You do not hold this permission, so you cannot grant it.</span>` on its own line. Task 7 uses `text-ink-faint` for "(you don't hold this)": **ink-faint is decorative only**; use `ink-muted` (`rnr-hint`).
- Owner: name field `readOnly` (not `disabled`, so it stays in tab order and readable), every box `checked` + `disabled`, no Save/Cancel; show `<p class="rnr-muted">The Owner role always has every permission and cannot be changed.</p>` and one `rnr-btn-secondary` "Close". Editor title "Owner role".
- Busy: "Save role" → "Saving…", `aria-busy`. Saved: `check` + "Saved" 1.6s, then the editor closes (list refreshes); announce `role="status"` "Role saved." on the page.
- Errors appear **inside the editor** (Task 7 puts them at page top, away from the action). Messages: refused grant → "You cannot give a permission you do not hold. Untick it and save again." Duplicate name → "A role with that name already exists. Choose another name."
- Cancel with unsaved changes: no confirm (DD: low cost, keep simple).

## 6. Copy table (shared strings)

| Place | String |
|---|---|
| Nav | Members, Roles |
| Org option | Create organisation… |
| Sign out | Sign out / Signing out… |
| Remove | Remove / Remove member / Removing… |
| Status | Active, Invited |
| Roles count | No permissions, 1 permission, {n} permissions, All permissions |
| Fallback error | Something went wrong. Try again, and contact support if it keeps happening. |
| Page toasts | Invite sent to {email}. / Role saved. / Member removed. / Role deleted. (all `role="status"`, inline under the h1, auto-clear 5s; DD: no toast component exists) |

## 7. Accessibility summary

| Concern | Rule |
|---|---|
| Landmarks | `<header>`, `<nav aria-label="Main">`, `<main id="main">`; skip link first. |
| Headings | h1 per view; invite card and editor use h2. |
| Live regions | Errors `role="alert"`; success `role="status"`; page keeps both containers mounted so announcements fire. |
| Focus | Dialog open: first focusable per README = Cancel (destructive confirm: `data-autofocus` on **Cancel**, not the danger button); close returns to trigger. Editor open: Role name. Form error: first invalid field. |
| Names | Icon-only controls: none in Phase 1 except dialog close `aria-label="Close dialog"`. Repeated buttons carry the row name in `aria-label`. |
| Colour | Status always icon + word; danger always a word; focus ring is the global 2px `focus-ring` (never remove `.rnr-btn` outlines). |
| Touch | Coarse pointers: checkbox labels, nav links, selects `min-height: var(--touch-min)` (44px); `.rnr-icon-btn` already does. |
| Motion | Nothing custom; spinners/skeleton honour `data-motion="flat"` and reduced motion via the bundle. |

## 8. Confirmation dialog (native `<dialog>`)

Bundle has **no `::backdrop` rule, no dialog footer, and no dialog centring** (README says backdrop `scrim` + 4px blur). DD: add the missing pieces to `src/index.css` (not `design/`) as a thin wrapper:

```css
dialog.rnr-dialog { margin: auto; padding: 0; width: calc(100% - 2rem); }          /* centre + phone width */
dialog.rnr-dialog::backdrop { background: var(--scrim); backdrop-filter: blur(4px); }
```
Footer: no class exists; DD use `<div class="flex justify-end gap-2">` as the last child of `.rnr-dialog-body`.

```html
<dialog class="rnr-dialog" aria-labelledby="d-t" aria-describedby="d-b" id="confirm">
 <div class="rnr-dialog-head"><h2 id="d-t">Remove ada@alpha.test?</h2>
   <button class="rnr-icon-btn" type="button" aria-label="Close dialog"><svg … x/></button></div>
 <div class="rnr-dialog-body"><p id="d-b" class="rnr-muted">They lose access to Alpha School straight away.</p>
   <p class="rnr-error" role="alert">…</p>
   <div class="flex justify-end gap-2">
     <button class="rnr-btn rnr-btn-secondary" type="button" data-autofocus autofocus>Cancel</button>
     <button class="rnr-btn rnr-btn-danger" type="button">Remove member</button></div></div>
</dialog>
```
Open with `showModal()` (focus trap, Esc, inert background for free); Esc/backdrop/close/Cancel all `close()`. The danger button stays live while busy (`aria-busy`, "Removing…"); dialog closes on success, stays open with the alert on failure. Body text is `ink-muted` on `surface-100` (passes). Mount one `<dialog>` per page and set its title/body from state, or render conditionally and call `showModal()` in an effect.

## 9. Conflicts with Task 7 and corrections

| # | Task 7 code | Conflict | Correction |
|---|---|---|---|
| 1 | `window.confirm` for Remove member and Delete role | Brief + Global Constraints: native `<dialog>` for modals | §8 dialog, Cancel autofocused |
| 2 | Roles page: "New role" and editor "Save role" both `rnr-btn-primary` | One primary per view | "New role" becomes `rnr-btn-secondary` while editor is open |
| 3 | Shell has no Wordmark | design/README Wordmark; sidebar mark is a brand use | Add Wordmark lockup (§3), also above Auth/Create-org cards |
| 4 | Nav links plain `<a>`, no current-page state | Active nav is a `brand-solid` use; a11y | `aria-current="page"` + button-style links (§3) |
| 5 | `border-t`, `border-b border-line-200`; `border-t` without colour | Tailwind default border colour is `currentColor`, not a token | Always pair with `border-line-*`, or rely on `rnr-table td` rule |
| 6 | `text-ink-faint` for "(you don't hold this)" | `ink-faint` is decorative only (fails contrast) | `rnr-hint` (`ink-muted`) on its own line |
| 7 | `<td className="flex ...">` | Breaks table layout | Wrap checkboxes in a `div` inside the `td` |
| 8 | `<table className="rnr-table w-full">` with `<tr className="text-left text-ink-muted">`, `<th className="p-2">`, `<td className="p-2">` | Duplicates/fights `.rnr-table th/td` padding and colour | Drop all th/td utility classes; wrap in `rnr-card` with `padding:0;overflow-x:auto` |
| 9 | Table not in a card, no caption, empty `<th />` | DataTable README + a11y | Card wrapper, `<caption class="sr-only">`, `<th scope="col"><span class="sr-only">Actions</span></th>` |
| 10 | Roles `ul` is `rnr-card divide-y` with `li p-3` | Card padding (`space-5`) plus row padding double up | `padding:0` on the card, rows `px-4 py-3` |
| 11 | Roles legend hidden via `sr-only` in invite form | Sighted users lose the group label | Visible `rnr-label` legend |
| 12 | `<p className="rnr-skeleton m-8 h-8 w-48">Loading…</p>` | Skeleton paints a shape; text inside is shimmered over; no status role | Empty `rnr-skeleton` blocks in a `role="status"` region + `sr-only` text |
| 13 | No loading/empty/error rendering for queries (`members.data?.map`) | design/README: skeleton at once; empty states with next step; errors say what to do | Per-section states (§4, §5) |
| 14 | Submit handlers never set `aria-busy`/-ing label; no saved state | Button README + README "Don't disable submit" | `aria-busy`, `rnr-spin`, -ing label, 1.6s saved state |
| 15 | `setError(error.message)` raw server/Supabase text | README: never raw error codes; say what to do | Map known messages, fallback string (§0) |
| 16 | `existing` invite result shown via `rnr-error` | It is information, not failure | `role="status"` + `rnr-status` |
| 17 | Fields lack `aria-invalid`/`aria-describedby`/`.rnr-error-text`/`autocomplete`, no hint | Field README + :user-invalid pattern | Added to all markup in §1, §2, §4, §5 |
| 18 | Auth inputs unlabelled by card; form floats bare on page with no `rnr-card` | Fields sit on `surface-100` cards | Wrap in `rnr-card` (§1, §2) |
| 19 | Auth toggle "Create an account" / "I already have an account" | Verb-first buttons | "Create an account" / "Sign in instead" |
| 20 | Org option "+ New organisation" | Not verb-first; "+" is decorative | "Create organisation…" |
| 21 | Edit/Delete/Remove buttons have the same accessible name per row | Screen-reader users cannot tell rows apart | `aria-label` with the row name |
| 22 | Role editor errors render at page top | Error must sit by the action | Alert inside the editor card |
| 23 | Role name input lacks `required`; "(you don't hold this)" uses curly quote, fine | Blank name reaches the server | `required` + `.rnr-error-text` |
| 24 | `<select class="rnr-input">` as org switcher is `width:100%` | Stretches across header | `width:auto; max-width:240px` |
| 25 | `Members` `th` "Status" is plain text, no icon | README: status = grey icon + word | `rnr-status` (§4) |
| 26 | Checkboxes unstyled | Design system silent; default blue native control breaks "brand only on 4 things" | DD `accent-color: var(--brand-solid)` |
| 27 | `rnr-error` on a bare `<p>` used also for field errors | `rnr-error` is a 14px block alert; fields use `.rnr-error-text` | Field-level: `.rnr-error-text`; server/page: `.rnr-error role="alert"` |

## 10. Where the design system is silent (DD summary)

Checkbox styling · dialog `::backdrop`/centring/footer · toast (inline `role=status` instead) · org-switcher pattern (`<select>` kept) · skip link · sticky header (no) · inline vs dialog role editor (inline) · optimistic role toggle (no; server-confirmed because it can be refused) · "Default" chip for system roles (`rnr-chip`).
