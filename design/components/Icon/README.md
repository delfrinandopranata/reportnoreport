# Icon

The app's 24×24 stroke icon set (2px stroke, round caps and joins, `currentColor`), 34 glyphs.

Copied verbatim from the `PATHS` map in `src/ui.tsx`; rendered by `<Icon name="…" className="size-4" />`.

## Rules
- Sizes: 16px in buttons and menus, 14px in icon buttons and segments, 20px in nav.
- Colour is always `currentColor`; the icon takes the text token of its container.
- Decorative icons get `aria-hidden`; icon-only buttons get an `aria-label`.
- No emoji in UI.
