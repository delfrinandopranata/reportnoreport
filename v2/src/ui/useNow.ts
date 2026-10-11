import { useEffect, useState } from 'react'

/** Current time in ms, refreshed every minute, for "overdue" labels that must not go stale on an open page. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}
