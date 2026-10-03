export type ThemePreference = 'light' | 'dark' | 'system'

/** Pure resolution: a stored preference plus the OS's current scheme, no side effects. */
export function resolveTheme(pref: ThemePreference, prefersDarkOS: boolean): 'light' | 'dark' {
  if (pref === 'system') return prefersDarkOS ? 'dark' : 'light'
  return pref
}
