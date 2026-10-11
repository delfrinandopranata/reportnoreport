# Phase 4 screens: implementation spec

Sources: `design/README.md`, `tokens.css`, `components/bundle.css` + component READMEs/previews (Menu, Dialog, DataTable, Field, Badge, Segmented, Icon, Button), `phase-1-screens.md` to `phase-3-screens.md` (their §0 sections, the sheet/dialog rules, the layer trap and every `src/index.css` addition still apply), Phase 4 plan Tasks 6–10 and Global Constraints, and the shipped `src/**` (App shell, `ConfirmDialog`, `useAction`, `useNotice`, `useFocusAfterRender`, `Skeleton`, `When`, `navGuard`, `errors`, `icons`, `RecordPage`, the Phase 3 `SidePanel`). Tailwind utilities are for **layout only**; colour, type, radius and controls come from `rnr-*` classes and tokens. "DD" = design decision (design system silent; most conservative option). Where this file differs from Tasks 7, 8 and 10, this file wins (§10 lists every difference).

Selectors verified in `bundle.css`: `rnr-card(-head|-title)`, `rnr-btn(-primary|-secondary|-ghost|-danger)`, `rnr-icon-btn`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-input`, `rnr-error`, `rnr-error-text`, `rnr-status`, `rnr-chip`, `rnr-seg`, `rnr-menu`, `rnr-menu-item`, `rnr-menu-sep`, `rnr-dialog(-head|-body)`, `rnr-table` (+ `.num`), `rnr-block`, `rnr-skeleton`, `rnr-spin`, `rnr-pop`, `rnr-muted`, `rnr-num`, `rnr-focus`; type classes `page-title`, `dialog-title`, `label`. From `src/index.css`: `rnr-check`, `rnr-caption`, `rnr-readout`, `rnr-fieldset-label`, `rnr-sticky-first`, `dialog.rnr-sheet`. **Not in the bundle** (do not use): `rnr-btn-sm`, a popover/notification component, a toast, a tab bar, a badge-with-count, an alert or warning icon, a mail/send icon. `BellIcon` is added by Task 7 (24 grid, same `base` props, path as the plan). `StopIcon`, `ClockIcon`, `CheckIcon`, `XIcon`, `PencilIcon`, `PlusIcon`, `BackIcon`, `TrashIcon` already exist.

**Three traps this file keeps hitting (they bite the plan's code in §10):**
1. *Layer trap* (Phase 3): `bundle.css` is unlayered, Tailwind utilities are layered, so unlayered CSS wins. `rnr-card p-0` keeps the 20px padding; `rnr-menu w-72` stays 224px; `rnr-menu overflow-y-auto` stays `overflow:hidden` (a long list is clipped, not scrolled); `rnr-menu-item items-start` stays `align-items:center`; `td.flex` breaks table layout. Use the CSS classes in §11 or `style=""`.
2. *Icon size trap*: `.rnr-icon-btn svg { width:14px; height:14px }` is a CSS rule, so it beats the SVG `width`/`height` attributes. `<BellIcon size={20}/>` in an `rnr-icon-btn` renders at 14px unless `.rnr-bell svg` overrides it.
3. *Chip colour*: `rnr-chip` is `info-surface` / `info-ink` (blue; outlined in B&W). It is used for two non-status marks only (the unread count and "System"). Status is never a chip.

## 0. Global additions

| Item | Spec |
|---|---|
| Nav | Order (DD, daily work first, set-up last): **Inbox, Records, Forms, Workflows, Templates, Messages, Members, Roles**. Templates and Messages only with `comms.manage`, after Workflows (they are the workflow author's tools). `aria-current="page"` and `rnr-btn-secondary` on Templates for `templates` and `template`; on Messages for `messages`. Nothing in the nav is current for `settings`; the Settings link in the header is. Eight items at 375px wrap on the nav's existing `flex-wrap`. No count badge on Messages (a "3 failed" pill is a coloured badge; the page itself filters to Failed). |
| Header right side | `<div class="ml-auto flex items-center gap-1">` holding, in order, **bell, Settings link, Sign out**. Settings is `rnr-btn rnr-btn-ghost` (`rnr-btn-secondary` + `aria-current="page"` when current). The `<header>` gets `relative` (the bell panel anchors to it on phones). At `sm` and up the group sits on the wordmark row. **Below `sm` (DD)** the wordmark (about 180px) and the group (about 220px) cannot share 327px: the group wraps onto its own row, still right-aligned by `ml-auto`; order down the page is wordmark, group, organisation switcher, nav. |
| Page widths | Settings `max-w-2xl` (DD, like Start/Task). Templates list and Messages: the `<main>` `max-w-5xl`. Template editor: `max-w-5xl`, two columns from `lg`. |
| One h1, one primary | Settings: h1 "Settings", no primary (each toggle saves). Templates: h1 "Message templates", primary "New template". Template editor: h1 "Edit template", primary "Save template". Messages: h1 "Messages", no primary (Retry is `rnr-btn-secondary` per row). Every h1 has `id` and `tabIndex={-1}`. |
| Back link | Template editor: `<a class="rnr-btn rnr-btn-ghost self-start" href="#/templates"><BackIcon/>Back to templates</a>` above the h1 (as the plan). Settings and Messages are top-level and have none. |
| Channel words | The plan's "Email" / "In-app" are not honest, because **every active-member recipient gets an in-app notification whatever the channel** (plan decision 4). Words (DD): `email` = **"Email and in-app"**, `in_app` = **"In-app only"**. The editor's segmented control and the list column use the same words. |
| Message status = grey icon + word | `rnr-status` (14px grey icon, `ink-label` word), never colour alone, never a chip: |

| Status | Icon | Word |
|---|---|---|
| `queued` | `ClockIcon` | Queued |
| `sent` | `CheckIcon` | Sent |
| `failed` | `XIcon` (DD, "did not go through"; `StopIcon` stays "record stopped") | Failed |

| Item | Spec |
|---|---|
| "System" mark | `<span class="rnr-chip">System</span>` after the template name, the word is the mark (B&W gets the chip border from the bundle). Custom templates have no mark. |
| Dates | `When`/`Day` from `src/ui/Time.tsx` (`whenText` "11 Oct 2026, 14:30", `dayText` "11 Oct 2026"), wrapped in `<time dateTime>`. In tables, time cells are `class="num"` (right-aligned). |
| Status line | Phase 2/3 pattern: `<p class="rnr-caption" role="status">` stays mounted, text swaps, clears after 5s (`useNotice`). |
| Reading level | Errors say what to do. Never raw codes. No "we" except in the existing load-failure sentence "We could not …" (Phase 1–3 precedent, kept). |
| Clock | Nothing on these screens ticks. Times are absolute, never "2 minutes ago" (no live-updating text for screen readers to fight). |

## 1. Notification bell and dropdown

### 1.1 The button

```html
<div class="sm:relative">
  <button type="button" class="rnr-icon-btn rnr-bell" aria-expanded="false"
          aria-label="Notifications, 3 unread">          <!-- "Notifications" at 0 -->
    <svg 20 BellIcon/>
    <span class="rnr-chip rnr-num" aria-hidden="true">3</span>   <!-- only when > 0; "99+" above 99 -->
  </button>
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">New notification: Task assigned</p>
  <section id="…" class="rnr-menu rnr-notices" aria-labelledby="bell-h">…</section>   <!-- only when open -->
