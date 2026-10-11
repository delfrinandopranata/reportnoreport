import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

const ITEMS = '[role="menuitem"], [role="menuitemradio"]'

/** Behaviour of an ARIA menu button: roving tabindex, arrows, Home/End, Esc back to the button, Tab closes, outside press closes. */
export function useMenu() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const items = () => [...(box.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]

  useEffect(() => { if (open) items()[0]?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    addEventListener('pointerdown', onDown)
    return () => removeEventListener('pointerdown', onDown)
  }, [open])

  const go = (i: number) => { const all = items(); const n = (i + all.length) % all.length; setActive(n); all[n]?.focus() }
  const show = () => { setActive(0); setOpen(true) }
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus() }
  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); go(active + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(active - 1) }
    else if (e.key === 'Home') { e.preventDefault(); go(0) }
    else if (e.key === 'End') { e.preventDefault(); go(items().length - 1) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') setOpen(false)
  }
  const onButtonKey = (e: KeyboardEvent) => { if (e.key === 'ArrowDown') { e.preventDefault(); show() } }
  const toggle = () => (open ? close(false) : show())
  /** Roving tabindex: only the active item is a tab stop. */
  const slot = (i: number) => ({ tabIndex: i === active ? 0 : -1 })
  return { open, box, button, close, toggle, onMenuKey, onButtonKey, slot }
}
