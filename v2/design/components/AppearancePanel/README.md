# Appearance panel

Settings → Appearance. Theme, Density, Accent, a live preview and a caption. Classes `rnr-appearance`, `rnr-seg` / `rnr-seg-i`, `rnr-swatches`, `rnr-swatch`, `rnr-swatch-body|chip|check`, `rnr-prefs-preview`.

## What each control sets (on `<html>`)
| Control | Attribute | Values | Stored |
|---|---|---|---|
| Theme | `data-theme` | light, dark; System follows the OS | per person, `user_metadata.appearance` |
| Accent | `data-accent` | midnight, ocean, bw, graphite, fern, rosewood, iris, saffron | per person |
| Density | `data-density` | comfortable, compact | per person |
| Motion | `data-motion` | flat when the OS asks for reduced motion, else full | **not a setting** |
Applied before first paint from `localStorage['rnr.appearance']`; the session value wins.

## Anatomy
A folder panel (radius 20, tab "Settings · Appearance"). Theme and Density are segmented radio groups (native radios). Accent is **8 swatches in a 4 × 2 grid** (2 × 4 below 480px): each swatch is a radio (the input covers it for the keyboard) with a gradient chip (`data-accent` on the chip gives it its own colours, no inline styles) and the name. Selected: 2px `--ink` border + check badge, never colour alone. Preview row (`aria-hidden`): primary button with chip, trend chip, stamp.

## States
rest · hover · focus-visible (3px ring on the swatch body) · selected · saving (polite notice "Appearance saved.") · save failed (`role="alert"`: "Your appearance is saved on this device only. Try again to keep it on your other devices.").

## Do
Apply a change at once (the page is the live preview); save once at a time and queue a newer change.

## Don't
No Save button; no preset or surface-style choices (retired); no motion switch.

## Accessibility
Native radiogroups: arrow keys move and select, one tab stop; swatch names are in the label and `aria-label`; the panel is not modal.

## Copy
Caption: "Your choice follows you to every device you sign in on."