</div>
```

| Part | Spec |
|---|---|
| Size | 36px square (`--rnr-control-h`, so 32px in compact density) to sit level with the 36px Sign out button; 44px on coarse pointers (the bundle's `.rnr-icon-btn` rule). Class `.rnr-bell` (§11). Icon 20px (nav size, README). Colour `ink-label` at rest, `ink` on hover (the bundle). |
| Count | `rnr-chip rnr-num`, absolutely positioned top-right of the button, `aria-hidden` (the number is in the button's name). Hidden at 0. `99+` above 99. The count is the organisation's total unread, not just the 20 listed. |
| Accessible name | `Notifications, 3 unread` / `Notifications, 1 unread` / `Notifications`. Always updates with the count. |
| Disclosure | `aria-expanded`; `aria-controls` only while the panel is mounted (the plan points it at an id that does not exist when closed). It is a **disclosure**, not an ARIA menu: the content is links and a button, so no `role="menu"`, no `aria-haspopup`. |
| Loading / error | Count unknown: no chip, name "Notifications". A failed count query is silent (the panel shows the error when opened). |

### 1.2 The panel

`<section id aria-labelledby="bell-h" class="rnr-menu rnr-notices">`. `.rnr-notices` (§11) overrides the menu's fixed 224px width and `overflow:hidden`.

| Property | Desktop (`sm`+) | Phone (below `sm`) |
|---|---|---|
| Position | Absolutely under the button, right edge aligned with it, 8px gap (`top: calc(100% + var(--space-2))`). | Absolutely under the **header** (the wrapper is `static`, the header is `relative`): `left`/`right` = `var(--space-4)`, `top:100%`, 8px gap. Full width inside the 1rem gutter, so it never overflows the viewport. |
| Width | 360px | auto (343px at 375) |
| Height | `max-height: min(70dvh, 28rem)`; the list scrolls inside the panel, the head stays. | same |
| Shadow / radius | the bundle's menu: `radius-lg`, `line-200`, `shadow-lg` (B&W: hard 6px offset). | same |

Structure, top to bottom:

```html
<div class="rnr-notices-head">
  <h2 id="bell-h" class="label" tabindex="-1">Notifications</h2>
  <button type="button" class="rnr-btn rnr-btn-ghost" aria-busy="false">Mark all as read</button>   <!-- only when unread > 0 -->
</div>
<p class="rnr-caption rnr-notices-sub">Showing notifications for Alpha School.</p>
<p class="rnr-error" role="alert">…</p>                                                                 <!-- only on error -->
<ul class="rnr-notices-list">
  <li><a href="#/tasks/…" class="rnr-menu-item rnr-notice" data-unread="true">
        <span class="rnr-notice-dot" aria-hidden="true"></span>
        <span class="rnr-notice-title"><span class="sr-only">Unread: </span>New task: Leave approval</span>
        <span class="rnr-caption rnr-notice-body">Ada submitted a leave request for 3 days.</span>
        <span class="rnr-caption"><time dateTime>11 Oct 2026, 14:30</time></span></a></li>
</ul>
<p class="rnr-caption rnr-notices-foot">Showing your 20 newest.</p>                                     <!-- only when the list has 20 -->
```

| State | Spec |
|---|---|
| Loading | `Skeleton rows={[{w:'100%',h:48},{w:'100%',h:48},{w:'100%',h:48}]}` inside the panel (`role="status"`, "Loading…"). The head renders at once. |
| Empty | `<p class="rnr-muted px-3 py-3">No notifications yet. New tasks and messages for Alpha School appear here.</p>` (names the organisation, since the bell is organisation-scoped). Mark all hidden. |
| Error | `rnr-error role="alert"`: "We could not load your notifications. Check your connection and try again." plus ghost "Try again" (refetch). |
| Mark failed | `rnr-error role="alert"`: the `friendlyError` text, or "We could not mark your notifications as read. Try again." |
| Organisation scope (decision 14) | Sub-line under the heading always names the organisation: "Showing notifications for {org name}." On switching organisation the panel closes, the lists refetch under the new key, and the announcement set is reset (so nothing is announced as "new" because of the switch). |

**Item.** A link (`<a href="#/…">`, the notification's stored hash, always on-site) styled as `rnr-menu-item rnr-notice`: a two-column grid, an 8px dot then the text stack. Title is the unread/read signal:
- **Unread** (never colour alone, three redundant cues): filled 8px dot in `--ink` (shape), title at weight 600 in `--ink`, and `<span class="sr-only">Unread: </span>` before the title. 
- **Read**: no dot (the cell keeps its 8px so titles align), title weight 400 in `ink-label`.
- Body (plan omitted it; the row exists in `notifications.body`): `rnr-caption`, clamped to 2 lines. Time: `rnr-caption` with `<time>`.
- Row height: at least 44px on coarse pointers (the `.rnr-menu-item` padding plus `min-height: var(--touch-min)` in the coarse query, §11).

**Marking read.**
- *Opening a notification* marks that one read (`markRead`, fire and forget; zero rows back is fine) and closes the panel; the link navigates. If the page has an unsaved-changes guard and blocks the hash change, the notification is still marked read (it was seen); the panel stays closed. (DD, accepted: simpler than coupling to the guard.)
- *"Mark all as read"*: `rnr-btn rnr-btn-ghost`, busy `aria-busy` + `rnr-spin` + "Marking…". On success: the panel refetches, the button unmounts because the count is 0, so **focus first moves to the panel heading** (`#bell-h`, `tabIndex=-1`) and the live region says "All notifications marked as read." (the plan unmounts the focused button, dropping focus to `<body>`).
- There is no per-row "mark as read" button (DD): rows are links, opening is reading. A button per row doubles the tab stops for nothing.

