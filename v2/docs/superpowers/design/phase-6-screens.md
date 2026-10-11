# Phase 6 screens: implementation spec

Sources: `design/README.md` (content, dataviz, motion, interaction rules), `tokens.css`, `components/bundle.css` + component READMEs/previews (Widget, DataTable, Segmented, Menu, Dialog, Field, Badge, Button, Icon), `phase-1-screens.md` to `phase-5-screens.md` (their §0 sections, dialog rules, the layer trap, the row-header trap and every `src/index.css` addition still apply; Phase 5's chart classes, pager, CSV and `Download CSV` wording are reused), Phase 6 plan Tasks 2, 6, 8 and 9 plus Global Constraints, and the shipped `src/**` (App shell, `ConfirmDialog`, `useAction`, `useNotice`, `useFocusAfterRender`, `useLeaveGuard`, `useMemberEmails`, `Skeleton`, `When`/`Day`, `errors`, `icons`, `SettingsPage`, the Phase 5 `chart.ts`). Tailwind utilities are for **layout only**; colour, type, radius and controls come from `rnr-*` classes and tokens. "DD" = design decision (design system or plan silent; most conservative option). Where this file differs from Tasks 2, 6, 8 and 9, this file wins (§13 lists every difference). Read "designer §12" in the plan as **§12** of this file.

Selectors verified in `bundle.css`: `rnr-card(-head|-title)`, `rnr-kpi`, `rnr-btn(-primary|-secondary|-ghost|-danger)`, `rnr-icon-btn`, `rnr-field`, `rnr-label`, `rnr-hint`, `rnr-input`, `rnr-error`, `rnr-status`, `rnr-chip`, `rnr-seg`, `rnr-dialog(-head|-body)`, `rnr-table` (+ `.num`), `rnr-skeleton`, `rnr-spin`, `rnr-pop`, `rnr-muted`, `rnr-num`, `rnr-focus`, `rnr-kbd`; type classes `page-title`, `dialog-title`, `label`. From `src/index.css`: `rnr-check`, `rnr-caption`, `rnr-fieldset-label`, `rnr-sticky-first`, `rnr-table-card`, `rnr-pref-caption`, `rnr-problem`, `rnr-pager`, `rnr-chart*` (wrap, grid, zero, axis, line, dot, hit, tip), `.rnr-btn[aria-disabled]`, `.rnr-btn-ghost[aria-pressed]`, `.rnr-table tbody th[scope="row"]`. **Not in the bundle** (do not use): a toast, a tab bar, a tooltip component, a warning icon, a progress bar, `rnr-btn-sm`. Icons available (`src/ui/icons.tsx`): Check, X, Clock, Plus, Trash, Grip, Up, Down, Back, Pencil, Stop, Right, Bell, Download, More. **No new icon is added in this phase.**

**Traps this file keeps hitting (they bite the plan's code in §13):**
1. *Layer trap*: `bundle.css` is unlayered and beats Tailwind utilities. No `rnr-card p-0`, `rnr-menu w-…`, `td.flex`. Use the classes in §12.
2. *Chip trap* (Phase 4 trap 3): `rnr-chip` is blue (`info-surface`), outlined in B&W. It is for marks like "System", never for status. The plan's status chip in the list and the report header is replaced by `rnr-status`.
3. *Confirm-colour trap*: `ConfirmDialog`'s confirm button is always `rnr-btn-danger`. Sending a campaign is not destructive and gets its own dialog (§3.8).
4. *Hosting trap* (§6.0): a Supabase Edge Function on the default `*.supabase.co` domain may not render HTML. Verify before building the unsubscribe pages.

## 1. Global additions

| Item | Spec |
|---|---|
| Nav | `Campaigns` for `comms.broadcast`, after Messages and before Members (Phase 4/5 order: Inbox, Records, Dashboard, Reports, Forms, Workflows, Templates, Messages, **Campaigns**, Members, Roles). `aria-current="page"` and `rnr-btn-secondary` for `campaigns` and `campaign`. Eleven items wrap on the nav's existing `flex-wrap` at 375px. No count badge. |
| Page widths | List `max-w-5xl`. Editor `max-w-2xl` (draft, scheduled, failed). Report `max-w-5xl`. Settings unchanged (`max-w-2xl`). |
| One h1, one primary | List: h1 "Campaigns"; primary `New campaign` (header, with `<kbd class="rnr-kbd" aria-hidden="true">N</kbd>`, DD as Forms/Reports; first run: the card's, header button hidden). Editor (draft): h1 = campaign name; primary is the single send action (`Send now` or `Schedule`, §3.5); Save draft is secondary. Editor (scheduled): no primary (`Cancel schedule` secondary). Editor (failed): no primary (`Edit and schedule again` secondary). Report: no primary (follow-ups are secondary: nothing on the page commits money or mail by itself, they create a draft). Every h1 has `id` and `tabIndex={-1}`. |
| Back link | Editor and report: `<a class="rnr-btn rnr-btn-ghost self-start" href="#/campaigns"><BackIcon/>Back to campaigns</a>` (the plan says "Campaigns"). |
| Status = grey icon + word (DD) | `rnr-status` (14px grey icon, `ink-label` word), never colour alone, never a chip. Words: **Draft**, **Scheduled**, **Sending**, **Sent**, **Not sent** (the stored `failed`; the word says what happened, as "PDF not made" in Phase 5). |

| Status | Icon | Word |
|---|---|---|
| `draft` | `PencilIcon` | Draft |
| `scheduled` | `ClockIcon` | Scheduled |
| `sending` | `RightIcon` | Sending |
| `sent` | `CheckIcon` | Sent |
| `failed` | `XIcon` | Not sent |

`RightIcon` for Sending (DD): the set has no "in progress" glyph and a spinner on a list row would loop for decoration (README). A component `CampaignStatusMark` (`src/campaigns/StatusMark.tsx`, like `RecordStatusMark`) renders it; `CAMPAIGN_STATUS` keeps the words.

| Item | Spec |
|---|---|
| Channel words (DD) | Campaign `email` = **"Email"**, `in_app` = **"In-app notice"**. Phase 4's "Email and in-app" is not used here: a campaign email makes **no** in-app copy (plan decision 8), so the Phase 4 word would be false. The Templates list still says "Email and in-app" for the same template; the editor explains it (§3.2). |
| Numbers | Tabular (`rnr-num`), en-GB grouping ("10,000", "4,210"), right-aligned in tables (`.num`, headers too). Percentages: one decimal at most, no trailing ".0" ("40%", "6.3%", `pctText`). **Zero denominator: "No data yet"**, never `NaN%`, "0%" or a dash. A real zero with a denominator is "0%". |
| Dates | `When` ("11 Oct 2026, 14:30", reader's zone) in tables and headers; `Day` where only a day is needed. Schedule input: local `datetime-local`, zone named (§3.4). The CSV keeps ISO UTC. |
| Opens wording | Always: "Opens are approximate: Apple Mail Privacy Protection opens emails automatically." One sentence everywhere (`OPENS_NOTE`). |
| Status line | Phase 2 to 5 pattern: `<p class="rnr-caption" role="status">` stays mounted, text swaps, clears after 5s (`useNotice`). Never two live regions announcing one change. |
| Reading level | Errors say what to do, no codes, no "we" except the existing load-failure precedent (none is added here: new load errors say "The … did not load."). |
| Empty states | First run with one primary action; "no results" and "filtered out" give a next step; errors have Try again. No bare "No data". |

## 2. Campaigns list (`#/campaigns`)

`<section class="flex max-w-5xl flex-col gap-4" aria-labelledby="campaigns-h">`: header row `flex flex-wrap items-center gap-3`: h1 "Campaigns", primary `New campaign` (`PlusIcon`, `<kbd>N</kbd>`, `ml-auto`; `N` with no modifier, focus not in a field, no dialog open). Status line. Then one state.

```html
<div class="rnr-card rnr-table-card">
 <table class="rnr-table rnr-sticky-first"><caption class="sr-only">Campaigns in {org}, newest first</caption>
  <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col" class="num">Date</th>
    <th scope="col" class="num">Delivered</th><th scope="col" class="num">Opened</th><th scope="col" class="num">Clicked</th>
    <th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
  <tbody><tr>
   <td>{name}</td>
   <td><CampaignStatusMark/></td>
   <td class="num"><When iso/> | <span class="rnr-muted">Not scheduled</span></td>
   <td class="num">{pct}</td><td class="num">{pct}</td><td class="num">{pct}</td>
   <td><div class="flex justify-end gap-1 whitespace-nowrap">
     <a class="rnr-btn rnr-btn-secondary" href="#/campaigns/{id}" aria-label="Open {name}">Open</a>
     <button type="button" class="rnr-btn rnr-btn-danger" aria-label="Delete {name}">Delete</button></div></td></tr></tbody></table></div>
```

- The name is plain text (as Forms, Workflows, Reports); `Open` opens the editor or the report. `Delete` only on drafts. Rows are newest first (the plan's order).
- **Date column (DD):** header "Date" (the plan's "Sent or scheduled" is wrong for a draft and a failed row). Value: `finished_at ?? audience_snapshot_at ?? scheduled_at`; a draft shows "Not scheduled". The `<th>` is `class="num"` and so is the cell.
- **Percent cells (DD):** `Delivered` = delivered of recipients, `Opened` and `Clicked` = share of **delivered** (email) via `pctText(pct(…))`. **Rows that never sent** (`draft`, `scheduled`, `failed`) have no numbers to show: one cell `<td colspan="3" class="rnr-muted">Not sent yet</td>` replaces the three (the plan prints "No data yet" three times). `sending` rows show the live figures (the stats query refetches every 10 s only while a campaign is sending; no live announcement). **In-app rows:** Delivered and Clicked read `<span class="rnr-muted">Not tracked</span>` (the plan's "In-app" is a channel, not a value); Opened shows the read share and its cell carries `title`-less text only: the header stays "Opened", so the in-app cell is `{pct} read` (e.g. "25% read").
- Under the table, when there are more than 200: `rnr-caption` "Showing the newest 200 of {n} campaigns." (the plan).

| State | Spec |
|---|---|
| Loading | `Skeleton` one 100% × 200 row; header renders at once. |
| First run | Card `gap-3`: ghost preview `<div class="rnr-card" data-state="placeholder" aria-hidden="true">` ("Term starts", muted "Email · 240 people"); `h2 dialog-title` "Send your first campaign"; `<p class="rnr-muted">Email a role or the people in a report, schedule it, and see who opened it and who finished the workflow.</p>`; the one primary `New campaign` (header button hidden meanwhile). |
| Error | Card: `<p role="alert">The campaigns did not load. Check your connection and try again.</p>` + secondary `Try again`. |
| Filtered out | Not applicable (no filters). |
| Stats failed | The table still renders; the three percent cells read `<span class="rnr-muted">Not loaded</span>` and a `rnr-caption role="alert"` above the table: "The numbers did not load. Reload the page to try again." (the plan renders `No data yet`, which claims there are no numbers). |

**New campaign dialog** (`rnr-dialog`, Phase 2 §8): title "New campaign"; one field **Name** (`data-autofocus`, `maxLength` 120, `aria-describedby` the error); hint none. Buttons `Cancel` (secondary) and primary `Create campaign` (busy `Creating…`). Error "Enter a name for the campaign." (`rnr-error role="alert"`, focus the field). Success navigates to the editor and focuses its h1.

**Delete confirm** (`ConfirmDialog`, Cancel autofocused): title `Delete {name}?`; body `{name} is a draft and will be deleted for everyone. It cannot be recovered.`; buttons `Cancel` / danger `Delete draft` (busy `Deleting…`). Success: status `{name} deleted.` and focus to the h1. Failure (0 rows): "This campaign is no longer a draft, or it was already deleted. The list now shows the latest." and refetch the list (the plan shows an unactionable "Reload" sentence and leaves the stale row).

## 3. Campaign editor (`#/campaigns/:id`, status `draft`)

`<section class="flex max-w-2xl flex-col gap-4" aria-labelledby="campaign-h">`: back link, `<h1 id="campaign-h" class="page-title" tabIndex={-1}>{name}</h1>`, `<p class="rnr-status">` Draft (with `PencilIcon`) and, when dirty, `<p class="rnr-status"><PencilIcon size={14}/>Unsaved changes</p>` (replaces the Draft mark while dirty), status line, then one `<form noValidate>` holding four cards (`flex flex-col gap-4`), then the action row. (DD: the plan's single card with Save in the middle and Send at the bottom hides the main action and puts Delete beside Save.)

### 3.1 Card "Message" (`section.rnr-card gap-4`, `h2.dialog-title` "Message")

1. **Name** — `rnr-field` input, `maxLength` 120. Empty on save: "Enter a name for the campaign." (focus the field).
2. **Message template** — select, first option `Choose a template`, `optgroup` "Email" and "In-app" (invite templates never listed). `aria-describedby` the warning when shown.
   - **Template warning (DD wording kept from `campaignTemplateIssue`):** `<p class="rnr-hint rnr-hint-warn" id aria-live="polite">` below the select: "This template uses {{record.title}}, which is empty in a campaign. Only {{org.name}} and {{recipient.name}} are filled in." Region always mounted so a change announces. Not red (it is a caution, not an error); `ink-label` 500 so it outweighs a muted hint (§12).
   - No templates: select replaced by `rnr-muted` "There are no message templates yet." plus, with `comms.manage`, `<a class="rnr-btn rnr-btn-secondary" href="#/templates">Go to templates</a>`; without it "Ask someone who manages templates to create one."
3. **Channel readout (DD)** — `<p class="rnr-caption">` under the select once a template is chosen: email: "Sent as an email. Each person also gets the unsubscribe link in the footer." In-app: "Sent as an in-app notice. It shows in the bell and cannot be muted. People without an account are left out." Nothing before a template is chosen.

### 3.2 Card "Audience" (`h2.dialog-title` "Audience")

- **Follow-up audiences are read-only** (made on the report page): `<p class="rnr-muted">People from {campaign name} who did not open it.</p>` or `…who have not finished {workflow}.` (a link to the earlier campaign: `<a href="#/campaigns/{id}">{name}</a>`). No segmented control, no selects. The size line reads "Counted when sending starts."
- **Choice:** `<div class="rnr-seg self-start" role="group" aria-label="Who receives it">` of two `aria-pressed` buttons `A role` / `A report` (the plan's `radiogroup` has no roving tabindex; Phase 3 #31, Phase 5 #38). The "A report" button is **omitted** when the sender has neither `reports.view` nor `reports.manage` (DD: the server would fail the campaign with the report sentence), and then the role select shows without the segmented control.
- **A role:** `rnr-field` "Role", select (`Choose a role`). No roles: "There are no roles yet."
- **A report:** `rnr-field` "Report", select (`Choose a report`). **Grouped reports are listed but cannot be chosen** (`<option disabled>`): `{name} (grouped, lists groups not people)`. A `rnr-caption` under the select: "Grouped reports list groups, not people, so they cannot be used." No reports: "There are no saved reports yet." Then `rnr-field` "Send to" (appears once a report is chosen): options `The person who started each record` (default) and `The address in {field label}` per short-text answer holding an email (the plan uses curly quotes; none). Hint: "A started-by recipient must be an active member. An address in an answer can belong to someone without an account." If the workflow has no such answer: `rnr-caption` "This workflow has no short-text answer that could hold an address." and only the first option.
- **Size line and explanation (live recipient count + exclusions):**

```html
<p class="rnr-muted rnr-num" aria-live="polite" aria-atomic="true">About 240 people.</p>      <!-- the only live region of the card -->
<p class="rnr-caption">The list is taken when sending starts. People who unsubscribed, have no email address or are listed twice are left out, and the report counts them.</p>
```

| Size state | Text |
|---|---|
| Nothing chosen | `Choose who receives this campaign.` |
| Loading | `Counting…` (muted, polite) |
| Role | `About 240 people.` / `About 1 person.` |
| Report | `About 240 records match.` then the caption "Each record gives one recipient. Records without a usable address are left out." |
| In-app channel | the caption ends "…People without an account cannot get an in-app notice and are left out." instead of the unsubscribed clause (opt-outs do not apply to in-app) |
| Follow-up | `Counted when sending starts.` |
| Count failed | `The audience size did not load. It is counted again when sending starts.` + ghost `Try again` |
| Report refused | the server sentence verbatim in `rnr-error` (e.g. the 10,000 records sentence), no retry |
| **Over 10,000 (DD)** | `<p class="rnr-error" role="alert">This audience has more than 10,000 people, which is more than one campaign can send. Split it into smaller roles or reports.</p>` (the exact `TOO_BIG` sentence); the Send action refuses (§3.5) and focuses the audience control. The plan never shows the cap in the editor, so a person learns it only after a failed send. |

### 3.3 Card "Completion tracking" (`h2.dialog-title` "Completion tracking")

`rnr-field` "Linked workflow (optional)", select `None` + workflows, `aria-describedby` the hint: "The report then shows how many recipients started and finished it, and can remind the ones who have not." Server refusal (the sender lacks `records.view_all` for it) shows as `rnr-error role="alert"` under the select, `aria-invalid`, focus there: "You can only link a workflow whose records you can all see. Choose another, or ask an admin for access." (existing mapped sentence). DD: the list is not filtered (the editor cannot read `workflow_access` cheaply); the sentence is the guard.

### 3.4 Card "When to send" (`h2.dialog-title` "When to send")

`<div class="rnr-seg self-start" role="group" aria-label="When to send">` of `aria-pressed` buttons `Send now` / `Send later` (default Send now). **Send later** reveals:

```html
<div class="rnr-field">
  <label class="rnr-label" for="at">Send at</label>
  <input id="at" type="datetime-local" class="rnr-input rnr-num" min="{now+1min local}" max="{now+1year local}" aria-describedby="at-h">
  <p class="rnr-hint" id="at-h">Your time zone: Asia/Kuala Lumpur (GMT+8). Sending can start up to a minute after this time.</p>
</div>
```
(DD: the zone sits in the hint, spaces for underscores, offset from `Intl` `timeZoneName: 'shortOffset'`; the plan prints the raw IANA id in the label.) Default value now + 1 hour, rounded to the minute. Errors (client, same sentences as the server): "Choose a time in the future." / "Choose a time within the next year." (`rnr-error role="alert"`, focus the input).

### 3.5 Action row and validation

`<div class="flex flex-wrap items-center gap-2">`: **`Save draft`** (secondary; busy `Saving…`; saved check + "Saved" `rnr-pop`, 1.6 s), then the single **send action** (primary): label `Send now` when "Send now" is selected, `Schedule` when "Send later" is. Then `Delete draft` (`rnr-btn-danger ml-auto`, own row on phones). The send action never uses `disabled`; pressing it validates (the plan's rule) in DOM order and focuses the first problem:

| Problem | Message (`rnr-error`, `aria-invalid` on the control) |
|---|---|
| No name | Enter a name for the campaign. |
| No template | Choose a message template before sending. |
| No role / report / audience | Choose who receives this campaign before sending. |
| Over 10,000 | the `TOO_BIG` sentence (§3.2) |
| Time missing/past/far | the time sentences (§3.4) |

Validation passes → the review dialog (§3.8) opens; **nothing is saved or scheduled until Confirm**.

### 3.6 Saving, conflict, guard

- Save: `updateCampaign` with the saved `updated_at`; success keeps focus on Save draft, status line "Draft saved.". Conflict (0 rows): `rnr-error role="alert"` "This campaign was changed by someone else. Reload to see the latest version, then make your change again." + secondary `Reload campaign` (Phase 5 conflict block). Other failures: the `friendlyError` text.
- Unsaved changes are guarded by `useLeaveGuard` with the Phase 2 dialog: title "Leave without saving?", body `Your changes to {name} will be lost.`, buttons `Cancel` (autofocus) / danger `Leave` (the plan's "Leave without saving" repeats the title).
- A draft's dirty marker: the `rnr-status` "Unsaved changes" (above).

### 3.7 Delete draft

`ConfirmDialog`: title `Delete {name}?`, body `{name} is a draft and will be deleted for everyone. It cannot be recovered.`, `Cancel` / danger `Delete draft` (busy `Deleting…`); success navigates to `#/campaigns` and the list's h1 takes focus (the list focuses its h1 on mount when arriving from a delete; DD via `sessionStorage` key like `FOCUS_KEY`, else the browser default is acceptable).

### 3.8 Review and confirm dialog (new `SendDialog`, `src/campaigns/SendDialog.tsx`)

Native `<dialog class="rnr-dialog">` (not `ConfirmDialog`: its confirm button is danger). Opens from the send action.

```html
<dialog class="rnr-dialog" aria-labelledby="t" aria-describedby="b">
 <div class="rnr-dialog-head"><h2 id="t">Send Term starts now?</h2> <!-- or "Schedule Term starts?" --> <button class="rnr-icon-btn" aria-label="Close dialog">…</button></div>
 <div class="rnr-dialog-body">
  <dl class="rnr-review" id="b">
    <dt>Template</dt><dd>Term starts reminder · Email</dd>
    <dt>Audience</dt><dd>Role: Member</dd>                         <!-- Report: {name}, to the person who started each record | Follow-up: people who did not open {campaign} -->
    <dt>People</dt><dd class="rnr-num">About 240 people</dd>       <!-- "About 240 records match" | "Counted when sending starts" -->
    <dt>Workflow</dt><dd>Leave approval</dd>                       <!-- row omitted when none -->
    <dt>When</dt><dd>Now</dd>                                       <!-- "12 Oct 2026, 09:00 (Asia/Kuala Lumpur)" -->
  </dl>
  <p class="rnr-muted">People who unsubscribed or have no email address are left out, and the report counts them. You cannot cancel it once sending starts.</p>
  <!-- later: "You can cancel until sending starts." -->
  <p class="rnr-error" role="alert">…</p>
  <div class="flex justify-end gap-2"><button class="rnr-btn rnr-btn-secondary" data-autofocus>Cancel</button> <button class="rnr-btn rnr-btn-primary" aria-busy>Send now</button></div>
 </div>
</dialog>
```
- Title: `Send {name} now?` or `Schedule {name}?`. Confirm: primary `Send now` / `Schedule`, busy `Sending…` / `Scheduling…`. **Cancel is focused** (safe default for mail that cannot be recalled). In-app: the "unsubscribed" clause becomes "People without an account are left out, and the report counts them." and the "cannot cancel" clause is unchanged.
- Confirm saves the draft if dirty, then calls `schedule_campaign`. A save conflict closes the dialog and shows the conflict block (§3.6). A server refusal ("Only a draft campaign can be scheduled." etc.) shows in the dialog's `rnr-error`, refetches, and leaves the dialog open on the new state only if still a draft; otherwise it closes. Success closes the dialog, the page becomes the scheduled summary or the report, and focus goes to the h1 (`onMoved`). Status line: `Sending started.` / `Campaign scheduled.`
- Esc and the close button dismiss; backdrop click dismisses.

## 4. Scheduled and failed states (same page, same `max-w-2xl` column)

**Scheduled** — h1, `rnr-status` Scheduled (`ClockIcon`), status line, then:
```html
<section class="rnr-card gap-3" aria-labelledby="sch-h">
  <h2 id="sch-h" class="dialog-title">Scheduled for 12 Oct 2026, 09:00</h2>
  <dl class="rnr-review"> Template · Audience · People ("Counted when sending starts") · Workflow · Scheduled by {name}</dl>
  <p class="rnr-muted">It cannot be edited until the schedule is cancelled. You can cancel until sending starts.</p>
  <div><button type="button" class="rnr-btn rnr-btn-secondary">Cancel schedule</button></div>
</section>
```
`Scheduled by` uses `useMemberEmails` (`You`, the address, or `Former member`). **Cancel schedule** opens `ConfirmDialog` with a new optional prop `dismissLabel` (DD; the plan's pair "Cancel" and "Cancel schedule" is unreadable aloud): title `Cancel the schedule for {name}?`, body `{name} goes back to a draft and nothing is sent. You can schedule it again.`, buttons `Keep schedule` (autofocus) / danger `Cancel schedule` (busy `Cancelling…`). Success: the draft editor with the h1 focused and status "Schedule cancelled." A "no longer scheduled" refusal ("This campaign has started sending and cannot be changed.") shows in the dialog and the page refetches into the report.

**Failed** ("Not sent") —
```html
<section class="rnr-card gap-3" aria-labelledby="fail-h">
  <h2 id="fail-h" class="dialog-title">This campaign was not sent</h2>
  <p class="rnr-status" data-wrap role="alert"><XIcon size={14}/>{stored reason}</p>        <!-- e.g. "This audience has more than 10,000 people, which is more than one campaign can send. Split it into smaller roles or reports." -->
  <p class="rnr-muted">Nothing was sent. Edit the campaign, then schedule it again.</p>
  <div><button type="button" class="rnr-btn rnr-btn-secondary" aria-busy="false">Edit and schedule again</button></div>
</section>
```
Press → `cancel_campaign` (busy `Opening…`), the page becomes the draft editor and its h1 takes focus. No stored reason: "This campaign could not be prepared. Edit it and schedule it again." (the server fallback sentence). Stored reasons are fixed server sentences (Global Constraints); the page never invents one.

## 5. Campaign report (`#/campaigns/:id`, status `sending` or `sent`)

`<section class="flex max-w-5xl flex-col gap-4" aria-labelledby="campaign-h">`: back link, header, status line, then blocks in this order: tiles, notes, chart, completion, follow-up, recipients.

**Header (DD adds "sent by" and the audience):** `<div class="flex flex-wrap items-center gap-3">` h1 {name} and `<CampaignStatusMark/>`. Then `<p class="rnr-muted">Sent by {You | address | Former member}. Sending started <When/>{ · finished <When/>}.</p>` and, `rnr-caption`, `{Role: Member | Report: Leave requests | Follow-up: …} · {template name} · {Email | In-app notice}`. While sending, the Recipients tile carries "4,200 of 10,000 sent so far" (§5.1); the figures refresh every 10 s without an announcement. One sr-only `role="status"` announces only the transition: `{name} has finished sending.` (the plan announces nothing).

### 5.1 Tiles (`rnr-campaign-tiles`)

```html
<h2 class="sr-only">Results</h2>
<ul class="rnr-campaign-tiles" data-count="5">
 <li class="rnr-card">
  <header class="rnr-card-head"><p class="rnr-card-title">Delivered</p></header>
  <p class="rnr-kpi rnr-num">40%</p>
  <p class="rnr-caption">4,000 of 10,000</p>
 </li> … </ul>
<p class="rnr-caption" id="opens-note">Opens are approximate: Apple Mail Privacy Protection opens emails automatically.</p>
```
- Tiles are the Widget component's card, head and `rnr-kpi` (Phase 5 Number widget), in a `ul` so a screen reader hears "list, 5 items" (the plan's five `h2` flood the heading outline). The title is the visible label; the Opened tile has `aria-describedby="opens-note"`.
- **Grid (DD, differs from the brief's 2):** 1 column; from `sm` 3 columns for five tiles (3 + 2) and 2 for the in-app pair; from `lg` 5 columns for email (`data-count="5"`) and 2 for in-app (`max-w-md`). Widgets span 1 each.
- **Email tiles** (`campaignTiles`): Recipients (count; caption "4,200 of 10,000 sent so far" while any are queued, else "Emails in this campaign"), Delivered (% of recipients), Opened (% of delivered, caption "…delivered, approximate"), Clicked (% of delivered), **Not delivered** (DD, see §13 #7: count = bounced + failed, caption "12 bounced, 50 failed").
- **In-app tiles:** Recipients ("People sent an in-app notice"), Read (% of recipients, "1 of 4 read it"). Below them `rnr-caption`: "In-app campaigns report reads only: an in-app notice has no delivery, open or click tracking."
- **"No data yet" (zero denominator):** the figure uses `rnr-kpi` with `data-empty` so it renders at 16/32 500 `ink-muted` instead of 24/600 (the longer phrase would overflow a five-column tile); the caption keeps the counts ("0 of 0 delivered"). A real zero over a non-zero denominator stays "0%" at full size.
- **Opens note:** always visible, one line under the row (the plan nests it inside the Opened tile, where it would wrap to six lines at a fifth of the width). Not a tooltip.
- **Exclusions line:** `<p class="rnr-caption">` `excludedText` verbatim ("4 people were left out: 2 unsubscribed, 1 had no email address, 1 was listed twice."); absent when nobody was left out.
- Loading: one `Skeleton` 100% × 96. Error: `<p class="rnr-error" role="alert">The numbers did not load. Check your connection and try again.</p>` + secondary `Try again` (the plan has no retry).

### 5.2 Chart (§7) and table alternative

`section.rnr-card gap-3` with `h2.dialog-title` "Opens and clicks over the first 7 days" (in-app: "Reads over the first 7 days"), the chart component, and the note `rnr-caption` "Day 1 is the first 24 hours after sending started."

### 5.3 Completion block (only with a linked workflow)

| State | Spec |
|---|---|
| Sender may see every record | `section.rnr-card gap-3` `h2.dialog-title` {workflow name}; two figures `flex flex-wrap gap-6`: `<p class="label">Started</p><p class="rnr-kpi rnr-num">50%</p><p class="rnr-caption">120 of 240 people</p>` and `Finished`, `33.3%`, `80 of 240 people` (the plan says "members"; an address in an answer is not a member). Zero people: both "No data yet". |
| Remind | `status = sent` and someone has not finished: secondary `Remind non-completers` (`aria-busy`, busy `Creating draft…`). Nobody left: `<p class="rnr-muted">Everyone has finished.</p>` (no disabled button). `sending`: `rnr-caption` "Reminders become available once every email has left the queue." |
| Viewer lacks `records.view_all` | No block; `<p class="rnr-caption">Completion needs permission to see every record of {workflow}. Ask an admin for access.</p>` |
| Not loaded | `rnr-error role="alert"` "The completion numbers did not load. Check your connection and try again." + `Try again` |
| Snapshot not taken yet | Not rendered. |

### 5.4 Follow-up and failure reasons

- `status = sent`: someone is left to open → secondary `Send follow-up to not opened` (in-app: `Send follow-up to not read`). Nobody: `<p class="rnr-muted">Everyone opened it.</p>` / `Everyone read it.`. `sending`: `rnr-caption` "Follow-ups become available once every email has left the queue." Never a disabled button.
- Press: busy `Creating draft…`, creates the draft `Follow-up: {name}` (120 characters max) and navigates to its editor; **the editor's h1 takes focus** (FOCUS_KEY). The draft shows the read-only follow-up audience (§3.2). Failure: `rnr-error role="alert"` under the buttons.
- **Failure reasons (DD):** shown in the recipient table (§5.5), where each failed or bounced email keeps its stored reason, and counted in the Not delivered tile. Rows with `status = failed` and no recorded reason read "No reason was recorded." A new filter **Failed** lists them (§5.5). Spam complaints (`email.complained`) are counted in `campaign_stats.complained` but have no tile and no recipient flag (see §13 #38).

### 5.5 Recipient table (`RecipientTable`)

`section.rnr-card gap-3 aria-labelledby="recipients-h"`: row 1 `flex flex-wrap items-center gap-3`: `h2.dialog-title` "Recipients", secondary `Download CSV` (`ml-auto`, `DownloadIcon`, Phase 5 busy `Preparing CSV…`). Row 2:

```html
<div class="rnr-seg self-start" role="group" aria-label="Show">
  <button type="button" aria-pressed="true">Everyone</button> <button aria-pressed="false">Not opened</button>
  <button aria-pressed="false">Bounced</button> <button aria-pressed="false">Failed</button></div>
```
In-app: `Everyone` / `Not read`. (DD: `Failed` added; the plan has three filters, so the failure reasons the brief asks for have no list. `RecipientFilter` gains `'failed'` = `status = 'failed'`.) Pressing a filter resets to page 1 and **keeps focus on the pressed segment**; the pager text announces the new range.

`<p class="rnr-caption">Saves every recipient as term-starts-2026-10-13.csv, not just the ones shown here.</p>` under the filter row. `<p class="rnr-caption" role="status">Downloaded {filename}.</p>` after success; errors `rnr-error role="alert"`: "The recipient list did not download. Try again." / "The list changed while it downloaded. Try again." (the plan's `Saved …` and `Downloading…` are replaced to match Phase 5).

```html
<div class="rnr-table-card" aria-busy>
 <table class="rnr-table rnr-sticky-first"><caption class="sr-only">Recipients of {name}</caption>
  <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col" class="num">Delivered</th><th scope="col" class="num">Opened</th><th scope="col" class="num">Clicked</th><th scope="col">Reason</th></tr></thead>
  <tbody><tr><th scope="row">ada@example.test</th>
    <td><RecipientStatusMark/></td>
    <td class="num"><When/> | <span class="rnr-muted">Not yet</span></td> … <td class="rnr-problem">{error}</td></tr></tbody></table></div>
```
- **Status marks (grey icon + word, Phase 4 words):** queued `ClockIcon` "Queued" (the plan's "Waiting to send" is a different word for the same state as the Messages page); sent `CheckIcon` "Sent"; failed `XIcon` "Failed"; a row with `bounced_at` `XIcon` "Bounced". Time cells are `class="num"` on `td` and `th` (right-aligned). Error column header "Reason" (the plan's "Error" reads as a code); `.rnr-problem` wraps long text. A queued row with an error adds `rnr-caption` "Will try again automatically."
- In-app: columns `Email`, `Read` (`When` or "Not yet").
- **Pager (Phase 5 pattern, never unmounted):** `<nav class="rnr-pager" aria-label="Recipient pages">` ghost `Previous`, `<span class="rnr-num" aria-live="polite">Showing 51–100 of 4,210</span>`, ghost `Next` (`aria-disabled="true"` at the ends, not removed: the plan's conditional buttons drop focus when Next vanishes on the last page), `<span class="rnr-spin" aria-hidden="true">` while a page loads; previous page stays visible (`aria-busy`). The page clamps to the last page when the total shrinks. 50 a page, no size select.

| State | Spec |
|---|---|
| Loading | `Skeleton` 100% × 160. |
| Filter results empty | `<p class="rnr-muted">` Everyone: "Nobody received this campaign." · Not opened: "Everyone opened it." (in-app "Everyone read it.") · Bounced: "Nothing bounced." · Failed: "No email failed." |
| Error | `rnr-error role="alert"` "The recipients did not load. Check your connection and try again." + secondary `Try again`. |

## 6. Settings: Campaign emails (`#/settings`)

`<CampaignEmails/>` after "Email notifications", `section.rnr-card gap-4` `aria-labelledby="campaign-emails-h"`:

```html
<h2 id="campaign-emails-h" class="dialog-title">Campaign emails</h2>
<p class="rnr-muted">Announcements and reminders that {org} sends to many people at once. Turning this off stops them from {org} only; emails about your own tasks and records still arrive.</p>
<div class="flex flex-col">
  <label class="rnr-check"><input type="checkbox" checked aria-describedby="campaign-emails-c"> <span>Campaign emails from {org}</span></label>
  <p class="rnr-caption rnr-pref-caption" id="campaign-emails-c">Applies to {your address}. Other organisations are not affected.</p>
</div>
<p class="rnr-caption" role="status"></p>  <p class="rnr-error" role="alert"></p>
```
- Checked = you receive them (inverse of the stored opt-out). **Optimistic** (Phase 4 §2): flip at once, roll back on error or 0 rows, the checkbox keeps focus; the plan waits for the server and ignores quick toggles. Status line on success: `Campaign emails from {org} turned on.` / `…off.`. Failure: `That setting was not saved. Try again.` (`SAVE_FAILED`).
- The intro paragraph replaces the plan's caption-only explanation, so the section reads on its own.
- Loading `Skeleton` one 260px row. Error: `This setting did not load. Check your connection and try again.` + `Try again`. **No member email** (`my_member_email` null, DD): `<p class="rnr-muted">{org} has no email address for you, so it cannot send you campaign emails.</p>` (the plan renders nothing).
- A person unsubscribed by a spam complaint sees the box unticked like any opt-out and can tick it again (same row); no extra copy.

## 6.0 Public unsubscribe pages (`unsubscribe` Edge Function)

**Hosting risk (flag before building, unverified offline):** Supabase serves Edge Function HTML responses on the default `*.supabase.co` domain as `text/plain` with a restrictive CSP, so these pages may show as source text hosted. Locally (`functions serve`) they render. Before Task 6 is called done, verify on the hosted project; if it fails, serve the same HTML from a custom domain for functions, or from the app's own origin (a static page that POSTs to the function). The copy and markup below are unchanged either way.

**Constraints:** no app chrome, no nav, no wordmark tile, no script, no third-party requests (the CSP is `default-src 'none'`; Inter is not loaded, the page uses the system font stack). The CSP must allow the inline stylesheet: `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` (the plan's CSP blocks all CSS, leaving an unstyled Times page). No "we". Every page is a full document.

```html
<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">
<title>Unsubscribe from Alpha School campaign emails</title>
<style>
 :root{--bg:#fafafa;--card:#fff;--ink:#18181b;--muted:#71717a;--line:#e4e4e7;--btn:#18181b;--btn-ink:#fff}
 @media (prefers-color-scheme:dark){:root{--bg:#09090b;--card:#18181b;--ink:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--btn:#fff;--btn-ink:#18181b}}
 *{box-sizing:border-box}
 body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1rem;background:var(--bg);color:var(--ink);font:400 14px/20px Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
 main{width:100%;max-width:28rem;padding:1.5rem;background:var(--card);border:1px solid var(--line);border-radius:16px}
 h1{margin:0 0 .75rem;font-size:20px;line-height:28px;font-weight:600}
 p{margin:0 0 1rem}.note{color:var(--muted);font-size:12px;line-height:16px;margin:1rem 0 0}
 button{min-height:44px;padding:0 1rem;border:0;border-radius:8px;background:var(--btn);color:var(--btn-ink);font:500 14px/20px inherit;cursor:pointer}
 button:focus-visible{outline:2px solid var(--btn);outline-offset:2px}
</style></head>
<body><main>
 <h1>Unsubscribe from Alpha School campaign emails</h1>
 <p>Stop receiving campaign emails from Alpha School? Emails about your own tasks and records still arrive.</p>
 <form method="post"><button type="submit">Unsubscribe</button></form>
 <p class="note">Campaign emails are sent through ReportNoReport.</p>
</main></body></html>
```
(`--ink` on `--bg` 17:1; `--muted` on `--card` 4.8:1 light, 7.4:1 dark; button text on `--btn` 17:1. The hex values are the light/dark `tokens.css` values; B&W and presets do not apply to a page with no session. Only `{org}` (HTML-escaped) varies.)

| Page | Status | `<title>` / `h1` | Body |
|---|---|---|---|
| Confirm (GET, not opted out) | 200 | Unsubscribe from {org} campaign emails | Stop receiving campaign emails from {org}? Emails about your own tasks and records still arrive. + `Unsubscribe` button (the only control) |
| Done (POST) | 200 | You are unsubscribed | You are unsubscribed from {org} campaign emails. Emails about your own tasks and records still arrive. If you have a ReportNoReport account, you can turn campaign emails back on in Settings. |
| Already (GET, opted out) | 200 | You are already unsubscribed | You are already unsubscribed from {org} campaign emails. |
| Invalid link | 400 | This link is not valid | The unsubscribe link is incomplete. Copy the whole link from the email and try again. |
| Unknown message | 404 | This link no longer works | Ask the person who sent the email to remove you from their list. |
| Wrong method | 405 | This page is not available | Open the unsubscribe link from the email. |
| Server error | 500 | Try again later | Your request did not go through. Try the link again in a minute. |

- The page never shows an email address (QA test pins it). The `<title>` repeats the `h1` so the tab and the screen reader agree; the plan's titles ("Unsubscribe", "Unsubscribed") say nothing about which organisation.
- **No focus management or live regions needed** (a full page load per step); the `h1` is the first thing read; `lang="en-GB"`. The button is a real `<button type="submit">` ≥ 44px, keyboard and Enter work, nothing is hover-only.
- The 500 body is a full document (the plan's is a bare `<title><p>`); it uses the same template and never prints the error.

## 6.1 Email footer (`withFooter`, Task 2)

HTML (after the message, one `<hr>`):
```html
<hr>
<p style="font-size:12px;line-height:16px;color:#71717a">You receive this because {org} sent it to you through ReportNoReport. <a href="{url}" style="color:#71717a">Unsubscribe from {org} campaign emails</a>.</p>
```
Text: `--` then `You receive this because {org} sent it to you through ReportNoReport.` and `Unsubscribe from {org} campaign emails: {url}`. The sentence is unchanged from the plan; the only change is the inline style (email clients ignore stylesheets; the "no inline styles" rule is for the app, not for mail). `#71717a` on white is 4.8:1 and the link stays underlined by default. No "we", no address in the URL.

## 7. Chart: opens and clicks over the first 7 days

Hand-rolled SVG, reusing Phase 5 §7 (`rnr-chart*`, measured width, `chartHeight`, `MIN_CHART_WIDTH` 240, tooltip group, table-first keyboard path).

### 7.1 Series and B&W

| Series | Token | Stroke | Marker | Legend |
|---|---|---|---|---|
| Opens (series 1) | `--in` | solid 2px | circle r 4, 2px `surface-100` ring | `Opens` |
| Clicks (series 2) | `--out` | dashed `6 4` 2px | square 8 × 8, same ring | `Clicks` |

Colour never carries the difference alone: dash + marker shape + the text legend + the table. **Black & White:** `--in` is black (white in dark), `--out` is mid-grey (#6b6b6b / #a3a3a3); README's `out` hatch has no meaning for a line, so the dash and the square marker are the B&W cue (as the plan states). Every number (tick labels, tooltip, table) uses `rnr-num`. Gridlines `--chart-grid`, zero line `--ink-muted` (`rnr-chart-grid`, `rnr-chart-zero`).

### 7.2 Anatomy (`<svg class="rnr-chart" viewBox="0 0 {W} {H}" role="img" aria-labelledby>`)

| Part | Spec |
|---|---|
| Size | `W` measured width of the card body (ResizeObserver), `H = chartHeight(W)` (200, 160 under 320). The plan's fixed 200 ignores the narrow case. |
| Left margin | Grows to fit the widest tick label (digits × 6.5 + 12), minimum 40 (the plan's fixed 40 clips "10,000"). |
| X labels | The numerals `1`…`7`, centred on each point; the caption below the chart says "Day 1 is the first 24 hours after sending started." (DD: seven "Day n" labels touch at 240–330px.) The table uses "Day 1" … "Day 7". |
| Y axis | `niceTicks`, zero baseline, starts at 0, `.rnr-chart-axis rnr-num`. |
| Hit areas | One transparent full-column `<rect class="rnr-chart-hit">` per day. |
| Tooltip (DD, Phase 5 §7.3) | `<g class="rnr-chart-tip" aria-hidden="true">` shown on pointer enter/move and tap over a day: lines `Day 3`, `Opens 40`, `Clicks 12`. The plan's per-point `<title>` children appear after a long hover only and never on touch/keyboard. |
| Hover dim | Hovering a series' line, dots or legend item sets `data-active` on the chart; the other series fall to `opacity-dim`. Only under `data-motion="full"` and `(hover: hover)`; flat motion shows the tooltip and an outline on the active mark. |
| Summary | `<title>`: `dailySummary` ("Opens and clicks over the first 7 days: 12 opens and 1 click, most opens on day 2."). In-app: "Reads over the first 7 days: 3 reads, most on day 1." |

### 7.3 Toggle, narrow, empty

- `<button type="button" class="rnr-btn rnr-btn-ghost" aria-pressed="false">Show as table</button>` (constant label, `aria-pressed` carries the state; Phase 5 #51), **before the SVG in the DOM**. Pressed swaps the SVG for `<table class="rnr-table rnr-table-bare">` with caption = summary, `th scope="col"` Day, `th.num` Opens, `th.num` Clicks, `th scope="row"` "Day 1"… (in-app: Day, Reads). Focus stays on the button.
- Under 240px the table shows automatically and the toggle is replaced by `rnr-caption` "Too narrow for a chart, so this is shown as a table."
- **Legend** above the chart: `<ul class="rnr-chart-legend" aria-label="Series">` each item an inline SVG swatch (line + the marker) plus the word. **In-app: a single series "Reads"** (no Clicks; the plan reuses the two-series chart and the summary says "opens and clicks").
- **Empty (DD):** when opens + clicks = 0 the card shows `<p class="rnr-muted">Nothing has been opened or clicked yet. Opens and clicks appear here as people read the email.</p>` (in-app: "Nothing has been read yet.") and no chart or toggle; once the 7 days have passed: "Nothing was opened or clicked in the first 7 days." The plan draws seven flat lines on the baseline.
- Loading `Skeleton` 100% × 200; error `rnr-error role="alert"` "The chart did not load. Check your connection and try again." + `Try again`.

## 8. Mobile (375px) and touch

- Nav wraps (eleven items). No page-level horizontal scroll anywhere.
- **List:** the table scrolls inside its card, first column (Name) sticky below `sm` (`rnr-sticky-first`). Actions stay reachable at the right of the scroller.
- **Editor:** single column; cards stack; segmented controls wrap to full width (`self-start` still, `flex-wrap`); the action row wraps; `Delete draft` drops to its own row. `datetime-local` uses the native picker. The review dialog keeps the 1rem gutter; `.rnr-review` stacks `dt` over `dd` below `sm` and the dialog scrolls inside itself.
- **Report:** tiles stack (one column), figures stay 24px; the chart width is the measured card width (≈ 303px), text stays 11px; below 240px the table replaces it. The recipients table scrolls inside its card with the email column sticky; the pager wraps; `Download CSV` wraps below the heading. Completion figures wrap (`flex-wrap`).
- **Unsubscribe pages:** one column, 1rem gutter, button full-height 44px; no horizontal scroll at 320px.
- Touch: every icon-only control has an `aria-label`; `rnr-btn`, `rnr-input`, `rnr-check`, `rnr-seg button`, `rnr-menu-item` reach 44px under `(pointer: coarse)` (already in `src/index.css`).

## 9. Copy table (every new or changed string)

| Where | String |
|---|---|
| Nav | Campaigns |
| Status words | Draft · Scheduled · Sending · Sent · Not sent |
| List | `Campaigns` · `New campaign` · `Send your first campaign` · `Email a role or the people in a report, schedule it, and see who opened it and who finished the workflow.` · columns `Name` `Status` `Date` `Delivered` `Opened` `Clicked` · `Not scheduled` · `Not sent yet` · `Not tracked` · `{n}% read` · `Not loaded` · `Open {name}` · `Delete {name}` · `Showing the newest 200 of {n} campaigns.` · `The campaigns did not load. Check your connection and try again.` · `Try again` · `The numbers did not load. Reload the page to try again.` |
| New / delete | `New campaign` · `Name` · `Cancel` · `Create campaign` / `Creating…` · `Enter a name for the campaign.` · `Delete {name}?` · `{name} is a draft and will be deleted for everyone. It cannot be recovered.` · `Delete draft` / `Deleting…` · `{name} deleted.` · `This campaign is no longer a draft, or it was already deleted. The list now shows the latest.` |
| Editor | `Back to campaigns` · `Unsaved changes` · `Message` · `Name` · `Message template` · `Choose a template` · `Email` / `In-app` (groups) · `There are no message templates yet.` · `Go to templates` · `Ask someone who manages templates to create one.` · warning (`campaignTemplateIssue`) · `Sent as an email. Each person also gets the unsubscribe link in the footer.` · `Sent as an in-app notice. It shows in the bell and cannot be muted. People without an account are left out.` · `Audience` · `Who receives it` · `A role` · `A report` · `Role` · `Choose a role` · `There are no roles yet.` · `Report` · `Choose a report` · `{name} (grouped, lists groups not people)` · `Grouped reports list groups, not people, so they cannot be used.` · `There are no saved reports yet.` · `Send to` · `The person who started each record` · `The address in {label}` · `A started-by recipient must be an active member. An address in an answer can belong to someone without an account.` · `This workflow has no short-text answer that could hold an address.` · `People from {campaign} who did not open it.` / `…who have not finished {workflow}.` · size texts (§3.2) · `The list is taken when sending starts. People who unsubscribed, have no email address or are listed twice are left out, and the report counts them.` · `Each record gives one recipient. Records without a usable address are left out.` · `Completion tracking` · `Linked workflow (optional)` · `None` · `The report then shows how many recipients started and finished it, and can remind the ones who have not.` · `When to send` · `Send now` · `Send later` · `Send at` · `Your time zone: {zone} ({offset}). Sending can start up to a minute after this time.` · `Save draft` / `Saving…` / `Saved` · `Draft saved.` · `Delete draft` · validation sentences (§3.5) · `This campaign was changed by someone else. Reload to see the latest version, then make your change again.` · `Reload campaign` · `Leave without saving?` · `Your changes to {name} will be lost.` · `Leave` · `Schedule` / `Scheduling…` · `Sending…` · `Campaign scheduled.` · `Sending started.` |
| Review dialog | `Send {name} now?` · `Schedule {name}?` · `Template` · `Audience` · `People` · `Workflow` · `When` · `Now` · `Role: {role}` · `Report: {report}, to the person who started each record` · `Report: {report}, to the address in {label}` · `Follow-up: people who did not open {campaign}` · `People who unsubscribed or have no email address are left out, and the report counts them. You cannot cancel it once sending starts.` · `People who unsubscribed or have no email address are left out, and the report counts them. You can cancel until sending starts.` · `People without an account are left out, and the report counts them. …` (in-app) |
| Scheduled / failed | `Scheduled for {when}` · `Scheduled by {name}` · `It cannot be edited until the schedule is cancelled. You can cancel until sending starts.` · `Cancel schedule` · `Cancel the schedule for {name}?` · `{name} goes back to a draft and nothing is sent. You can schedule it again.` · `Keep schedule` · `Cancelling…` · `Schedule cancelled.` · `This campaign was not sent` · stored reason · `Nothing was sent. Edit the campaign, then schedule it again.` · `Edit and schedule again` · `Opening…` |
| Report | `Sent by {name}. Sending started {when}. Finished {when}.` · `{name} has finished sending.` · `Results` · tiles (`Recipients` `Delivered` `Opened` `Clicked` `Not delivered` `Read`) · `Emails in this campaign` · `{n} of {m} sent so far` · `{n} of {m}` · `{n} of {m} delivered, approximate` · `{n} of {m} delivered` · `{b} bounced, {f} failed` · `People sent an in-app notice` · `{n} of {m} read it` · `No data yet` · `Opens are approximate: Apple Mail Privacy Protection opens emails automatically.` · `In-app campaigns report reads only: an in-app notice has no delivery, open or click tracking.` · `excludedText` · `The numbers did not load. Check your connection and try again.` |
| Chart | `Opens and clicks over the first 7 days` · `Reads over the first 7 days` · `Day 1 is the first 24 hours after sending started.` · `Opens` · `Clicks` · `Reads` · `Series` · `Show as table` · `Day` · `Day {n}` · `Too narrow for a chart, so this is shown as a table.` · `Nothing has been opened or clicked yet. Opens and clicks appear here as people read the email.` · `Nothing has been read yet.` · `Nothing was opened or clicked in the first 7 days.` · `The chart did not load. Check your connection and try again.` |
| Completion / follow-up | `Started` · `Finished` · `{n} of {m} people` · `Remind non-completers` · `Creating draft…` · `Everyone has finished.` · `Reminders become available once every email has left the queue.` · `Completion needs permission to see every record of {workflow}. Ask an admin for access.` · `The completion numbers did not load. Check your connection and try again.` · `Send follow-up to not opened` · `Send follow-up to not read` · `Everyone opened it.` · `Everyone read it.` · `Follow-ups become available once every email has left the queue.` · `Follow-up: {name}` |
| Recipients | `Recipients` · `Show` · `Everyone` · `Not opened` · `Not read` · `Bounced` · `Failed` · `Download CSV` / `Preparing CSV…` · `Saves every recipient as {filename}, not just the ones shown here.` · `Downloaded {filename}.` · `The recipient list did not download. Try again.` · `The list changed while it downloaded. Try again.` · columns `Email` `Status` `Delivered` `Opened` `Clicked` `Reason` `Read` · `Queued` · `Sent` · `Failed` · `Bounced` · `Not yet` · `No reason was recorded.` · `Will try again automatically.` · `Recipient pages` · `Previous` · `Next` · `Showing {a}–{b} of {n}` · `Nobody received this campaign.` · `Nothing bounced.` · `No email failed.` · `The recipients did not load. Check your connection and try again.` |
| Settings | `Campaign emails` · `Announcements and reminders that {org} sends to many people at once. Turning this off stops them from {org} only; emails about your own tasks and records still arrive.` · `Campaign emails from {org}` · `Applies to {address}. Other organisations are not affected.` · `Campaign emails from {org} turned on.` / `…off.` · `That setting was not saved. Try again.` · `This setting did not load. Check your connection and try again.` · `{org} has no email address for you, so it cannot send you campaign emails.` |
| Unsubscribe pages | §6.0 table · button `Unsubscribe` · `Campaign emails are sent through ReportNoReport.` |
| Email footer | §6.1 |
| Server messages mapped (`friendlyError`) | unchanged from Task 8 (seven sentences); client validation uses the same sentences |

## 10. Accessibility summary

| Area | Rule |
|---|---|
| Focus after actions | Delete draft (list) → list h1. Delete (editor) → list h1. Send now / Schedule confirmed → h1 of the new state (`onMoved`). Cancel schedule → h1. Edit and schedule again → h1. Follow-up / Remind → the new draft's h1. Save draft → stays on Save draft. Filter segment → stays on the pressed segment. Pager press → stays (buttons are never unmounted). Send dialog opens with Cancel focused; closing returns focus to the send action. Download CSV → stays. |
| Live regions | One status line per page (`role="status"`, 5 s); the editor's single audience-size region (`aria-live="polite"`); the template warning region; the pager's range text; the sr-only "finished sending" transition. Alerts only for failures. Polled figures (10 s) never announce. |
| Keyboard | Every control is native (`button`, `a`, `select`, `input`, `dialog`). Filters and the audience/when segmented controls are `aria-pressed` buttons in tab order; the chart marks are not tab stops, the table alternative is one button away and before the SVG; Esc closes every dialog and returns focus; Enter in the name field submits Save draft. |
| Names | Repeated controls carry the object (`Open {name}`, `Delete {name}`); the status always has a word; no tooltip is the only carrier of a value; `Show as table` keeps one label with `aria-pressed`. |
| Forms | Visible labels (incl. Send at, Role, Report, Send to), `aria-invalid` + `aria-describedby` on errors, focus to the first invalid control on a failed send, never `disabled` on submit, `aria-busy` + `rnr-spin` while working, `aria-disabled` (styled) on unavailable pager buttons. |
| Colour | Status = icon + word; series = dash + marker shape + text legend + table; `danger` only on errors and danger buttons; B&W adds no new rule. Contrast: `ink-muted` captions 4.8:1 on `surface-100`. |
| Tables | Caption (sr-only), `th scope`, email as `th scope="row"`, right-aligned numeric headers and cells, sticky first column below `sm`. |
| Targets | 44px on coarse pointers; icons 14 to 20px. |
| 375px | No page-level horizontal scroll; tables and the pager scroll or wrap inside their card; chart text stays 11px. |
| Motion | `rnr-spin`, `rnr-pop`, series dimming (full motion only, `(hover: hover)` only). `flat` and `prefers-reduced-motion` need nothing beyond the tokens (`--rnr-t`). |
| Public pages | Real headings, `lang`, native button, `color-scheme` meta, no script, text over 4.5:1 in both schemes; link-scanner-safe (GET changes nothing). |

## 11. DD summary (where the system or the plan was silent)

Status as grey icon + word (not a chip), `RightIcon` for Sending, "Not sent" for failed · channel words Email / In-app notice · list Date column, one "Not sent yet" cell, "Not tracked" for in-app · `N` shortcut · four-card editor, one send action, Send now / Send later segmented control, review dialog with dl, Cancel focused, primary confirm · `dismissLabel` on `ConfirmDialog` · zone in the hint with offset · audience size line plus persistent exclusion caption · 10,000 shown in the editor · grouped reports listed but disabled · Send to hint · "A report" hidden without report permission · linked-workflow error on the select · scheduled summary `dl` and "Scheduled by" · failed card with "Nothing was sent" · header "Sent by" · tiles as a `ul` of Widget cards, 3 + 2 on `sm`, note under the row, "No data yet" at a smaller size, Not delivered tile · completion in "people" · follow-ups are secondary, create drafts, no confirm · Failed filter and "Reason" column · pager never unmounted · Phase 4 recipient words · chart: dash + square markers, numeral x labels, measured width, growing left margin, SVG tooltip, empty state, single-series in-app · optimistic opt-out toggle, intro paragraph, no-address state · unsubscribe CSP and inline stylesheet, titles that name the organisation · footer inline style.

## 12. `src/index.css` additions (tokens only)

Already present and reused: `rnr-table-card`, `rnr-sticky-first`, `rnr-caption`, `rnr-check`, `rnr-fieldset-label`, `rnr-pref-caption`, `rnr-problem`, `rnr-pager`, `.rnr-btn[aria-disabled]`, `.rnr-btn-ghost[aria-pressed]`, `.rnr-table tbody th[scope="row"]`, the Phase 5 `rnr-chart*` classes and their hover-dim rule, `.rnr-chart-bar, .rnr-chart-dot { transition }`.

```css
/* Phase 6: campaigns (design/phase-6-screens.md §12). */
.rnr-campaign-tiles { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); margin: 0; padding: 0; list-style: none; }
.rnr-campaign-tiles > li { min-width: 0; }
.rnr-campaign-tiles .rnr-card-head { margin-bottom: var(--space-2); }                                   /* tighter than a dashboard widget */
@media (min-width: 640px) {
  .rnr-campaign-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rnr-campaign-tiles[data-count="5"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 1024px) { .rnr-campaign-tiles[data-count="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
.rnr-campaign-tiles[data-count="2"] { max-width: 28rem; }
.rnr-kpi[data-empty] { font-size: 16px; font-weight: 500; letter-spacing: 0; color: var(--ink-muted); } /* "No data yet": same 32px line, so tiles stay level */

/* Review list (send dialog, scheduled summary). */
.rnr-review { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--space-2) var(--space-4); margin: 0; }
.rnr-review dt { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--ink-muted); padding-top: 2px; }
.rnr-review dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 639px) { .rnr-review { grid-template-columns: minmax(0, 1fr); gap: 0; } .rnr-review dd { margin-bottom: var(--space-2); } }

/* Template warning: a caution, so heavier than a muted hint but not an error. */
.rnr-field > .rnr-hint.rnr-hint-warn { color: var(--ink-label); font-weight: 500; }

/* Chart: second series and legend (single --in series is the Phase 5 default). */
.rnr-chart-line[data-series="out"] { stroke: var(--out); stroke-dasharray: 6 4; }
.rnr-chart-dot[data-series="out"] { fill: var(--out); }
.rnr-chart-legend { display: flex; flex-wrap: wrap; gap: var(--space-4); margin: 0; padding: 0; list-style: none; font-size: 12px; line-height: 16px; color: var(--ink-label); }
.rnr-chart-legend li { display: flex; align-items: center; gap: var(--space-2); }
.rnr-chart-legend .rnr-chart-dot { stroke-width: 1; }
.rnr-chart-line { transition: opacity var(--rnr-t); }
@media (hover: hover) {
  [data-motion="full"] .rnr-chart[data-active="in"] [data-series="out"],
  [data-motion="full"] .rnr-chart[data-active="out"] [data-series="in"] { opacity: var(--opacity-dim); }
}
```
Notes: all colours are `in`, `out`, `ink`, `ink-label`, `ink-muted`, `surface-100`, `chart-grid`, `focus-ring`. No inline `style` anywhere in the app (tooltip and SVG geometry are attributes); the only inline styles in this phase are the email footer's (mail clients) and the public page's `<style>` (a separate document with no app CSS). The plan's rules `@media (prefers-reduced-motion: no-preference) { … 120ms ease-out }` (a literal duration) and the unguarded dimming rule are dropped for the guarded ones above.

## 13. Conflicts with Tasks 2, 6, 8 and 9 and the corrections

| # | Plan code | Problem | Correction |
|---|---|---|---|
| 1 | T8 list and T9 header: `<span class="rnr-chip">{status}</span>` | README: status is a grey icon + word; `rnr-chip` is blue and used for "System"-type marks only | `CampaignStatusMark` with `rnr-status` (§1); remove chips |
| 2 | T6 pages: no CSS, CSP `default-src 'none'` | A Times-font page with no layout; the CSP would also block any inline stylesheet | Add the inline `<style>` and `style-src 'unsafe-inline'` (§6.0); full documents for every status |
| 3 | T6 hosting: HTML from an Edge Function | On the default `*.supabase.co` domain, HTML may be served as `text/plain` (unverified here) | Verify on a hosted project before Task 6 is done; fall back to a custom domain or an app-hosted page (§6.0) |
| 4 | T6 titles "Unsubscribe", "Unsubscribed", "This link has expired", 404 copy "Reply to the email…" | Titles do not name the organisation; replying to a no-reply campaign email may reach nobody | Titles and bodies per §6.0 table; 404 says "Ask the person who sent the email to remove you from their list." |
| 5 | T6 done page | Dead end for someone with an account | Add "If you have a ReportNoReport account, you can turn campaign emails back on in Settings." |
| 6 | T6 500 page: bare `<title><p>` with no `lang`/viewport/`h1` | Not a document; unstyled | Same template as the others (§6.0) |
| 7 | T2 `campaignTiles` fifth tile value `"12 · 50"` (label "Bounced and failed") | Two numbers in one KPI read as one figure to a screen reader | Label `Not delivered`, value bounced + failed (`62`), caption `12 bounced, 50 failed`; update the tile tests |
| 8 | T9 OPENS_NOTE rendered inside the Opened tile | Wraps to ~6 lines at a fifth of the width; breaks tile alignment | Note under the row with `id="opens-note"`, `aria-describedby` on the tile (§5.1) |
| 9 | T9 tiles: five `h2.label` + `div.rnr-card` | Five headings in the outline; not the Widget head/title | `ul.rnr-campaign-tiles` of `li.rnr-card` with `rnr-card-head`/`rnr-card-title`, one sr-only `h2` |
| 10 | T9 tile grid 1 / 2 (`sm`) / 5 (`lg`) | Five tiles at two columns leaves an orphan | 3 columns at `sm` for five tiles (§5.1) |
| 11 | T9/T2 `"No data yet"` in a 24px `rnr-kpi` | Overflows a five-column tile and looks like a data value | `data-empty` smaller muted figure (§12) |
| 12 | T8 list `{inApp ? 'In-app' : pctText(...)}`; draft rows print "No data yet" ×3; header "Sent or scheduled" | "In-app" is a channel not a value; three "No data yet" for a draft; header wrong for drafts/failed | `Not tracked`, one colspan "Not sent yet" cell, header "Date" (§2) |
| 13 | T8 list: no `N` shortcut | Phase 5 gave New report an `N` shortcut | Add `<kbd>N</kbd>` and handler (§2) |
| 14 | T8 stats error leaves "No data yet" in cells | Claims no data when the load failed | "Not loaded" plus an alert line (§2) |
| 15 | T8 `NewCampaignDialog` delete sentence "…already deleted or has been scheduled. Reload to see the latest list." | Unactionable; row stays stale | Reworded and refetch (§2) |
| 16 | T8/T9 back link text "Campaigns" | Phase 5: "Back to …" | "Back to campaigns" |
| 17 | T8 editor: one card, Save in the middle, Delete beside Save, "Send" fieldset after | Main action buried; destructive next to Save | Four cards, action row with Save draft, the one primary, Delete draft (§3) |
| 18 | T8 audience `rnr-seg role="radiogroup"` with plain buttons; T9 filter `radiogroup` | No roving tabindex or arrow keys (Phase 3 #31, Phase 5 #38) | `role="group"` + `aria-pressed` |
| 19 | T8 two buttons "Schedule" and "Send now" with the date input always visible | Date input beside "Send now" reads as part of it; two sends | `Send now` / `Send later` segmented control, one primary send action, input only for later (§3.4–3.5) |
| 20 | T8 Schedule runs immediately; Send now uses `ConfirmDialog` whose body is only the size line and whose confirm button is `rnr-btn-danger` | No review of what is sent; mail is not a destructive action; Schedule has no confirmation | `SendDialog` with the review `dl`, primary confirm, Cancel focused, for both Now and Later (§3.8) |
| 21 | T8 zone printed as raw IANA id in the label ("Send at (Asia/Kuala_Lumpur)") | Underscores, no offset | Hint "Your time zone: Asia/Kuala Lumpur (GMT+8)…" (§3.4) |
| 22 | T8 no client validation; errors only from the server; 10,000 cap unseen until a failed send | Late, unfocused errors; the cap is discovered after sending | Validate on press, focus first problem; show the over-10,000 sentence in the editor (§3.2, §3.5) |
| 23 | T8 report option label `(grouped reports cannot choose recipients)` | Long, reads as an instruction | `{name} (grouped, lists groups not people)` plus caption (§3.2) |
| 24 | T8 `SendToFields` option `The address in “{label}”` (curly quotes) | Quotation marks not used in labels | `The address in {label}` |
| 25 | T8 "A report" shown to every sender | Without `reports.view`/`reports.manage` the campaign fails at send | Hide it for such senders (§3.2) |
| 26 | T8 no empty states for templates, roles, reports | Blank selects | Per-select empty text with a link where permitted |
| 27 | T8 template warning is a muted `rnr-hint` | Easy to miss; not announced on change | `rnr-hint-warn`, `aria-live="polite"`, always mounted (§3.1) |
| 28 | T8 `ConfirmDialog` for Cancel schedule: buttons "Cancel" and "Cancel schedule" | Ambiguous aloud | `dismissLabel="Keep schedule"` prop (§4) |
| 29 | T8 leave guard confirm label "Leave without saving" and body "…this campaign…" | Repeats the title; Phase 5 pattern is `Leave` and `{name}` | `Leave`; `Your changes to {name} will be lost.` |
| 30 | T8 failed card: reason only | No statement of what happened to the mail | Heading + reason + "Nothing was sent. Edit the campaign, then schedule it again." (§4) |
| 31 | T8 scheduled card: one sentence | No summary of what is scheduled or by whom | Summary `dl` and "Scheduled by" (§4) |
| 32 | T8 `Settings` waits for the server and ignores quick toggles; renders nothing without an address | Phase 4 toggles are optimistic; a blank section looks broken | Optimistic toggle, intro paragraph, no-address sentence (§6) |
| 33 | T9 header: started/finished only | The brief asks who sent it | `Sent by {name}` via `useMemberEmails` (§5) |
| 34 | T9 `CampaignChart` reused for in-app with the same two series and text | In-app clicks are always 0; summary says "opens and clicks" | Single "Reads" series and summary for in-app (§7) |
| 35 | T9 chart: fixed `HEIGHT = 200`; `LEFT = 40`; "Day n" labels; per-point `<title>` tooltips; unguarded dimming; literal 120ms transition; always draws flat lines when empty | Text clipped/overlapping at 240–330px; titles never show on touch/keyboard; dimming ignores motion mode | `chartHeight(W)`, left grows with tick width, numeral labels, SVG tooltip group, guarded dim rules, empty message (§7, §12) |
| 36 | T9 legend swatch is a line only | Series differ by colour in the legend | Swatch includes the circle/square marker (§7.1) |
| 37 | T9 recipient table: "Waiting to send" (`RECIPIENT_STATUS`), plain status text, "Error" header, time cells left-aligned, no Failed filter | Different word from the Messages page; status not icon + word; no failure list | Phase 4 words (`Queued`, `Sent`, `Failed`, `Bounced`) with icons, "Reason", `.num` times, `Failed` filter; update `RECIPIENT_STATUS` and the CSV status text (§5.5) |
| 38 | T9/T2 spam complaints counted in `campaign_stats.complained` but shown nowhere | A fact the person cannot see | Optional: append ", {n} marked as spam" to the Not delivered caption; no recipient flag (`RecipientRow` has no complained time) |
| 39 | T9 pager: Previous/Next rendered only when valid; no range clamp; page text not live | Focus drops when a button unmounts; stale page after a shrink | Phase 5 pager: always mounted with `aria-disabled`, clamp, polite range, spinner (§5.5) |
| 40 | T9 download: `Downloading…`, `Saved {filename}.`, no filename caption | Differs from Phase 5 | `Preparing CSV…`, `Downloaded {filename}.`, caption "Saves every recipient as …, not just the ones shown here." |
| 41 | T9 stats/chart errors say "Reload the page to try again." with no button | Phase 5 gives Try again | Secondary `Try again` on every load error |
| 42 | T9 completion captions "of N members" | An address in an answer is not a member | "of N people" |
| 43 | T9 `sending` state: one caption for follow-ups only | Remind non-completers has no sending-state text | One caption each (§5.3, §5.4) |
| 44 | T9 no transition announcement when sending finishes | Live numbers change silently | Sr-only status "{name} has finished sending." (§5) |
| 45 | T2 `withFooter` unstyled `<p>` | Footer reads as body text | Inline 12px `#71717a` (§6.1) |
| 46 | Phase 4 Messages page (`comms.manage`) lists every `messages` row | A 10,000-person campaign adds 10,000 rows to it | Not a visual change; flagged: Task 8 should check that page pages its query (Phase 4 uses a limit) and that the "Messages" filters still read sensibly |
| 47 | T2 `RECIPIENT_STATUS` "Waiting to send" also used in the CSV | The file and the screen should agree | Use "Queued" in both |

Count: 47 differences. The ones that change behaviour or tests: #3, #7, #20, #34, #37 (and the optional #38). Everything else is markup, copy or CSS.
