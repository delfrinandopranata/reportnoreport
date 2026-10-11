import { useRef } from 'react'
import { PlusIcon, XIcon } from '../../ui/icons'
import { FIELD_TYPES, SECTION_FIELD_TYPES, type FieldType } from '../logic'
import { TYPE_HINTS, TYPE_LABELS } from './builderOps'

type Grid = { types: readonly FieldType[]; onAdd(t: FieldType): void; className: string }

function Blocks({ types, onAdd, className }: Grid) {
  return (
    <ul className={className}>
      {types.map((t) => (
        <li key={t}>
          <button type="button" className="rnr-block rnr-focus w-full text-left text-ink" aria-label={`Add ${TYPE_LABELS[t]} field`} onClick={() => onAdd(t)}>
            <PlusIcon />
            <span><span className="label block">{TYPE_LABELS[t]}</span><span className="rnr-caption block">{TYPE_HINTS[t]}</span></span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Top-level palette: an inline card from lg, a bottom sheet behind one button below it. */
export function Palette({ onAdd }: { onAdd(t: FieldType): void }) {
  const sheet = useRef<HTMLDialogElement>(null)
  return (
    <>
      {/* Wrappers carry hidden/lg:hidden: the unlayered bundle display rules would beat the utilities on the card and button. */}
      <div className="hidden lg:block">
        <section aria-labelledby="pal-h" className="rnr-card gap-3">
          <div className="rnr-card-head"><h2 id="pal-h" className="rnr-card-title">Add a field</h2></div>
          <Blocks types={FIELD_TYPES} onAdd={onAdd} className="grid gap-2 sm:grid-cols-2" />
        </section>
      </div>
      <div className="lg:hidden">
        <button type="button" className="rnr-btn rnr-btn-secondary w-full" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>
          <PlusIcon />Add a field
        </button>
      </div>
      <dialog ref={sheet} className="rnr-dialog rnr-sheet" aria-labelledby="sheet-h" onClick={(e) => { if (e.target === sheet.current) sheet.current?.close() }}>
        <div className="rnr-dialog-head">
          <h2 id="sheet-h">Add a field</h2>
          <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={() => sheet.current?.close()}><XIcon /></button>
        </div>
        <div className="rnr-dialog-body">
          <Blocks types={FIELD_TYPES} className="grid gap-2" onAdd={(t) => { sheet.current?.close(); onAdd(t) }} />
        </div>
      </dialog>
    </>
  )
}

export function SectionPalette({ onAdd }: { onAdd(t: FieldType): void }) {
  return (
    <section aria-labelledby="spal-h" className="flex flex-col gap-3">
      <h3 id="spal-h" className="label">Add a field to this section</h3>
      <Blocks types={SECTION_FIELD_TYPES} onAdd={onAdd} className="grid gap-2 sm:grid-cols-2" />
    </section>
  )
}
