import { useId, useState, type ChangeEvent } from 'react'

type Props = { label: string; value: string; hint?: string; error?: string | null; multiline?: boolean; inputMode?: 'numeric' | 'decimal'; onCommit(text: string): void }

/** Commit-on-blur (or Enter) input: half-typed text never becomes a broken schema. Follows the stored value when it changes elsewhere. */
export function DraftInput({ label, value, hint, error, multiline, inputMode, onCommit }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) { setSeen(value); setDraft(value) }
  const commit = () => { if (draft !== value) onCommit(draft) }
  const props = {
    id, className: 'rnr-input', value: draft, inputMode,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
  }
  return (
    <div className="rnr-field" data-invalid={error ? true : undefined}>
      <label htmlFor={id} className="rnr-label">{label}</label>
      {hint && <span id={`${id}-hint`} className="rnr-hint">{hint}</span>}
      {multiline ? <textarea rows={4} {...props} /> : <input {...props} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />}
      {error && <p id={`${id}-err`} className="rnr-error">{error}</p>}
    </div>
  )
}
