import { useState } from 'react'
import { evaluate, type Answers, type Field, type Resolved } from '../logic'
import { PlusIcon } from '../../ui/icons'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import { inputId } from '../paths'
import { FieldInput } from './FieldInput'
import type { Uploader } from './FileInput'

type Props = {
  fields: Field[]; answers: Answers; resolved: Resolved; errors: Record<string, string>
  onChange(next: Answers, changedKey: string): void; upload?: Uploader; idPrefix: string
}

export function FormRenderer({ fields, answers, resolved, errors, onChange, upload, idPrefix }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...answers, [key]: v }, key)
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => {
        if (resolved.hidden.has(f.key) || f.type === 'page_break') return null
        if (f.type === 'group') {
          const rows = Array.isArray(answers[f.key]) ? (answers[f.key] as Answers[]) : []
          return <GroupInput key={f.key} field={f} rows={rows} answers={answers} errors={errors} upload={upload} idPrefix={idPrefix} onChange={(r) => set(f.key, r)} />
        }
        const value = f.type === 'calculated' ? resolved.answers[f.key] : answers[f.key]
        return <FieldInput key={f.key} id={inputId(idPrefix, f.key)} field={f} value={value} error={errors[f.key]} upload={upload} onChange={(v) => set(f.key, v)} />
      })}
    </div>
  )
}

type GroupProps = { field: Field; rows: Answers[]; answers: Answers; errors: Record<string, string>; upload?: Uploader; idPrefix: string; onChange(rows: Answers[]): void }

function GroupInput({ field: f, rows, answers, errors, upload, idPrefix, onChange }: GroupProps) {
  const { min, max } = f.repeat ?? { min: 0, max: 50 }
  const id = inputId(idPrefix, f.key)
  const [said, say] = useState('')
  const focusLater = useFocusAfterRender()
  const hint = [f.help, min === 0 && max === 50 ? '' : `${min}–${max} rows.`].filter(Boolean).join(' ')
  const hasError = Object.keys(errors).some((k) => k === f.key || k.startsWith(`${f.key}.`))
  const setRow = (i: number, key: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  const add = () => {
    onChange([...rows, {}])
    say(`Row ${rows.length + 1} added. ${rows.length + 1} rows.`)
    const first = f.fields?.[0]?.key
    if (first) focusLater(inputId(idPrefix, `${f.key}.${rows.length}.${first}`))
  }
  const remove = (i: number) => {
    onChange(rows.filter((_, j) => j !== i))
    say(`Row removed. ${rows.length - 1} rows.`)
    focusLater(id) // the pressed Remove button is gone after this render
  }
  return (
    <fieldset id={id} tabIndex={-1} className="rnr-card gap-3" data-invalid={hasError ? true : undefined}
      aria-describedby={[hint ? `${id}-hint` : '', errors[f.key] ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined}>
      <legend className="rnr-label">{f.label}</legend>
      {hint && <p id={`${id}-hint`} className="rnr-hint">{hint}</p>}
      {rows.length === 0 && <p className="rnr-muted">No rows yet.</p>}
      {rows.map((row, i) => (
        <div key={i} role="group" aria-label={`${f.label}, row ${i + 1}`} className="flex flex-col gap-3 border-t border-line-200 pt-3">
          <p className="label">Row {i + 1}</p>
          {(f.fields ?? []).map((c) => (c.show_if && !evaluate(c.show_if, { ...answers, ...row }) ? null : (
            <FieldInput key={c.key} id={inputId(idPrefix, `${f.key}.${i}.${c.key}`)} field={c} value={row[c.key]}
              error={errors[`${f.key}.${i}.${c.key}`]} upload={upload} onChange={(v) => setRow(i, c.key, v)} />
          )))}
          {rows.length > min && (
            <button type="button" className="rnr-btn rnr-btn-ghost self-start" aria-label={`Remove row ${i + 1} of ${f.label}`} onClick={() => remove(i)}>Remove row</button>
          )}
        </div>
      ))}
      {rows.length < max
        ? <button type="button" className="rnr-btn rnr-btn-secondary self-start" aria-label={`Add a row to ${f.label}`} onClick={add}><PlusIcon />Add row</button>
        : <p className="rnr-caption">You have added the most rows allowed ({max}).</p>}
      {errors[f.key] && <p id={`${id}-err`} className="rnr-error">{errors[f.key]}</p>}
      <p className="sr-only" role="status">{said}</p>
    </fieldset>
  )
}
