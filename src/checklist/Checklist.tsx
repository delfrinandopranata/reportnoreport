import { useEffect, useId, useRef, useState } from 'react'
import { Icon, ProgressBar, btn } from '../ui'
import { nextFocusIndex, summarise, type ChecklistItem } from './summary'
import sprite from '../../v2/design/icons/sprite.svg?url'

export interface ChecklistProps {
  items: ChecklistItem[]
  onSkip: (itemId: string) => void
  onRestore: (itemId: string) => void
  onDismiss: () => void
}

/** The state glyphs the shared Icon map doesn't carry. */
const STATE_GLYPH = { todo: 'circle', current: 'arrow-right', done: 'check-circle', skipped: 'minus-circle' } as const
const STATE_WORD = { todo: 'To do', current: 'Next', done: 'Done', skipped: 'Skipped' } as const

function Row({ item, state, action }: { item: ChecklistItem; state: keyof typeof STATE_GLYPH; action?: { label: string; aria: string; run: () => void } }) {
  return (
    <li className="rnr-checklist-item" data-state={state}>
      <svg aria-hidden="true" focusable="false" fill="currentColor" className="rnr-icon">
        <use href={`${sprite}#i-${STATE_GLYPH[state]}`} />
      </svg>
      <div className="rnr-checklist-label">
        <a href={item.href} className="rnr-link">{item.title}</a>
        {state !== 'done' && <span className="rnr-caption block">{item.description}</span>}
      </div>
      <span className={state === 'todo' ? 'rnr-sr-only' : 'rnr-checklist-state'}>{STATE_WORD[state]}</span>
      {action && (
        <button type="button" onClick={action.run} className={`${btn.ghost} rnr-btn-sm`} aria-label={action.aria}>
          {action.label}
        </button>
      )}
    </li>
  )
}

export function Checklist({ items, onSkip, onRestore, onDismiss }: ChecklistProps) {
  const [showSkipped, setShowSkipped] = useState(false)
  const summary = summarise(items)
  const skippedId = useId()
  const list = useRef<HTMLOListElement>(null)
  const dismiss = useRef<HTMLButtonElement>(null)
  const refocus = useRef<number | null>(null)

  // Skipping the last to-do can unmount the whole checklist; focus then goes to the page, not the document start.
  useEffect(() => () => { if (refocus.current !== null) document.getElementById('main')?.focus() }, [])

  // The skipped row unmounts, so focus would fall to the page start: move it to the row now in its place.
  useEffect(() => {
    if (refocus.current === null) return
    const next = nextFocusIndex(refocus.current, summary.todoItems.length)
    refocus.current = null
    const buttons = list.current?.querySelectorAll<HTMLElement>('li:not([data-state="done"]) button')
    ;(next < 0 ? dismiss.current : buttons?.[next])?.focus()
  }, [summary.todoItems.length])

  if (items.length === 0) return null

  return (
    <section className="rnr-folder" role="region" aria-labelledby="checklist-title">
      <span className="rnr-folder-tab" id="checklist-title">Get started</span>
      <div className="rnr-folder-body">
        <div className="rnr-perf" aria-hidden="true" />
        <div className="rnr-checklist-summary">
          <span className="rnr-caption" aria-live="polite" aria-atomic="true">
            {summary.doneCount} of {summary.totalCount} done
          </span>
          <ProgressBar max={summary.totalCount} value={summary.doneCount} label={`Setup progress, ${summary.doneCount} of ${summary.totalCount}`} />
          <button ref={dismiss} type="button" onClick={onDismiss} className={`${btn.ghost} rnr-btn-sm`} aria-label="Dismiss checklist">
            <Icon name="x" className="size-4" />
          </button>
        </div>

        <ol ref={list} className="rnr-checklist">
          {summary.todoItems.map((item, i) => (
            <Row key={item.id} item={item} state={i === 0 ? 'current' : 'todo'} action={{ label: 'Skip', aria: `Skip "${item.title}"`, run: () => { refocus.current = i; onSkip(item.id) } }} />
          ))}
          {summary.doneItems.map((item) => (
            <Row key={item.id} item={item} state="done" />
          ))}
        </ol>

        {summary.skippedItems.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setShowSkipped(!showSkipped)}
              className={`${btn.ghost} rnr-btn-sm`}
              aria-expanded={showSkipped}
              aria-controls={skippedId}
            >
              <Icon name={showSkipped ? 'up' : 'down'} className="size-3 shrink-0" />
              <span>
                Skipped ({summary.skippedItems.length}) ·{' '}
                {showSkipped ? 'Hide' : 'Show'}
              </span>
            </button>

            {showSkipped && (
              <ul id={skippedId} className="rnr-checklist mt-2">
                {summary.skippedItems.map((item) => (
                  <Row key={item.id} item={item} state="skipped" action={{ label: 'Restore', aria: `Restore "${item.title}"`, run: () => onRestore(item.id) }} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
