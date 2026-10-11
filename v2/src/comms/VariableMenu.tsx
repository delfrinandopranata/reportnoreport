import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { DATA_PREFIX, VARIABLES } from './logic'

type Props = {
  /** Answer keys of the record being previewed; null when no record is chosen. */
  answers: string[] | null
  recordTitle: string | null
  target: 'subject' | 'message'
  onPick(key: string, label: string): void
}

/** An ARIA menu button: arrows move, Home/End jump, Esc returns to the button, Tab closes. */
export function VariableMenu({ answers, recordTitle, target, onPick }: Props) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  const hasAnswers = !!answers?.length

  useEffect(() => { if (open) items.current[0]?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    addEventListener('pointerdown', onDown)
    return () => removeEventListener('pointerdown', onDown)
  }, [open])

  const count = VARIABLES.length + (hasAnswers ? answers.length : 1)
  const go = (i: number) => { const n = (i + count) % count; setActive(n); items.current[n]?.focus() }
  const openMenu = () => { setActive(0); setOpen(true) }
  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); go(active + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(active - 1) }
    else if (e.key === 'Home') { e.preventDefault(); go(0) }
    else if (e.key === 'End') { e.preventDefault(); go(count - 1) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }
  const pick = (key: string, label: string) => { setOpen(false); onPick(key, label) }
  const slot = (i: number) => ({ ref: (el: HTMLButtonElement | null) => { items.current[i] = el }, tabIndex: i === active ? 0 : -1 })

  return (
    <div className="flex flex-col gap-1">
      <div ref={box} className="relative self-start">
        <button ref={button} type="button" className="rnr-btn rnr-btn-secondary" aria-haspopup="menu" aria-expanded={open}
          aria-controls={open ? `${uid}-menu` : undefined} aria-describedby={`${uid}-hint`}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu() } }}>Insert variable</button>
        {open && (
          <div id={`${uid}-menu`} role="menu" aria-label="Insert variable" className="rnr-menu rnr-menu--wide absolute z-20 mt-1" onKeyDown={onMenuKey}>
            <div role="group" aria-label="Details">
              {VARIABLES.map((v, i) => (
                <button key={v.key} type="button" role="menuitem" {...slot(i)} className="rnr-menu-item rnr-menu-item--stack" onClick={() => pick(v.key, v.label)}>
                  <span>{v.label}</span><span className="rnr-caption">{v.hint}</span>
                </button>
              ))}
            </div>
            <div className="rnr-menu-sep" role="separator" />
            <div role="group" aria-label={recordTitle ? `Answers from ${recordTitle}` : 'Answers'}>
              {hasAnswers
                ? answers.map((k, j) => (
                  <button key={k} type="button" role="menuitem" {...slot(VARIABLES.length + j)} className="rnr-menu-item" onClick={() => pick(`${DATA_PREFIX}${k}`, `Answer: ${k}`)}>Answer: {k}</button>
                ))
                : <button type="button" role="menuitem" aria-disabled="true" {...slot(VARIABLES.length)} className="rnr-menu-item">Answers: choose a record to preview first</button>}
            </div>
          </div>
        )}
      </div>
      <p className="rnr-caption" id={`${uid}-hint`}>Adds to the {target} at the cursor.</p>
    </div>
  )
}
