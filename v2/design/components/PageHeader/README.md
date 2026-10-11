# Page header and back link

`rnr-page-head`, `rnr-page-title`, `rnr-micro`, `rnr-lede`, `rnr-page-actions`, `rnr-crumb`.

## Anatomy
Back link (`rnr-crumb`, 44px, arrow icon) above, then: micro mono crumb ("Work · Leave approval") · title (`rnr-page-title`: Fraunces 450, `clamp(36px, 4vw + 20px, 64px)`, one `<h1>` per view, **one italic accent word at most**) · lede (`rnr-lede`, `--ink-2`, ≤ 34em) · actions on the right (the one primary lives here).
Alignment: left for list and detail pages; `data-align="center"` for auth and public pages.

## Which titles get an italic word
Decided here, not per screen: titles of two or more words italicise the last noun ("Leave *approval*", "Your *inbox*", "New *campaign*"); one-word titles ("Forms", "Records", "Members") stay upright.

## Focus
After navigation the page heading takes focus (`tabindex="-1"`), as in Phases 3–6.

## Do
Use the micro crumb for the section, the back link for the parent page. Keep the lede to one or two sentences.

## Don't
No second `h1`; no icon beside the title; no action buttons in the lede.

## Accessibility
Heading order; back link text says where it goes ("Back to inbox"); decorative arrow `aria-hidden`.

## Copy
Sentence case. Back link: "Back to <page>".
