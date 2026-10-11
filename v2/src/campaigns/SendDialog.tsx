import { useEffect, useId, useRef } from 'react'
import { FieldError } from '../ui/Note'
import { XIcon } from '../ui/icons'

export type Review = {
  name: string; template: string; audience: string; people: string; workflow: string | null
  when: string; later: boolean; inApp: boolean
}
type Props = { open: boolean; review: Review; busy: boolean; error: string | null; onConfirm(): void; onClose(): void }

/** Not ConfirmDialog: its confirm button is danger, and sending is not destructive. Cancel is focused, because mail cannot be recalled. */
export function SendDialog({ open, review: r, busy, error, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>('[data-autofocus]')?.focus() }
    if (!open && d.open) d.close()
  }, [open])
  const left = r.inApp ? 'People without an account are left out, and the report counts them.' : 'People who unsubscribed or have no email address are left out, and the report counts them.'
  const verb = r.later ? 'Schedule' : 'Send now'
  return (
    <dialog ref={ref} className="rnr-dialog" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-b`}
      onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="rnr-dialog-head">
        <h2 id={`${uid}-t`}>{r.later ? `Schedule ${r.name}?` : `Send ${r.name} now?`}</h2>
        <button className="rnr-icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><XIcon /></button>
      </div>
      <div className="rnr-dialog-body">
        <dl className="rnr-review" id={`${uid}-b`}>
          <dt>Template</dt><dd>{r.template}</dd>
          <dt>Audience</dt><dd>{r.audience}</dd>
          <dt>People</dt><dd className="rnr-num">{r.people}</dd>
          {r.workflow && <><dt>Workflow</dt><dd>{r.workflow}</dd></>}
          <dt>When</dt><dd>{r.when}</dd>
        </dl>
        <p className="rnr-muted">{left} {r.later ? 'You can cancel until sending starts.' : 'You cannot cancel it once sending starts.'}</p>
        {error && <FieldError role="alert">{error}</FieldError>}
      </div>
      <div className="rnr-dialog-foot">
        <button className="rnr-btn rnr-btn-secondary" type="button" data-autofocus onClick={onClose}>Cancel</button>
        <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={busy} onClick={onConfirm}>
          {busy && <span className="rnr-spin" aria-hidden="true" />}{busy ? (r.later ? 'Scheduling…' : 'Sending…') : verb}
        </button>
      </div>
    </dialog>
  )
}
