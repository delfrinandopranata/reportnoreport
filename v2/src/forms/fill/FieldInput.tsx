import type { ReactNode } from 'react'
import type { Field } from '../logic'
import { FileInput, type Uploader } from './FileInput'
import { SignaturePad } from './SignaturePad'

type Props = { field: Field; value: unknown; onChange(v: unknown): void; error?: string; id: string; upload?: Uploader }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function FieldInput({ field: f, value, onChange, error, id, upload }: Props) {
  const helpId = `${id}-help`
  const errId = `${id}-err`
  const describedBy = [f.help ? helpId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  const a11y = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': f.required || undefined }
  const star = f.required && <span aria-hidden="true"> *</span>
  const help = f.help && <span id={helpId} className="rnr-hint">{f.help}</span>
  const err = error && <p id={errId} className="rnr-error">{error}</p>
  const field = (head: ReactNode, control: ReactNode) => (
    <div className="rnr-field" data-invalid={error ? true : undefined}>{head}{help}{control}{err}</div>
  )
  const wrap = (control: ReactNode) => field(<label htmlFor={id} className="rnr-label">{f.label}{star}</label>, control)

  switch (f.type) {
    case 'short_text':
      return wrap(<input className="rnr-input" type="text" maxLength={500} value={str(value)} onChange={(e) => onChange(e.target.value)} {...a11y} />)
    case 'long_text':
      return wrap(<textarea className="rnr-input" rows={4} maxLength={10000} value={str(value)} onChange={(e) => onChange(e.target.value)} {...a11y} />)
    case 'number':
      return wrap(<input className="rnr-input rnr-num" type="number" inputMode="decimal" step="any"
        value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)} {...a11y} />)
    case 'date':
      return wrap(<input className="rnr-input" type="date" value={str(value)} onChange={(e) => onChange(e.target.value || undefined)} {...a11y} />)
    case 'single_select':
      return wrap(
        <select className="rnr-input" value={str(value)} onChange={(e) => onChange(e.target.value || undefined)} {...a11y}>
          <option value="">Choose an option</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>,
      )
    case 'multi_select': {
      const picked = Array.isArray(value) ? (value as string[]) : []
      return (
        <fieldset className="rnr-field" aria-describedby={describedBy} data-invalid={error ? true : undefined}>
          <legend className="rnr-label">{f.label}{star}</legend>{help}
          {(f.options ?? []).map((o, i) => (
            <label key={o} className="rnr-check">
              <input id={i === 0 ? id : undefined} type="checkbox" checked={picked.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))} />{o}
            </label>
          ))}
          {err}
        </fieldset>
      )
    }
    case 'checkbox':
      return (
        <div className="rnr-field" data-invalid={error ? true : undefined}>
          <label className="rnr-check">
            <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...a11y} /><span>{f.label}{star}</span>
          </label>
          {help}{err}
        </div>
      )
    case 'file':
      return wrap(<FileInput id={id} value={value} onChange={onChange} upload={upload} describedBy={describedBy} invalid={!!error} />)
    case 'signature':
      return field(<span id={`${id}-l`} className="rnr-label">{f.label}{star}</span>,
        <SignaturePad id={id} value={value} onChange={onChange} upload={upload} describedBy={describedBy} invalid={!!error} />)
    case 'calculated':
      return wrap(
        <>
          <output id={id} className="rnr-readout" aria-live="off">
            {typeof value === 'number' ? value.toLocaleString('en-GB') : <>—<span className="sr-only">No value yet</span></>}
          </output>
          <span className="rnr-hint">Worked out for you.</span>
        </>,
      )
    default:
      return null // page_break and group are laid out by the runner and FormRenderer
  }
}
