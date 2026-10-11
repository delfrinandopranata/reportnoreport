import { useEffect, useId, useRef } from 'react'
import { XIcon } from './icons'

type Props = {
  open: boolean; title: string; body: string; confirmLabel: string; busyLabel: string
  busy: boolean; error: string | null; dismissLabel?: string; onConfirm(): void; onClose(): void
}

export function ConfirmDialog({ open, title, body, confirmLabel, busyLabel, busy, error, dismissLabel = 'Cancel', onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId() // two dialogs can be mounted on one page
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>('[data-autofocus]')?.focus() } // safe default: Cancel
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-b`}
      onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>{title}</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <div className="rnr-dialog-body">
        <p id={`${uid}-b`} className="rnr-muted">{body}</p>
        {error && <p className="rnr-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rnr-btn rnr-btn-secondary" type="button" data-autofocus onClick={onClose}>{dismissLabel}</button>
          <button className="rnr-btn rnr-btn-danger" type="button" aria-busy={busy} onClick={onConfirm}>
            {busy && <span className="rnr-spin" aria-hidden="true" />}{busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
