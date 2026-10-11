import { useMemo, useState } from 'react'
import { pages, resolve, validateAnswers, visiblePages, type Answers, type Field } from '../logic'
import type { SubmitResult } from '../api'
import { CheckIcon } from '../../ui/icons'
import { useAction } from '../../ui/useAction'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import { inputId } from '../paths'
import { FormRenderer } from './FormRenderer'
import type { Uploader } from './FileInput'

type Outcome = { value: string; label: string; busyLabel: string }
type Props = {
  fields: Field[]; idPrefix: string; filePrefix?: string; upload?: Uploader
  /** With outcomes the last page shows one button per outcome (the first is primary) and Enter never submits. */
  outcomes?: Outcome[]
  onSubmit?(answers: Answers, outcome?: string): Promise<SubmitResult>; onDone?(result: Extract<SubmitResult, { ok: true }>): void
  submitLabel?: { idle: string; busy: string }
}

const FIX = 'Some answers need fixing. The fields to fix are marked below.'
const anyRequired = (fields: Field[]): boolean => fields.some((f) => f.required || (f.fields ? anyRequired(f.fields) : false))

/** Groups with a minimum start with that many empty rows. */
const seedRows = (fields: Field[]): Answers =>
  Object.fromEntries(fields.filter((f) => f.type === 'group' && (f.repeat?.min ?? 0) > 0).map((f) => [f.key, Array.from({ length: f.repeat!.min }, () => ({}))]))

export function FormRunner({ fields, idPrefix, filePrefix, upload, outcomes, onSubmit, onDone, submitLabel = { idle: 'Submit form', busy: 'Submitting…' } }: Props) {
  const all = useMemo(() => pages(fields), [fields])
  const [answers, setAnswers] = useState<Answers>(() => seedRows(fields))
  const [at, setAt] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const submit = useAction()
  const [pressed, setPressed] = useState<string | null>(null)
  const focusLater = useFocusAfterRender()
  const topId = `${idPrefix}-top`
  const resolved = useMemo(() => resolve(fields, answers), [fields, answers])
  const visible = useMemo(() => visiblePages(fields, answers), [fields, answers])

  if (!visible.length) return <p className="rnr-muted">{fields.length ? 'This form has no questions to answer right now.' : 'This form has no fields yet.'}</p>
  const current = Math.min(at, visible.length - 1)
  const page = all[visible[current]]
  const title = page[0]?.type === 'page_break' ? page[0].label : ''
  const last = current === visible.length - 1

  const showErrors = (errs: Record<string, string>) => {
    setErrors(errs); setFormError(FIX)
    const first = Object.keys(errs)[0] ?? ''
    const root = first.split('.')[0]
    const ix = visible.findIndex((p) => all[p].some((f) => f.key === root))
    if (ix >= 0) setAt(ix)
    focusLater(inputId(idPrefix, first))
  }
  const next = () => {
    const r = validateAnswers(fields, answers, { onlyKeys: new Set(page.map((f) => f.key)), filePrefix })
    if (!r.ok) return showErrors(r.errors)
    setErrors({}); setFormError(null); setAt(current + 1); focusLater(topId)
  }
  const back = () => { setErrors({}); setFormError(null); setAt(current - 1); focusLater(topId) }
  const finish = (outcome?: string) => submit.run(async () => {
    setFormError(null); setChecked(false); setPressed(outcome ?? null)
    const r = validateAnswers(fields, answers, { filePrefix })
    if (!r.ok) return showErrors(r.errors)
    setErrors({})
    if (!onSubmit) { setChecked(true); return }
    const res = await onSubmit(answers, outcome)
    if (res.ok) { onDone?.(res); return }
    if (res.fieldErrors) showErrors(res.fieldErrors)
    else setFormError(res.error)
  })
  const change = (a: Answers, key: string) => {
    setAnswers(a); setChecked(false)
    const rest = Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key && !k.startsWith(`${key}.`)))
    setErrors(rest)
    if (!Object.keys(rest).length) setFormError((m) => (m === FIX ? null : m)) // nothing left to fix
  }

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!last) next(); else if (!outcomes) finish() }}>
      {anyRequired(fields) && <p className="rnr-caption">Fields marked * are required.</p>}
      {visible.length > 1 && (
        <div id={topId} tabIndex={-1} className="flex flex-col gap-2">
          <p className="rnr-caption">Page {current + 1} of {visible.length}</p>
          <div aria-hidden="true" style={{ height: 4, borderRadius: 'var(--radius-full)', background: 'var(--rnr-track-bg)' }}>
            <div style={{ height: '100%', width: `${((current + 1) / visible.length) * 100}%`, borderRadius: 'inherit', background: 'var(--ink-label)' }} />
          </div>
          {title && <h2 className="dialog-title">{title}</h2>}
        </div>
      )}
      <FormRenderer fields={page} answers={answers} resolved={resolved} errors={errors} onChange={change} upload={upload} idPrefix={idPrefix} />
      {formError && <p className="rnr-error" role="alert">{formError}</p>}
      <p className="rnr-status" role="status">{checked && <><CheckIcon size={14} />These answers are valid. The preview does not save them.</>}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {current > 0 && <button type="button" className="rnr-btn rnr-btn-secondary w-full sm:w-auto" onClick={back}>Back</button>}
        {last && onSubmit && outcomes
          ? outcomes.map((o, i) => {
            const mine = submit.busy && pressed === o.value
            return (
              <button key={o.value} type="button" className={`rnr-btn w-full sm:w-auto ${i === 0 ? 'rnr-btn-primary' : 'rnr-btn-secondary'}`}
                aria-busy={mine} onClick={() => finish(o.value)}>
                {mine && <span className="rnr-spin" aria-hidden="true" />}{mine ? o.busyLabel : o.label}
              </button>
            )
          })
          : (
            <button type="submit" className={`rnr-btn w-full sm:w-auto ${onSubmit ? 'rnr-btn-primary' : 'rnr-btn-secondary'}`} aria-busy={submit.busy}>
              {submit.busy && <span className="rnr-spin" aria-hidden="true" />}
              {!last ? 'Next page' : !onSubmit ? 'Check answers' : submit.busy ? submitLabel.busy : submitLabel.idle}
            </button>
          )}
      </div>
    </form>
  )
}
