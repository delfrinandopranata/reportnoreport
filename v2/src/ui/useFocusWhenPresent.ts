import { useEffect, useRef, useState } from 'react'

/**
 * Focuses an element by id as soon as it exists. For targets that appear only after a refetch renders
 * (an Open link replacing Claim, a form replacing a Claim card), where a fixed one-render delay can lose the race.
 */
export function useFocusWhenPresent() {
  const want = useRef<string | null>(null)
  const [, bump] = useState(0)
  useEffect(() => {
    if (!want.current) return
    const el = document.getElementById(want.current)
    if (el) { el.focus(); want.current = null }
  })
  return (id: string) => { want.current = id; bump((n) => n + 1) }
}
