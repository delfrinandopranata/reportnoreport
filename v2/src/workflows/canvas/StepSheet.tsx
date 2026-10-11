import { useEffect, useRef, type ReactNode } from 'react'
import { XIcon } from '../../ui/icons'

/** The side panel below lg: a bottom sheet (native dialog). Edits apply to the unsaved graph at once; Done only closes. */
export function StepSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="rnr-dialog rnr-sheet" aria-labelledby="sheet-h" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id="sheet-h">{title}</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <div className="rnr-dialog-body">
        {children}
        <div className="flex justify-end"><button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Done</button></div>
      </div>
    </dialog>
  )
}
