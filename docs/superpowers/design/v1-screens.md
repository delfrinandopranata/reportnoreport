# v1 screens on "Paper that moves"

Per-screen class lists for the v1 migration (`docs/superpowers/plans/2026-10-12-v1-paper-that-moves.md`). The system is `v2/design/README.md`; new components: LedgerTable, MoneyInput, StatementPaper, Banner, AdminTable, Coachmark, Checklist, DropZone (each has a README and preview under `v2/design/components/`). Copy is unchanged unless stated. Money: ISO code, true minus, `rnr-amt` / `.num`. Every screen: skip link first, focus returns to the trigger when a dialog or drawer closes, 44px targets on coarse pointers, no page-level horizontal scroll at 375px (wide tables scroll inside `rnr-table-card`).

## Rules shared by every screen
- Page frame: `rnr-page` > `rnr-wide` for ledgers; `rnr-page-head` with the display title; one `rnr-btn-primary` per view.
- Dialogs: native `<dialog class="rnr-dialog">`; confirm dialogs name the object and the verb. Destructive: `rnr-btn-danger`.
- Status: `rnr-status` (icon + word). Chips: `rnr-chip`, radius 6, no pills.
- Receipts `data-series="in"` with arrow-down-left; payments `data-series="out"` hatched with arrow-up-right.
- Dark and all eight accents come from tokens; never hex, never `dark:`.

## Screens
| Screen | Classes and components | Focus order and 375px |
|---|---|---|
| Sign in / sign up / forgot / set password | wordmark, `rnr-paper` card, `rnr-field`, `rnr-input`, `rnr-btn-primary`, `rnr-note[data-tone=down]` | email, password (show/hide), submit, links; single column |
| Loading / no firm / suspended / error | `rnr-paper`, `rnr-empty`, `rnr-spin` | message, action; centred |
| Shell | `rnr-side-*` in a folder, wordmark, `rnr-menu`, `rnr-avatar`; phone: top bar + `rnr-phonebar` (Dashboard, Clients, Contracts, Menu) + drawer dialog | skip link, nav, main; sidebar becomes the drawer < 768px |
| Trial and sample-data banners | Banner (`rnr-note rnr-note--bar`, tones info / warn / down) | above the page, after the skip link; wraps, actions below the sentence |
| Checklist | Checklist inside `rnr-folder`; `rnr-progress` | items in order; full width |
| Tour | Coachmark (`rnr-coach`, `data-arrow`, `--coach-top/left` only inline) | popover takes focus; Esc ends; docks as a bottom card < 640px |
| Dashboard | `rnr-grid`, `rnr-widget`, `rnr-handle` (`dots-six-vertical`), `rnr-drop`, `rnr-drag-overlay`, `rnr-menu` | add-widget menu, widgets in grid order; one column |
| Widgets | `rnr-kpi-tile`, `rnr-kpi-figure`, Charts (series tokens, hatch, square marks), `rnr-kind`, `rnr-skeleton`, MoneyInput | tile titles are headings |
| Clients (balances and transactions) | `rnr-page-head`, `rnr-seg`, `rnr-input`, LedgerTable inside `rnr-table-card rnr-wide`, `rnr-pager` | period, filters, table; first column sticky |
| Customisable table | LedgerTable header states (`aria-sort`, `rnr-ledger-resize`), `rnr-dialog`, `rnr-choice` | handles are buttons with arrow-key resize |
| Clients on phones | `rnr-card` row cards, `rnr-amt` figure | card is one link |
| Record / edit transaction | `rnr-dialog`, MoneyInput, `rnr-field`, `rnr-seg` (Receipt / Payment) | type, amount, date, description, save |
| Add / edit client, details | `rnr-dialog`, `rnr-field`, `rnr-chip` tags, `rnr-status` | name first |
| Client profile | `rnr-crumb`, `rnr-page-head`, `rnr-tabs`, `rnr-folder`, LedgerTable | tabs rove with arrows |
| Client / consolidated statement | StatementPaper in `rnr-statement-frame`; toolbar `rnr-no-print` with `rnr-btn-primary` "Print / Save PDF"; `data-orientation="landscape"` for wide ledgers | frame scrolls sideways < 210mm |
| Attachments | DropZone, `rnr-table`, `rnr-dialog` confirm | choose button is the stop |
| Import / export | DropZone, `rnr-note`, `rnr-progress` | |
| Contract Manager | `rnr-table-card`, `rnr-status`, `rnr-dialog`, `rnr-field` | |
| Users and roles | `rnr-table-card`, `rnr-avatar`, `rnr-chip`, `rnr-dialog`, `rnr-folder` | |
| Settings | `rnr-folder` per concern, AppearancePanel, `rnr-field`, `rnr-btn-secondary` | |
| Bank accounts | `rnr-table`, `rnr-dialog` | |
| Billing | `rnr-folder`, `rnr-kpi-tile`, `rnr-stamp` "Paid" (`aria-hidden`) | |
| Admin shell | `rnr-side-*` (Firms, Waitlist, Platform settings), account menu with Appearance | |
| Firms / waitlist | AdminTable (`rnr-admin-bar`, `td.rnr-admin-id`, `td.rnr-admin-act` + `rnr-menu`), `rnr-status`, `rnr-dialog` | |
| Support view | Banner (info: "You are viewing {firm} in read-only support view."), LedgerTable | |
| Platform settings | `rnr-folder`, `rnr-field` | |
| Homepage | wordmark, `rnr-paper`, `rnr-btn-primary`, light only | |
| Demo build | Banner (info) as a class | |

## Icons
v1 `Icon` names map to Phosphor regular glyphs in `v2/design/icons/sprite.svg` (`<svg class="ic"><use href="…sprite.svg#i-<id>"/></svg>`; 20px nav, 16px inline).

| v1 name | sprite id | v1 name | sprite id |
|---|---|---|---|
| grip | dots-six-vertical | printer | printer |
| x | x | wallet | wallet |
| back | arrow-left | search | magnifying-glass |
| up | caret-up | phone | phone |
| down | caret-down | mail | envelope-simple |
| right | caret-right | pencil | pencil-simple |
| download | download-simple | building | buildings |
| upload | upload-simple | person, user | user |
| columns | columns | layout | layout |
| plus | plus | logout | sign-out |
| dashboard | squares-four | sliders | sliders-horizontal |
| users | users-three | sun | sun |
| in | arrow-down-left | moon | moon |
| out | arrow-up-right | monitor | monitor |
| trash | trash | more | dots-three |
| resize | arrows-out-simple | plans | credit-card |
| check | check | file | file-text |

Added to the sprite for v1: caret-up, caret-left, arrow-down-left, arrows-out-simple, printer, wallet, phone, layout, sliders-horizontal, sun, moon, monitor, minus-circle, circle, credit-card.
