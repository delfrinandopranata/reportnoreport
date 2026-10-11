import { useEffect } from 'react'
import { supabase } from '../data/supabase'
import { htmlAttrs, readAppearance, sameAppearance, STORAGE_KEY, type Appearance } from './appearance'

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function currentAppearance(): Appearance {
  try { return readAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch { return readAppearance(null) }
}

export function applyAppearance(a: Appearance) {
  Object.assign(document.documentElement.dataset, htmlAttrs(a, dark(), reduce()))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) } catch { /* private mode: this page still shows it */ }
}

/** The account's choice follows the person between devices; it wins over this device's cache. */
export function syncFromSession(meta: unknown) {
  const stored = meta && typeof meta === 'object' ? (meta as { appearance?: unknown }).appearance : undefined
  if (stored === undefined) return
  const a = readAppearance(stored)
  if (!sameAppearance(a, currentAppearance())) applyAppearance(a)
}

export async function saveAppearance(a: Appearance): Promise<{ error: string | null }> {
  applyAppearance(a)
  const { error } = await supabase.auth.updateUser({ data: { appearance: a } })
  if (error) console.error(error)
  return { error: error ? 'Your appearance is saved on this device only. Try again to keep it on your other devices.' : null }
}

/** Re-reads the cached choice on every OS change, so it needs no React state. */
export function useFollowSystem() {
  useEffect(() => {
    const queries = [matchMedia('(prefers-color-scheme: dark)'), matchMedia('(prefers-reduced-motion: reduce)')]
    const on = () => applyAppearance(currentAppearance())
    queries.forEach((q) => q.addEventListener('change', on))
    return () => queries.forEach((q) => q.removeEventListener('change', on))
  }, [])
}
