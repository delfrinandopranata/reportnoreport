export const ACCENTS = ['midnight', 'ocean', 'bw', 'graphite', 'fern', 'rosewood', 'iris', 'saffron'] as const
export type Accent = (typeof ACCENTS)[number]
export const ACCENT_LABEL: Record<Accent, string> = {
  midnight: 'Midnight ink', ocean: 'Ocean glow', bw: 'Black & White', graphite: 'Graphite',
  fern: 'Fern', rosewood: 'Rosewood', iris: 'Iris', saffron: 'Saffron',
}
export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]
export type Appearance = { theme: Theme; accent: Accent; density: Density }
export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', accent: 'midnight', density: 'comfortable' }
export const STORAGE_KEY = 'rnr.appearance'

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fallback

/** Anything stored (localStorage, user_metadata) is untrusted: unknown keys and values fall back to the defaults. */
export function readAppearance(raw: unknown): Appearance {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    theme: pick(THEMES, o.theme, DEFAULT_APPEARANCE.theme),
    accent: pick(ACCENTS, o.accent, DEFAULT_APPEARANCE.accent),
    density: pick(DENSITIES, o.density, DEFAULT_APPEARANCE.density),
  }
}

export type HtmlAttrs = { theme: 'light' | 'dark'; accent: Accent; density: Density; motion: 'full' | 'flat' }
/** The <html> data attributes for a choice; the pre-paint script in app/index.html must produce the same (tested). */
export const htmlAttrs = (a: Appearance, prefersDark: boolean, reducedMotion: boolean): HtmlAttrs => ({
  theme: a.theme === 'system' ? (prefersDark ? 'dark' : 'light') : a.theme,
  accent: a.accent,
  density: a.density,
  motion: reducedMotion ? 'flat' : 'full',
})

export const sameAppearance = (a: Appearance, b: Appearance) => a.theme === b.theme && a.accent === b.accent && a.density === b.density
