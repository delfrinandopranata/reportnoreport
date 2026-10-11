import { useEffect, useState } from 'react'
import { setNavGuard, type Next } from './navGuard'

/** Unsaved edits ask before a hash change, sign-out or org switch (QA-P2-4); the page renders the confirm dialog. */
export function useLeaveGuard(dirty: boolean, selfHash: string) {
  const [leaveTo, setLeaveTo] = useState<Next | null>(null)
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    setNavGuard((next) => { if (next === selfHash) return false; setLeaveTo(() => next); return true })
    return () => { removeEventListener('beforeunload', warn); setNavGuard(null) }
  }, [dirty, selfHash])
  const leave = () => {
    const to = leaveTo
    setNavGuard(null)
    setLeaveTo(null)
    if (typeof to === 'function') to()
    else if (to) location.hash = to
  }
  return { leaveTo, stay: () => setLeaveTo(null), leave }
}
