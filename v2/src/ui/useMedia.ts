import { useSyncExternalStore } from 'react'

/** Live `matchMedia` match, e.g. useMedia('(min-width: 768px)'). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => { const m = matchMedia(query); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify) },
    () => matchMedia(query).matches,
  )
}