**Keyboard and dismissal.**
- Enter/Space on the bell toggles. Focus stays on the bell on open (DD: it is a disclosure, so Tab enters the panel: Mark all, then each link). 
- **Esc** closes the panel and returns focus to the bell. **Outside `pointerdown`** closes it (the plan's `mousedown` misses touch on some browsers). **Focus leaving** the wrapper and panel (Tab past the last link, Shift+Tab off the bell) closes it, with no focus move.
- After a link is activated the panel closes; focus is wherever the navigation puts it (the new page's h1).

### 1.3 Realtime announcement (polite, not noisy)

The plan's `<span aria-live="polite">{n} unread notifications</span>` re-announces on first load, on every mark-read, on org switch and when another tab reads something. Replace with **arrival-only**:

- One always-mounted `<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">` outside the panel (via `useNotice`, so it clears itself after 5s and a repeat of the same text still fires).
- `NotificationBell` keeps a `Set` of notification ids it has already seen. The first successful fetch for an (org, user) **seeds** the set silently. Afterwards, an id that is unread and not in the set is an arrival. Mark-reads, deletes, other-tab changes and org switches add nothing.
- One arrival: `New notification: {title}`. Several in the same refetch: `{n} new notifications.` Never more than one announcement per refetch, and the title is the plain text (never the body, which may hold record data).
- No sound, no toast, no browser notification, no title-bar flash (DD). The visible cue is the chip number changing; with `data-motion="full"` it does not animate (motion explains a change; a count has none to explain).
- The panel being open does not suppress the announcement (a screen-reader user in the panel still wants to know), but the new row is not focused or scrolled to.
- If Realtime drops, nothing is shown (DD); TanStack's refetch on window focus brings the count back in line.

## 2. Settings: email notifications (`#/settings`)

`<section class="flex max-w-2xl flex-col gap-4" aria-labelledby="settings-h">`: h1 "Settings" (`page-title`, `tabIndex={-1}`), then one card.

```html
<section class="rnr-card gap-4" aria-labelledby="email-h">
  <h2 id="email-h" class="dialog-title">Email notifications</h2>
  <p class="rnr-muted">In-app notifications always arrive in the bell and cannot be turned off. These settings only stop the email copy. They apply in every organisation you belong to. Invitations are always emailed.</p>
  <fieldset class="flex flex-col gap-3">
    <legend class="rnr-fieldset-label">Email me when</legend>
    <div class="flex flex-col">
      <label class="rnr-check"><input type="checkbox" checked> <span>Task assigned</span></label>
      <p class="rnr-caption" id="pref-task_assigned" style="margin-left:var(--space-6)">A task is given to you, or to a role you hold.</p>
    </div> …
  </fieldset>
  <p class="rnr-caption" role="status"></p>
  <p class="rnr-error" role="alert">…</p>
</section>
```

| Type | Label (`KIND_LABELS`) | Caption (DD) |
|---|---|---|
| `task_assigned` | Task assigned | A task is given to you, or to a role you hold. |
| `task_overdue` | Task overdue | A task you hold passes its due time. |
| `record_approved` | Record approved | A workflow tells you a record was approved. |
| `record_rejected` | Record rejected | A workflow tells you a record was rejected. |
| `custom` | Workflow messages | Any other message a workflow sends you. |

- Order is `MUTABLE_KINDS`. "Invite to org" is not listed (cannot be muted); the intro says so. Each checkbox has `aria-describedby` pointing at its caption. A checked box means email on; a type with no row is on (checked).
- **Optimistic, per toggle** (cheap and reversible, `design/README.md`; the plan waits for the server and ignores a second click while one is saving, which makes a click look dead for a moment and drops quick toggles): flip at once with `setQueryData(['notification-prefs', userId], …)`; on error or 0 rows roll back and show the alert. Toggles of different types may overlap; two toggles of the same type queue. No `aria-busy` on a checkbox (it has no meaning there).
- Status line on success (5s): `Task assigned emails turned off.` / `… turned on.` On failure (`role="alert"`): the `friendlyError` text, or `We could not save that setting. Try again.`; the checkbox returns to its old state and **keeps focus**.
- **Loading:** `Skeleton` five rows of 220px. **Error:** card text "We could not load your settings. Check your connection and try again." + secondary "Try again". No empty state (the list is fixed).
- Honesty note (DD): "In-app always on" is a product rule, not a missing feature, so the page says so in plain words and does not render a disabled "In-app" column (a column of locked checkboxes reads as broken, and `disabled` controls are skipped by screen readers).

## 3. Templates list (`#/templates`, `comms.manage`)

Layout like Workflows (Phase 3 §1): `<section class="flex flex-col gap-4" aria-labelledby="templates-h">`; header row `flex flex-wrap items-center gap-3` with h1 "Message templates" and primary **New template** (`ml-auto`, `PlusIcon`; busy "Creating…" with `aria-busy` + `rnr-spin`); then the create alert (`rnr-error role="alert"`), the status line, then the table. `N` shortcut: not added here (DD; one-off authoring, and Forms/Workflows already own the habit).

```html
<div class="rnr-card" style="padding:0;overflow-x:auto">
 <table class="rnr-table rnr-sticky-first"><caption class="sr-only">Message templates in {org}</caption>
  <thead><tr><th scope="col">Name</th><th scope="col">Channel</th><th scope="col" class="num">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
  <tbody><tr>
   <td><span class="label">Task assigned</span> <span class="rnr-chip">System</span></td>
   <td>Email and in-app</td>
   <td class="num"><time>11 Oct 2026, 14:30</time></td>
   <td><div class="flex justify-end gap-1 whitespace-nowrap">
     <a class="rnr-btn rnr-btn-secondary" href="#/templates/…" aria-label="Edit Task assigned">Edit</a>
     <button class="rnr-btn rnr-btn-danger" aria-label="Delete {name}">Delete</button>   <!-- custom only -->
   </div></td></tr></tbody></table></div>
```

| State | Spec |
|---|---|
| Order | System templates first, then custom by name (what `useTemplates` already returns). |
| Loading | `Skeleton` one 240px row; header and "New template" render at once. |
| System only (first run) | Below the table, inside its own `<div class="rnr-card gap-3">`: ghost preview `<div class="rnr-card" data-state="placeholder" aria-hidden="true">` ("Welcome back" muted "Custom · Email and in-app"), `<h2 class="dialog-title">Write your own template</h2>`, `<p class="rnr-muted">System templates cover tasks, approvals and invitations. Create a template of your own to use in a workflow's Send message action.</p>`. No second primary: the header button stays the one primary. (The plan's `p-4` line inside the table card is replaced.) |
| Error | Card: "We could not load the templates. Check your connection and try again." (`role="alert"`) + secondary "Try again". |
| Creating | Primary busy "Creating…"; on success navigates to the editor. Failure: `rnr-error role="alert"` under the header. |
| No results / filtered out | Not applicable. |

**Delete** (custom only; system rows have no button, and RLS forbids it anyway): `ConfirmDialog`, Cancel autofocused. Title `Delete {name}?`. Body `{name} will be deleted and cannot be recovered. Workflows that send it stop their records with an error until you choose another template.` Buttons "Cancel" / danger "Delete template" (busy "Deleting…"). 0 rows or error: dialog stays open with `rnr-error role="alert"`. Success: status line `{name} deleted.`, focus to the h1.

## 4. Template editor (`#/templates/:id`, `comms.manage`)

### 4.1 Layout

```
Back to templates
Edit template                                                       (h1)
System template for Task assigned. You can change its words and channel; it cannot be deleted.   (rnr-muted, system only)
┌ form (rnr-card) ──────────────────────┐ ┌ preview (rnr-card, sticky at lg) ──┐
│ Name                                   │ │ Preview                            │
│ Channel   [Email and in-app | In-app only] │ Record to preview with [select ▾]  │
│ Subject                                │ │ Subject                            │
│ Message (textarea)                     │ │ Message  (rnr-preview)             │
│ [Insert variable ▾]  caption           │ │ caption                            │
│ unknown-variable line                  │ └────────────────────────────────────┘
│ alert / conflict                       │
│ [Save template]  [Delete template]  Unsaved changes │
└────────────────────────────────────────┘
```

`<div class="grid gap-4 lg:grid-cols-2">` (stacks below `lg`, preview **after** the form; there is no skip link, the preview is a labelled region reachable by heading navigation: DD). The preview card is `lg:sticky lg:top-4 lg:self-start`. Gap `space-4`.

### 4.2 Fields

| Field | Markup and rules |
|---|---|
| Name | `rnr-field`, label "Name", `required`, `maxLength=120`. |
| Channel | `rnr-field` with `<span class="rnr-label" id>` and `<div class="rnr-seg self-start" role="group" aria-labelledby>` (`self-start`: an inline-grid child of a flex-column field otherwise stretches to full width). Buttons `aria-pressed`: **Email and in-app** / **In-app only**. Hint: `Members always get an in-app notification. Email also goes out unless they turned this type off.` **Invite to org** (`kind==='invite'`): the hint becomes `Invitations are always emailed, whatever you choose here.` |
| Subject | `rnr-field`, label "Subject", `maxLength=200` (the renderer truncates at 200), one line. Hint: `One line. Line breaks are removed.` |
| Message | `rnr-field`, label "Message", `<textarea class="rnr-input" rows="10">` (`rnr-input` on a textarea gets `height:auto`); `maxLength=10000`; font stays Inter (DD: this is an email, not code). Hint (this is where escaping is explained, in plain words): `Plain text. A blank line starts a new paragraph. Variables such as {{org.name}} are filled in when the message is sent, and whatever they contain is shown exactly as typed, never as formatting.` Written in JSX as `{'{{org.name}}'}`. |

### 4.3 Insert variable menu

A real ARIA menu button (the plan's is a bare button list with no focus management, and its `rnr-menu w-72 overflow-y-auto` is clipped by the layer trap). Placed under the Message field, left-aligned:

```html
<button type="button" class="rnr-btn rnr-btn-secondary" aria-haspopup="menu" aria-expanded="false" aria-describedby="ins-hint">Insert variable</button>
<p class="rnr-caption" id="ins-hint">Adds to the message at the cursor.</p>        <!-- "…to the subject…" after the subject last had focus -->
<div class="rnr-menu rnr-menu--wide" role="menu" aria-label="Insert variable">
  <div role="group" aria-label="Details">
    <button type="button" role="menuitem" tabindex="-1" class="rnr-menu-item rnr-menu-item--stack"><span>Record title</span><span class="rnr-caption">The record this message is about.</span></button> … ×7
  </div>
  <div class="rnr-menu-sep" role="separator"></div>
  <div role="group" aria-label="Answers from Leave: Ada">
    <button role="menuitem" tabindex="-1" class="rnr-menu-item">Answer: days</button> …
  </div>
</div>
```

| Part | Spec |
|---|---|
| Items | `VARIABLES` in order: label (14px) over hint (`rnr-caption`): Record title, Step assignee, Task link, Record link, Invite link, Organisation name, Recipient name. No filtering by template kind (YAGNI; the hints say "Only in …"). |
| Answers group | One item per answer key of the chosen preview record (`Answer: {key}`). With no record: one `role="menuitem" aria-disabled="true"` item "Answers: choose a record to preview first" (no click handler, `ink-muted`; DD: static text is not allowed inside `role="menu"`, and `disabled` is skipped by AT). Group label `Answers from {record title}`. |
| Open | Click, Enter, Space or ArrowDown on the button. Focus moves to the **first item**. |
| Navigate | ArrowDown/ArrowUp move (wrap), Home/End jump, roving `tabindex`. Enter/Space activate. |
| Close | **Esc** closes and returns focus to the button. **Tab** closes (focus moves on naturally). Outside `pointerdown` closes. Activating an item inserts and closes. |
| Insert | The token `{{key}}` goes into **the field that last had focus** (Subject or Message; default Message), **replacing any selection** at the caret. Focus then returns to that field with the caret after the token. Status line: `Inserted “Record title” in the message.` / `… in the subject.` |
| Size | `.rnr-menu--wide`: `width: min(320px, calc(100vw - 2rem))`, `max-height: 20rem`, `overflow-y: auto` (§11). Opens below the button, left-aligned (`absolute z-20 mt-1`); the form card needs `overflow: visible`. |
| Touch | Items `min-height: var(--touch-min)` on coarse pointers. |

### 4.4 Unknown variables

The plan shows `rnr-error role="alert"` in danger red as you type, which both announces on keystrokes and reads as a blocker. It is neither (the renderer leaves unknown variables empty). Replace with a non-blocking line under the menu button:

```html
<p class="rnr-status" aria-live="polite"><StopIcon size={14}/>Not a variable, so it will be left empty: {{nope}}, {{recipient.nam}}</p>
```
Mounted only while there are unknowns; updated at most every 600ms (debounce) so a screen reader hears settled text, not each character. Saving is never blocked by it. Grey icon + words, no danger colour (not an error).

### 4.5 Preview

```html
<section class="rnr-card gap-3 lg:sticky lg:top-4 lg:self-start" aria-labelledby="pv-h">
  <h2 id="pv-h" class="dialog-title">Preview</h2>
  <div class="rnr-field"><label class="rnr-label" for="rec">Record to preview with</label>
    <select id="rec" class="rnr-input"><option value="">No record (example values)</option>…</select>
    <p class="rnr-hint">You stand in for the recipient and the step assignee. Links are filled in when the message is sent.</p></div>
  <div><p class="rnr-caption">Subject</p><p class="label">Task: Leave: Ada</p></div>
  <div><p class="rnr-caption">Message</p><div class="rnr-preview">Hello admin@alpha.test,…</div></div>
  <p class="rnr-caption">Preview is plain text. The email shows the same words with clickable links.</p>
</section>
```
- The preview itself is **not** a live region (it changes on every keystroke). Changing the record picker sets the shared status line to `Previewing with {record title}.` / `Previewing with example values.`
- Empty subject: `<p class="label rnr-muted">No subject</p>`. `rnr-preview` is plain text in `white-space: pre-wrap` (no HTML ever reaches the DOM, plan decision 3).
- No records the person can see: after the select, `rnr-hint` "No records to preview with yet. Example values are shown." (the list is RLS-limited; a `comms.manage` holder may see none).
- Loading the record list: select shows "Loading records…" as its only option. Error: `rnr-error` "We could not load records to preview with. Example values are shown." (the editor keeps working).

### 4.6 Saving, conflict, guard, delete

| Part | Spec |
|---|---|
| Footer | `flex flex-wrap items-center gap-2`: primary **Save template**; for custom templates secondary-danger **Delete template** (`rnr-btn rnr-btn-danger`, opens `ConfirmDialog`: title `Delete {name}?`, same body as §3, then navigates to `#/templates` with the list h1 focused); then, when dirty, `rnr-status` `<PencilIcon/>Unsaved changes` (Phase 3 wording). System templates have no Delete (the plan has none in the editor at all; §10). |
| Save button | Never `disabled`. Busy: `aria-busy`, `rnr-spin`, "Saving…". Saved: `CheckIcon` + "Saved" for 1.6s (`rnr-pop`). |
| Status line | `role="status"` under the footer: `Template saved.` After a reload from conflict: `Template reloaded.` |
| Validation (on Save, focus to the first bad field, `aria-invalid` + `aria-describedby`, `rnr-error`) | Name blank: `Enter a name for this template.` Subject blank: `Enter a subject.` Message blank: `Write a message.` Too long: `Shorten the name to 120 characters or fewer.` / `Shorten the subject to 200 characters or fewer.` / `Shorten the message to 10,000 characters or fewer.` (the plan's "This field is required." names neither the field nor the fix). |
| Server error | `rnr-error role="alert"`: the `friendlyError` text (network: `We could not save this template. Try again.`). |
| Conflict | Alert: `This template was changed by someone else. Reload to see their changes.` then secondary **Reload template** and caption `Reloading discards your unsaved changes.` After reload: focus the h1, status `Template reloaded.` Not auto-merged (DD, as Phase 3). |
| Unsaved guard | `beforeunload` plus hash/sign-out/org-switch guard through `ConfirmDialog`: title `Leave without saving?`, body `Your changes to {name} will be lost.`, "Cancel" (autofocus) / danger "Leave without saving". Esc keeps editing. |
| Not found / other org | Card: h1 "This template does not exist", `rnr-muted` "It may have been deleted, or it belongs to another organisation." (the plan). Load error: "We could not load this template" + "Check your connection and try again." + secondary "Try again" (the plan said "reload the page"). |

## 5. Send message action in the workflow side panel

Lives inside the Phase 3 action block (`<div class="rnr-block flex-col items-stretch gap-2">`): title `label` "Send message", ghost "Remove" (`aria-label="Remove Send message action"`). The panel is 320px wide (content about 280px), so **every control is full width and stacked** (the plan's `flex flex-wrap items-end` row of two flex-1 selects plus a button cannot fit and wraps unpredictably).

```
Send message                                                    [Remove]
Template        [Choose a template…  ▾]
[Manage templates]                                   (ghost link button, comms.manage only)
Send to  (fieldset legend)
  Whoever started the record                          [Remove]
  Everyone with the role Manager                      [Remove]
  (none yet: "No recipients yet.")
Recipient to add [Choose who…  ▾]
Role             [Choose…  ▾]          (second select, only for kinds with a target)
[Add recipient]
caption: Each person gets an in-app notification. Email also goes out if the template is set to email and they have not turned it off.
```

| Part | Spec |
|---|---|
| Template | `rnr-field` with label "Template", `<select class="rnr-input">`, first option "Choose a template…", then every template by name. A saved `templateId` that is not in the list shows `<option value="{id}">Deleted template</option>` selected (the plan shows "Choose a template…" and hides that the choice is stale; the publish issue then says why). |
| Manage templates | `<a class="rnr-btn rnr-btn-ghost self-start" href="#/templates">Manage templates</a>` (the plan's `rnr-hint` link is muted 12px text with no button affordance). Following it with unsaved edits triggers the editor's own "Leave without saving?". Only with `comms.manage`. |
| Recipients | `<fieldset class="rnr-field gap-2"><legend class="rnr-label">Send to</legend>` then `<ul class="flex flex-col gap-1">` rows `flex items-center gap-2`: description `flex-1` (wraps), ghost Remove with `aria-label="Remove recipient: {description}"`. Empty: `<p class="rnr-caption">No recipients yet.</p>`. (Replaces the plan's `h4`.) |
| Add (two steps, like Add action) | Select **Recipient to add** with options below, then (except for the starter) a second select labelled with the kind, then secondary **Add recipient**. Empty choice on click: inline `rnr-error` "Choose who to send to." linked by `aria-describedby`, focus to the first empty select. |

| Kind | Option label | Second select label | Row text |
|---|---|---|---|
| role | Everyone with a role | Role | Everyone with the role {role} (or "(deleted role)") |
| user | A person | Person | {email} (or "A former member") |
| starter | The person who started the record | (none) | The person who started the record |
| step | The person who completed a step | Step (Start and Form steps) | Whoever completed {step name} (or "(deleted step)") |
| field | An email address from an answer | Answer (short-text fields) | The email in the answer {label} |

- **Focus.** After *Add recipient* the kind select resets and stays the focus anchor (focus moves to it; the second select unmounts). After *Remove*, focus goes to the previous row's Remove, else the next row's, else the kind select (the plan drops focus to `<body>`). Each change is announced through the editor's `onSay` live region: `{description} added as a recipient.` / `{description} removed.`
- **Publish issues** (verbatim from `sendMessageIssue`) are listed in the Phase 3 issues card with their "Show" buttons, not repeated here: `Choose a message template for "Send message".` · `The message template for "Send message" no longer exists. Choose another.` · `Add at least one recipient to "Send message".` · `Keep "Send message" to 20 recipients or fewer.` · `A recipient of "Send message" is incomplete. Finish it or remove it.` · `A role that "Send message" sends to no longer exists.` · `A person that "Send message" sends to is no longer a member.` · `"Send message" can only send to the person who completed a Start or Form step.` Inside the action block there is no error text of its own.
- **Phase 3 caption** `Actions run in the order you add them. Generate PDF is recorded on the timeline but not carried out yet: available when Reports ship.` and the "Add action" option label **Send message** (no "not active yet").

## 6. Messages page (`#/messages`, `comms.manage`)

`<section class="flex flex-col gap-4" aria-labelledby="messages-h">`. Header row: h1 "Messages" and, `ml-auto`, a ghost **Refresh** (`aria-busy` + `rnr-spin` + "Refreshing…" while `isFetching`; the page does not poll, DD). Under it `<p class="rnr-muted">Every email waits here until it is sent. Each message is tried up to four times, and failures stay until you retry them.</p>` (the honest model, decision 7). Then the filter, an `sr-only` result announcement, the retry status line, an alert slot, and one state.

**Filter.** `<div class="rnr-seg self-start" role="group" aria-label="Show messages">` with `aria-pressed` buttons **All / Failed / Queued / Sent** (Phase 3 view-toggle rule). Changing it sets `<p class="sr-only" role="status">` to `Showing {n} failed messages.` / `Showing 1 failed message.` / `No failed messages.` after the data arrives. While the new filter loads (`keepPreviousData`), the old rows stay, the card gets `aria-busy="true"`, and nothing else changes (DD: no dimming; stale Retry buttons are guarded by the server).

```html
<div class="rnr-card" style="padding:0;overflow-x:auto" aria-busy="false">
 <table class="rnr-table rnr-sticky-first"><caption class="sr-only">Messages for {org}, newest first</caption>
  <thead><tr><th scope="col">Message</th><th scope="col">Status</th><th scope="col">Problem</th><th scope="col" class="num">When</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
  <tbody><tr tabindex="-1">
   <td><span class="label">admin@alpha.test</span><br><span class="rnr-caption">New task: Leave approval</span></td>
   <td><span class="rnr-status"><XIcon 14/>Failed</span><br><span class="rnr-caption">Tried 4 times</span></td>
   <td class="rnr-problem">The email service refused this message: …<br><span class="rnr-caption">Fix the cause, then press Retry.</span></td>
   <td class="num"><time>11 Oct 2026, 14:30</time></td>
   <td><div class="flex justify-end whitespace-nowrap"><button class="rnr-btn rnr-btn-secondary" aria-label="Retry message to admin@alpha.test">Retry</button></div></td>
  </tr></tbody></table></div>
```

- The plan's six columns (To, Subject, Status, Problem, When, Actions) become five: recipient and subject share the sticky first cell (as the Inbox "Record" cell does), so the sticky column is one narrow stack, not two wide ones. DD.
- Newest first. `When` = `sent_at ?? created_at`. 
- **Attempts caption** under the status word: `Tried once` / `Tried {n} times` for any row with `attempts >= 1` except a `sent` row on its first try (the plan shows nothing for a failed row after one try, which hides why it stopped at once).
- **Problem:** the stored text verbatim (`.rnr-problem`: `min-width: 16rem; max-width: 28rem; overflow-wrap: anywhere`, capped at 500 characters by the worker). A `failed` row adds `rnr-caption` "Fix the cause, then press Retry."; a `queued` row with an error adds "Will try again automatically." Empty otherwise (render nothing, not a dash).

| State | Spec |
|---|---|
| Loading | `Skeleton` one 240px row; header and filter render at once. |
| Error | Card: "We could not load the messages. Check your connection and try again." (`role="alert"`) + secondary "Try again". |
| First run (All, no rows at all) | Card: ghost preview row `<div class="rnr-card" data-state="placeholder" aria-hidden="true">` ("admin@alpha.test" muted "Task assigned · Sent"), `<h2 class="dialog-title">No messages yet</h2>`, `<p class="rnr-muted">Task notices, invitations and workflow messages appear here once they are queued.</p>`. |
| Filtered out | The filter stays; below it a card with `<p class="rnr-muted">` and no illustration: Failed `No failed messages. Everything that was queued has been sent or is waiting.` · Queued `Nothing is waiting to be sent.` · Sent `Nothing has been sent yet.` (each is announced by the filter's result line). |
| Retrying | The row's button: `aria-busy`, `rnr-spin`, "Retrying…", keeps its place and focus; other rows stay live. |
| Retried | Status line (5s): `Retried. The message to {email} will be sent within a minute.` The list refetches (also on failure, since another admin may have acted). |
| Retry failed | `rnr-error role="alert"` above the table: the `friendlyError` text. Two-tab race: `Only failed messages can be retried. The list now shows the latest status.` (§10 changes the global copy), and the list has already refetched. |
| 200 rows | Caption under the table when `data.length === 200`: `Showing the newest 200. Filter to Failed to find problems quickly.` |

**Focus after Retry (QA-8).** The Retry button always unmounts after success (the row becomes Queued, or leaves the Failed filter), so: under **Failed** the row leaves, focus goes to the h1; under **All/Queued/Sent** the row stays, so focus goes to **its `<tr tabindex="-1">`** (the screen reader reads the row's new status). The plan focuses the h1 only for Failed, so under All focus falls to `<body>`.

## 7. Record timeline wording (Task 8 `eventText`)

Events are written when a message is **queued**, in the same transaction; they are never edited, so the timeline cannot show a later delivery failure (that lives on Messages). The sentences stay honest about that.

| Event detail | Sentence | Icon |
|---|---|---|
| `send_message`, `people` ≥ 1 | `Sent “{template}” to {n} {person\|people}` | none |
| …`emails` ≥ 1 (second line, `rnr-caption`, same `<li>`, DD) | `{n} email queued for delivery.` / `{n} emails queued for delivery.` | none |
| …`skipped` ≥ 1 | appended to the sentence: `. {n} recipient was skipped: no longer a member, or no valid email.` / `. {n} recipients were skipped: …` | none |
| `send_message`, `people` = 0 (everyone muted email and none were members cannot happen; the action stops the record instead) | not reachable | n/a |
| `send_message`, `status: 'pending'` (Phase 3 history) | `Message not sent: recorded before messages were available.` | **`x`** (DD: this will never send, so the Phase 3 `clock`, which means "waiting", is wrong now) |
| `generate_pdf` | unchanged: `PDF not made yet. Available when Reports ship.` | `clock` |
| Record stopped because a recipient or template is gone | the existing `Stopped: {message}` event, `stop` icon | `stop` |

"Sent" is honest for what the sentence counts (the in-app notices, delivered at once); the second line says the emails are only queued. The plan's "could not be reached" implies a delivery attempt that did not happen; skipped recipients were never mailed.

## 8. Copy table (new strings)

| Where | String |
|---|---|
| Nav / header | Templates · Messages · Settings · Notifications |
| Bell name | `Notifications` · `Notifications, {n} unread` |
| Bell announce | `New notification: {title}` · `{n} new notifications.` · `All notifications marked as read.` |
| Panel | `Notifications` · `Mark all as read` / `Marking…` · `Showing notifications for {org}.` · `No notifications yet. New tasks and messages for {org} appear here.` · `Showing your 20 newest.` · `Unread: ` (sr-only) |
| Panel errors | `We could not load your notifications. Check your connection and try again.` · `We could not mark your notifications as read. Try again.` · `Try again` |
| Settings | `Settings` · `Email notifications` · `Email me when` · intro (§2) · type captions (§2) · `{Type} emails turned on.` / `… off.` · `We could not save that setting. Try again.` · `We could not load your settings. Check your connection and try again.` |
| Templates | `Message templates` · `New template` / `Creating…` · `System` · `Email and in-app` · `In-app only` · `Updated` · `Delete {name}?` · `Delete template` / `Deleting…` · `{name} deleted.` · `Write your own template` · first-run body (§3) · `We could not load the templates. Check your connection and try again.` |
| Editor | `Edit template` · `Back to templates` · `Name` · `Channel` · `Subject` · `Message` · `Insert variable` · `Adds to the message at the cursor.` · `Inserted “{label}” in the message.` · `Not a variable, so it will be left empty: {list}` · `Preview` · `Record to preview with` · `No record (example values)` · `Previewing with {title}.` · `Save template` / `Saving…` / `Saved` · `Template saved.` · `Template reloaded.` · `Unsaved changes` · `Delete template` · `Reload template` · `Reloading discards your unsaved changes.` · `Leave without saving?` · validation (§4.6) · `This template was changed by someone else. Reload to see their changes.` |
| Send message | `Template` · `Choose a template…` · `Deleted template` · `Manage templates` · `Send to` · `No recipients yet.` · `Recipient to add` · `Choose who…` · `Choose…` · `Add recipient` · `Choose who to send to.` · `{description} added as a recipient.` · `{description} removed.` · caption (§5) |
| Messages | `Messages` · `Refresh` / `Refreshing…` · intro (§6) · `All` `Failed` `Queued` `Sent` · `Message` `Status` `Problem` `When` · `Queued` `Sent` `Failed` · `Tried once` · `Tried {n} times` · `Fix the cause, then press Retry.` · `Will try again automatically.` · `Retry` / `Retrying…` · `Retry message to {email}` · `Retried. The message to {email} will be sent within a minute.` · empty and error strings (§6) |
| Timeline | §7 |

## 9. Accessibility summary

| Area | Rule |
|---|---|
| Bell | Name carries the unread count; chip is `aria-hidden`; disclosure with `aria-expanded`; Esc, outside press and focus-leaving close it; focus returns to the bell on Esc; unread = dot + weight + sr-only "Unread:" (never colour alone). Arrival-only polite announcement, seeded silently on load and org switch. |
| Focus after actions | Mark all → panel heading. Template delete → list h1. Template save → stays on Save. Reload after conflict → h1. Retry → h1 (row leaves) or the row (row stays). Remove recipient → neighbouring Remove or the kind select. Menu insert → the field, caret after the token. |
| Live regions | Always-mounted `role="status"` lines (Settings, Templates, Editor, Messages), the bell's announcer, the editor's side-panel announcer (Phase 3). Alerts only for failures. The preview and unknown-variable text are never `role="alert"`. |
| Menus | Insert variable is a true ARIA menu (roving tabindex, arrows, Home/End, Esc, Tab closes). The bell is a disclosure (links), not a menu. |
| Targets | Bell 36px (44px coarse), rows and menu items 44px on coarse pointers, every icon-only or repeated button has a specific `aria-label` (Edit/Delete/Retry/Remove). |
| Colour | Status is icon + word. The unknown-variable line, conflict and failures use words; `danger` appears only on `rnr-error` text and the danger buttons. |
| Tables | `<caption class="sr-only">`, `th scope="col"`, sticky first column below `sm`, right-aligned times via `.num`. |
| Forms | Visible labels, `aria-invalid` + `aria-describedby` on error, focus to the first invalid field, no `disabled` on submit, `aria-busy` + `rnr-spin` while saving. |
| Mobile (375px) | Header group wraps to its own row; bell panel is full width inside the 1rem gutter under the header; Templates and Messages tables scroll inside their cards with the first column sticky; the editor stacks (form, then preview); filter fits one row; the side-panel Send message controls stack full width; no page-level horizontal scroll. |
| Motion | Nothing new animates beyond `rnr-pop` on a saved check and `rnr-spin`. `data-motion="flat"` needs nothing extra. |

## 10. Conflicts with Tasks 7, 8 and 10 and the corrections

| # | Plan code | Problem | Correction |
|---|---|---|---|
| 1 | T7 Bell: `<BellIcon size={20}/>` in `rnr-icon-btn` | `.rnr-icon-btn svg` forces 14px | `className="rnr-icon-btn rnr-bell"` and `.rnr-bell svg { width:20px; height:20px }` (§11) |
| 2 | T7 Bell: plain `rnr-icon-btn` | 28px, shorter than the 36px Sign out beside it | `.rnr-bell` sets `min-width/min-height: var(--rnr-control-h)` |
| 3 | T7 panel: `rnr-menu … w-[min(360px,…)] max-h-[70vh] overflow-y-auto` | `.rnr-menu` is 224px wide with `overflow:hidden`; unlayered wins, so the width is wrong and the list is clipped, not scrolled | `.rnr-menu.rnr-notices` (§11) |
| 4 | T7 item: `rnr-menu-item flex flex-col items-start gap-0.5` | `align-items:center` and the 10px gap win; title and time centre | `.rnr-notice` grid (§11); no Tailwind alignment on `rnr-menu-item` |
| 5 | T7 `aria-live` span "N unread notifications" | Announced on first load, every mark-read, org switch, other-tab reads: noisy | Arrival-only announcer (§1.3) |
| 6 | T7 panel `role="region" aria-label` + inner `h2` "Notifications"; `aria-controls` set when closed | Duplicate name; points at a missing id | `<section aria-labelledby="bell-h">`; `aria-controls` only while open |
| 7 | T7 panel position `absolute right-0` inside the wrapper | At 375px the panel's left edge lands 8px from the viewport, not the 1rem gutter | Header-relative full-width panel below `sm` (§1.2); header gets `relative` |
| 8 | T7 `mousedown` outside; no close on focus leave | Misses some touch; Tab leaves the panel open | `pointerdown`; close on focus leaving the wrapper |
| 9 | T7 "Mark all as read" unmounts when the count hits 0 | Focused button disappears; focus falls to `<body>` | Move focus to the panel heading first (§1.2) |
| 10 | T7 item shows title and time; unread is weight plus sr-only text | Body unused; weight alone is a weak sighted cue | Dot + weight + sr-only; add the 2-line body |
| 11 | T7 header group `ml-auto flex items-center gap-1`; header not `relative` | Fine on desktop; at 375px wraps unpredictably; no anchor for the phone panel | §0 header rule: group wraps to its own row; header `relative` |
| 12 | T7 Settings `toggle`: awaits the server, `if (saving) return`, `aria-busy` on the checkbox | Click looks dead until refetch; a second toggle is silently dropped; `aria-busy` on a checkbox means nothing | Optimistic per toggle with rollback (§2); drop the guard and the attribute |
| 13 | T7 Settings: sr-only legend, h1 not focusable, no per-type help, "Reload the page." errors | Honesty about in-app-always and org-wide scope is a single clause; no way to retry | §2 intro, captions, `tabIndex={-1}` h1, "Try again" |
| 14 | T8 list: `rnr-card p-0 overflow-x-auto` | Layer trap: 20px padding stays | `style="padding:0;overflow-x:auto"` |
| 15 | T8 list: `<td className="flex justify-end gap-1">` and `rnr-sticky-first` on a `td` | `display:flex` on a `td` breaks the table row; the sticky rule matches `.rnr-sticky-first th/td:first-child`, so the class belongs on the table | `div.flex` inside the cell; class on `<table>` |
| 16 | T8 list: no caption, bare "Edit"/"Delete", "Last changed" left-aligned, "Email"/"In-app" | Repeated unnamed buttons; wrong channel words | §3: caption, `aria-label`s, right-aligned "Updated", honest channel words; Edit is `rnr-btn-secondary`, Delete `rnr-btn-danger` (Phase 3 row actions) |
| 17 | T8 list: empty line inside the table card; delete title "Delete template?" | Bare line; title does not name the thing | §3 first-run card; title `Delete {name}?` |
| 18 | T8 editor: h1 is the template name; no focus target | Name changes while typing nothing; Phase 3 uses "Edit …" | h1 "Edit template", `id` + `tabIndex={-1}` |
| 19 | T8 menu: `rnr-menu w-72 max-h-80 overflow-y-auto`, buttons with `flex flex-col items-start` | Same layer trap as #3 and #4: 224px, clipped long answer lists, centred text | `.rnr-menu--wide` and `.rnr-menu-item--stack` (§11) |
| 20 | T8 menu: no focus management, Esc only when focus is inside, no outside close, no `aria-haspopup`, focus lost on Esc | Not usable by keyboard as a menu | Full menu-button behaviour (§4.3) |
| 21 | T8 unknown variables: `rnr-error role="alert"` live while typing | Announces per keystroke; red reads as a blocker though it is not | Grey `rnr-status` + `StopIcon`, polite, debounced (§4.4) |
| 22 | T8 validation "This field is required." | Names no field, no fix | Per-field sentences (§4.6) |
| 23 | T8 conflict "Someone else changed this template." | Inconsistent with Phase 3's wording; no discard warning | `This template was changed by someone else. Reload to see their changes.` + caption + focus h1 |
| 24 | T8 save feedback is only the button label | A label swap is not announced | Status line `Template saved.` (§4.6) |
| 25 | T8 editor has no delete for custom templates | Task 6 §5 requires it; the list-only delete is out of reach from the editor | Delete template in the footer for custom templates (§4.6) |
| 26 | T8 channel segment "Email" / "In-app only"; same hint for invites | "Email" omits the always-on notification; invites ignore the channel (decision 11) | "Email and in-app" / "In-app only"; invite hint (§4.2); `self-start` on the segmented control |
| 27 | T8 preview: bare `<p class="label">` + `<p whitespace-pre-wrap>`, no captions; no empty-record hint | Subject and message unlabelled | §4.5 markup, `.rnr-preview`, hints |
| 28 | T8 `MessageAction`: `flex flex-wrap items-end` with two `flex-1` selects + button | Cannot fit the 320px panel | Stacked full-width controls (§5) |
| 29 | T8 `MessageAction`: `h4`, `rnr-hint` link, "Choose a template…" for a deleted template, no focus after Remove | Heading skip; link without affordance; stale choice hidden; focus dropped | `fieldset/legend`, ghost link button, "Deleted template" option, focus rules (§5) |
| 30 | T8 timeline: `Sent “X” to N people. M recipients could not be reached.` and pending icon `clock` | "Reached" implies a failed attempt; a pending message will never send, so `clock` ("waiting") is wrong | §7 sentences; pending icon `x`; update the `eventIcon` test (`'clock'` becomes `'x'` for `status: 'pending'`) and the `eventText` test strings |
| 31 | T8 SidePanel: option "Send message" and caption (matches), action has no explanation of channel | A recipient could think muting stops the notice | One `rnr-caption` in the action block (§5) |
| 32 | T10: `rnr-card p-0 overflow-x-auto`; `rnr-sticky-first` on `td` | Same as #14 and #15 | `style=""` padding; class on `<table>` |
| 33 | T10 status cell: `<span class="rnr-status">Queued</span>` with no icon, ` · N tries` inline | Status is meant to be icon + word; "tries" misses a failed one-shot | Icon + word, caption `Tried once` / `Tried N times` (§6) |
| 34 | T10: six columns, bare "Retry", "Problem" raw text, no caption | Sticky To column plus Subject is wide; identical buttons | Five columns, `aria-label` per Retry, hint under problems (§6) |
| 35 | T10 focus: heading only when the filter is Failed | Under All/Queued/Sent the Retry button unmounts and focus is lost | Row `tabindex=-1` focus (§6) |
| 36 | T10 empty: bare `<p class="rnr-muted">` per filter; load error "Reload the page." | README forbids bare empty states; no retry action | §6 first-run card, filtered-out card, "Try again" |
| 37 | T10 filter: no announcement of results | Silent change for screen readers | `sr-only` result line (§6) |
| 38 | T7 `friendlyError`: `Only failed messages can be retried. Reload to see the latest status.` | The page has already refetched; "Reload" is wrong advice | Change the sentence in `src/ui/errors.ts` and its test to `Only failed messages can be retried. The list now shows the latest status.` |
| 39 | T10 and Review Focus: Messages never refreshes after load | The worker runs every minute; the page goes stale | Ghost "Refresh" button (§6); no polling |
| 40 | T7/T8/T10 nav: Templates, Messages "after Workflows" | Matches, but Messages is not current-marked for any template route | Confirmed: `route.page === 'templates' \|\| 'template'` for Templates; `'messages'` for Messages (as the plan) |

Items 40 and the plan's `useTemplates` ordering (system first, then name) are confirmations, not changes.

## 11. CSS to add to `src/index.css` (tokens only)

```css
/* Phase 4: bell, notices, comms (design/phase-4-screens.md §1, §4, §6, §11). */
.rnr-bell { position: relative; min-width: var(--rnr-control-h); min-height: var(--rnr-control-h); color: var(--ink-label); }
.rnr-bell svg { width: 20px; height: 20px; }
.rnr-bell .rnr-chip { position: absolute; top: -4px; right: -4px; min-width: 20px; justify-content: center; padding: 0 6px; }

.rnr-menu.rnr-notices { position: absolute; z-index: 20; top: calc(100% + var(--space-2)); right: 0; width: 360px; max-height: min(70dvh, 28rem); overflow-y: auto; }
@media (max-width: 639px) { .rnr-menu.rnr-notices { left: var(--space-4); right: var(--space-4); width: auto; } }
.rnr-notices-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: var(--space-1) var(--space-3); }
.rnr-notices-sub, .rnr-notices-foot { padding: 0 var(--space-3) var(--space-2); }
.rnr-notices-list { margin: 0; padding: 0; list-style: none; }
.rnr-notice { display: grid; grid-template-columns: 8px 1fr; column-gap: var(--space-2); row-gap: var(--space-1); align-items: start; text-decoration: none; }
.rnr-notice > :not(.rnr-notice-dot) { grid-column: 2; }
.rnr-notice-dot { grid-row: 1; margin-top: 6px; width: 8px; height: 8px; border-radius: var(--radius-full); background: transparent; }
.rnr-notice[data-unread="true"] .rnr-notice-dot { background: var(--ink); }
.rnr-notice-title { font-weight: 400; color: var(--ink-label); }
.rnr-notice[data-unread="true"] .rnr-notice-title { font-weight: 600; color: var(--ink); }
.rnr-notice-body { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
@media (pointer: coarse) { .rnr-notice, .rnr-menu-item { min-height: var(--touch-min); } }

.rnr-menu.rnr-menu--wide { width: min(320px, calc(100vw - 2rem)); max-height: 20rem; overflow-y: auto; }
.rnr-menu-item--stack { flex-direction: column; align-items: flex-start; gap: 0; }
.rnr-menu-item[aria-disabled="true"] { color: var(--ink-muted); cursor: default; }
.rnr-menu-item[aria-disabled="true"]:hover { background: transparent; }

.rnr-preview { padding: var(--space-3); border: 1px solid var(--line-200); border-radius: var(--radius-lg); background: var(--surface-200); color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.rnr-problem { min-width: 16rem; max-width: 28rem; overflow-wrap: anywhere; }
.rnr-table tbody tr:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
```

Plus the layout notes: `<header>` gets `relative`; the bell wrapper gets `sm:relative`; the template form card must not set `overflow:hidden` (the menu opens past its edge). All colour is `ink`, `ink-label`, `ink-muted`, `surface-200`, `line-200`, `focus-ring`; B&W needs no override (the dot is `--ink`, the chip border comes from the bundle).
