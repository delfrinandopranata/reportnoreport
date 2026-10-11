import { useEffect, useId, useRef, useState } from 'react'
import { SearchIcon } from './icons'
import { matchJump } from './nav'

type Item = { href: string; label: string }

const hint = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K')

/** ⌘K / Ctrl+K: a jump bar over the pages this person can open. It sets the hash, so the navigation guard asks first as for any link. */
export function JumpBar({ items }: { items: Item[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const leaving = useRef(false)
  const id = useId()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const matches = matchJump(items, q)
  const active = Math.min(idx, matches.length - 1)

  const open = () => { setQ(''); setIdx(0); dialog.current?.showModal(); input.current?.focus() }
  const go = (i: Item | undefined) => {
    if (!i) return
    leaving.current = true // the page takes focus (its heading); only Esc sends it back to the dock
    const before = document.querySelector<HTMLElement>('main h1')
    dialog.current?.close()
    if (location.hash === i.href) { before?.focus(); return }
    location.hash = i.href
    // The new page renders after the hash change (some after a fetch): wait for its heading, up to 3s, then focus it.
    const start = performance.now()
    const tick = () => {
      const h = document.querySelector<HTMLElement>('main h1')
      if (h && h !== before) { h.focus(); return }
      if (performance.now() - start < 3000) setTimeout(tick, 40) // a timer, not rAF: rAF stops in a hidden tab
    }
    setTimeout(tick, 40)
  }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!dialog.current?.open) open()
      }
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (matches.length) setIdx((active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(matches[active])
    }
  }

  return (
    <>
      <button ref={button} type="button" className="rnr-dock rnr-paper rnr-paper--plain max-sm:w-11 max-sm:ml-auto max-sm:flex-none max-sm:justify-center max-sm:px-0" aria-label="Go to a page" aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K" onClick={open}>
        <SearchIcon size={20} /><span className="max-sm:sr-only">Go to a page</span><span className="rnr-kbd" aria-hidden="true">{hint()}</span>
      </button>
      <dialog ref={dialog} className="rnr-dialog rnr-jump" aria-label="Go to a page" onClose={() => { if (!leaving.current) button.current?.focus(); leaving.current = false }}>
        <div className="rnr-jump-field">
          <span className="rnr-input-wrap">
            <SearchIcon size={20} />
            <input ref={input} className="rnr-input" role="combobox" aria-label="Go to a page" placeholder="Go to a page" autoComplete="off"
              aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={matches.length ? `${id}-${active}` : undefined}
              value={q} onChange={(e) => { setQ(e.target.value); setIdx(0) }} onKeyDown={onKey} />
          </span>
        </div>
        {matches.length > 0
          ? (
            <ul className="rnr-jump-list" id={`${id}-list`} role="listbox" aria-label="Pages">
              {matches.map((m, i) => (
                <li key={m.href} id={`${id}-${i}`} className="rnr-jump-option" role="option" aria-selected={i === active}
                  onMouseMove={() => setIdx(i)} onClick={() => go(m)}>{m.label}</li>
              ))}
            </ul>
          )
          : <p className="rnr-muted px-4 py-3" role="status">No page matches “{q.trim()}”.</p>}
        <p className="rnr-caption px-4 pb-3 pt-1">Enter opens the page. Esc closes.</p>
      </dialog>
    </>
  )
}
