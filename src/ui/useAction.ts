import { useRef, useState } from 'react'

/** Busy flag that ignores re-entry, plus a 1.6s "saved" flash. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const lock = useRef(false)
  async function run<T>(fn: () => Promise<T>, flash = false): Promise<T | undefined> {
    if (lock.current) return undefined
    lock.current = true; setBusy(true)
    try {
      const out = await fn()
      if (flash) { setSaved(true); setTimeout(() => setSaved(false), 1600) }
      return out
    } finally { lock.current = false; setBusy(false) }
  }
  return { busy, saved, run }
}
