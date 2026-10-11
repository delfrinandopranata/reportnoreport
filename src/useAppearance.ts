import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './data/supabase'
import { DEMO, getStore, saveStore } from './demo/store'
import { APPEARANCE_KEY, htmlAttrs, persistAppearance, readAppearance, sameAppearance, STORAGE_KEY, type Appearance } from './appearance'

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function cachedAppearance(): Appearance {
  try { return readAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch { return readAppearance(null) }
}

export function applyAppearance(a: Appearance) {
  Object.assign(document.documentElement.dataset, htmlAttrs(a, dark(), reduce()))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) } catch { /* private mode: this page still shows it */ }
}

// One shared value, so the header's theme toggle and Settings → Appearance never disagree.
let current = cachedAppearance()
const listeners = new Set<() => void>()
const set = (a: Appearance) => { current = a; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Takes the profile id explicitly so the super-admin console (outside SessionProvider) can use it too. */
export function useAppearance(profileId: string): [Appearance, (a: Appearance) => Promise<string | null>] {
  const value = useSyncExternalStore(subscribe, () => current)
  useEffect(() => {
    const adopt = (a: Appearance) => { if (!sameAppearance(a, cachedAppearance())) applyAppearance(a); set(a) }
    if (DEMO) {
      const s = getStore().preferences[APPEARANCE_KEY]
      if (s !== undefined) adopt(readAppearance(s))
      return
    }
    supabase.from('user_preferences').select('value').eq('profile_id', profileId).eq('key', APPEARANCE_KEY).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('Appearance not loaded', error); return } // the cache stays in force
        if (data) adopt(readAppearance(data.value))
      })
  }, [profileId])
  useEffect(() => {
    // Re-reads the cached choice whenever the OS scheme or motion preference changes, so System follows it.
    const qs = [matchMedia('(prefers-color-scheme: dark)'), matchMedia('(prefers-reduced-motion: reduce)')]
    const on = () => applyAppearance(cachedAppearance())
    qs.forEach((q) => q.addEventListener('change', on))
    return () => qs.forEach((q) => q.removeEventListener('change', on))
  }, [])
  const save = (a: Appearance) => {
    applyAppearance(a)
    set(a)
    if (DEMO) {
      const s = getStore()
      saveStore({ ...s, preferences: { ...s.preferences, [APPEARANCE_KEY]: a } })
      return Promise.resolve(null)
    }
    return persistAppearance(async (v) => supabase.from('user_preferences').upsert({ profile_id: profileId, key: APPEARANCE_KEY, value: v }), a)
  }
  return [value, save]
}
