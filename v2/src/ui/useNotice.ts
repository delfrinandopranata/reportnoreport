import { useEffect, useState } from 'react'

/** Inline status message that clears itself after 5s. */
export function useNotice(initial: string | null = null) {
  const [notice, setNotice] = useState<string | null>(initial)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])
  return [notice, setNotice] as const
}
