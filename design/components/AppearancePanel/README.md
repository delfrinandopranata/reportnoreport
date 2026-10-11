# AppearancePanel

The settings panel where a firm and each person customise the look: theme, colour preset, surface style, density and motion.

v2 addition designed from the brief; it extends `ThemeToggle` (`src/ui.tsx`) and the firm `design_system` column (migration `20261007000004`).

## What each choice sets (on `<html>`)
| Control | Attribute | Values | Scope |
|---|---|---|---|
| Theme | `data-theme` (+ `.dark`) | light, dark, system → light/dark | per person |
| Colour preset | `data-preset` | default, ocean, forest, sunset | per firm (admins) |
| Black & White | `data-theme` | bw-light, bw-dark (follows light/dark) | per person; overrides preset |
| Surface style | `data-style` | solid, glass, neu | per person |
| Density | `data-density` | comfortable, compact | per person |
| Motion | `data-motion` | full, flat (forced flat under `prefers-reduced-motion`) | per person |

## Rules
- Apply before first paint (like the theme bootstrap script in `app/index.html`) to avoid a flash.
- Preview changes live; no Save button for per-person choices.
- Presets are shown as swatches with names in `aria-label`; the selected one gets an `ink` 2px ring.
