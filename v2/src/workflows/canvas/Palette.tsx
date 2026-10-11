import { useEffect, useRef, type DragEvent } from 'react'
import { PlusIcon, XIcon } from '../../ui/icons'
import { useMedia } from '../../ui/useMedia'
import { NODE_TYPES, TYPE_LABELS, type NodeType } from '../logic'
import { DRAG_TYPE } from './canvasOps'

const HINTS: Record<NodeType, string> = {
  start: 'The form that starts a record', form: 'Someone fills in or approves a form', condition: 'Branch on an answer',
  time: 'Wait, then continue', end: 'Close the record',
}

function dragStep(e: DragEvent, t: NodeType) {
  e.dataTransfer.setData(DRAG_TYPE, t)
  e.dataTransfer.effectAllowed = 'move'
}

function Blocks({ onAdd, className }: { onAdd(t: NodeType): void; className: string }) {
  return (
    <ul className={className}>
      {NODE_TYPES.map((t) => (
        <li key={t}>
          <button type="button" draggable className="rnr-block rnr-focus w-full text-left" aria-label={`Add ${TYPE_LABELS[t]} step`}
            onDragStart={(e) => dragStep(e, t)} onClick={() => onAdd(t)}>
            <PlusIcon />
            <span><span className="label block">{TYPE_LABELS[t]}</span><span className="rnr-caption block">{HINTS[t]}</span></span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Five blocks in a strip above the board; below md one button opens them in a bottom sheet. */
export function Palette({ onAdd, sheetOpen, setSheetOpen }: { onAdd(t: NodeType): void; sheetOpen: boolean; setSheetOpen(o: boolean): void }) {
  const wide = useMedia('(min-width: 768px)')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (sheetOpen && !d.open) d.showModal()
    if (!sheetOpen && d.open) d.close()
  }, [sheetOpen, wide])
  if (wide) {
    return (
      <section aria-labelledby="pal-h" className="rnr-card gap-3">
        <div className="rnr-card-head"><h2 id="pal-h" className="rnr-card-title">Add a step</h2></div>
        <Blocks onAdd={onAdd} className="grid gap-2 sm:grid-cols-2 md:grid-cols-5" />
      </section>
    )
  }
  return (
    <>
      <button id="pal-open" className="rnr-btn rnr-btn-secondary w-full" type="button" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}><PlusIcon />Add a step</button>
      <dialog ref={ref} className="rnr-dialog rnr-sheet" aria-labelledby="pal-sheet-h" onClose={() => setSheetOpen(false)}
        onClick={(e) => { if (e.target === ref.current) setSheetOpen(false) }}>
        <div className="rnr-dialog-head">
          <h2 id="pal-sheet-h">Add a step</h2>
          <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={() => setSheetOpen(false)}><XIcon /></button>
        </div>
        <div className="rnr-dialog-body">
          <Blocks onAdd={(t) => { setSheetOpen(false); onAdd(t) }} className="grid gap-2" />
        </div>
      </dialog>
    </>
  )
}
