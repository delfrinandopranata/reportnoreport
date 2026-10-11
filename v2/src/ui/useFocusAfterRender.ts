import { useEffect, useRef, useState } from 'react'

type Target = string | (() => HTMLElement | null | undefined)

/**
 * Focuses an element after the next commit. It runs in an effect, so a pressed button that unmounts in the
 * same render cannot win the race against the browser's focus fixup (a rAF callback can lose it).
 */
export function useFocusAfterRender() {
  const target = useRef<Target | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = target.current
    target.current = null
    if (t) (typeof t === 'string' ? document.getElementById(t) : t())?.focus()
  }, [tick])
  return (t: Target) => { target.current = t; setTick((n) => n + 1) }
}
