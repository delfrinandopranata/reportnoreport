# Sidebar shell

The app frame. Classes `rnr-shell`, `rnr-side` (+ `rnr-folder`), `rnr-side-tab`, `rnr-side-body`, `rnr-side-group`, `rnr-side-link`, `rnr-side-foot`, `rnr-account`, `rnr-org`, `rnr-page`, `rnr-topbar`, `rnr-phonebar`, `rnr-drawer`.

## Desktop (≥ 768px)
Grid `248px | 1fr` with areas `side top / side main` (the sidebar spans both rows; `header.rnr-topbar` and `main.rnr-page` are its siblings). The skip link is `a.rnr-skip` (off-screen until focused; use it instead of Tailwind's `sr-only focus:not-sr-only`, which would put it in a grid cell). The sidebar is a **folder** (panel radius 20, 44px tab holding the wordmark) in a sticky full-height column on `--canvas`. Body: organisation switcher (`rnr-org`) · `nav[aria-label="Main"]` with three groups (Work: Inbox, Records, Dashboard, Reports · Build: Forms, Workflows, Templates, Campaigns · Admin: Members, Roles, Messages) · foot (Notifications, Settings, the account row with Sign out). Group labels are micro mono caps. Visibility follows today's permissions; empty groups disappear.
Nav row: 44px, radius **10** (folder 20 − 10px inner padding, concentric), 20px Phosphor icon, 15px label. Current page: `aria-current="page"`, accent fill (`--acc`, `--on-acc`), optional `rnr-dot` marker. Main column `rnr-page`: padding 16px 40px 64px, content max 960px.

## Phone (< 768px)
Sidebar hidden. Top bar (`rnr-topbar`, sticky, 64px): wordmark, ⌘K dock (shortcut hint hidden), bell. Bottom bar (`rnr-phonebar`, fixed, 64px + safe area): the first four nav items and **Menu**, 44px icon targets, current = accent fill. Menu opens the full sidebar in `rnr-drawer` (native `<dialog>`, left, 320px). Page padding reserves the bar height.

## States
rest · hover (soft wash) · focus-visible (3px ring) · current · pressed. The skip link ("Skip to content") is the first focusable element.

## Do
One `<nav aria-label="Main">`; return focus to Menu when the drawer closes; never show two bells or two switchers (the hidden copy is `display: none`).

## Don't
Don't add a fourth group; don't put actions in the tab; don't use the shell's colours for status.

## Accessibility
`aria-current="page"`; landmarks (`aside` / `nav` / `main#main`); the drawer traps focus natively. Icons are decoration (the label is text, or `aria-label` in the phone bar).

## Copy
Items are the page names. Search placeholder is "Go to a page".
