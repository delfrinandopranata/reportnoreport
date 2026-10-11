import { useState } from 'react'
import { KEY_RE, compile, type Field, type SchemaIssue } from '../logic'
import { FolderCard } from '../../ui/FolderCard'
import { DraftInput } from './DraftInput'
import { RuleEditor } from './RuleEditor'
import { typeLabel } from './builderOps'

type Props = { idBase: string; field: Field; scope: Field[]; taken: string[]; issues: SchemaIssue[]; onChange(f: Field): void; onRemove(): void }

const DEFAULT_ROWS = { min: 0, max: 5 }

/** Row limits keep text while typing, so clearing the box never stores NaN; a number is committed on blur. */
function RowLimits({ idBase, repeat, onChange }: { idBase: string; repeat: { min: number; max: number }; onChange(r: { min: number; max: number }): void }) {
  const [text, setText] = useState({ min: String(repeat.min), max: String(repeat.max) })
  const commit = (k: 'min' | 'max') => {
    const n = Number(text[k])
    if (text[k].trim() === '' || !Number.isFinite(n)) return setText({ ...text, [k]: String(repeat[k]) })
    onChange({ ...repeat, [k]: Math.trunc(n) })
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {(['min', 'max'] as const).map((k) => (
        <div key={k} className="rnr-field">
          <label htmlFor={`${idBase}-${k}`} className="rnr-label">{k === 'min' ? 'Fewest rows' : 'Most rows'}</label>
          <input id={`${idBase}-${k}`} className="rnr-input rnr-num" type="number" min={0} max={50} step={1} aria-describedby={`${idBase}-rows-hint`}
            value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} onBlur={() => commit(k)} />
        </div>
      ))}
      <span id={`${idBase}-rows-hint`} className="rnr-hint col-span-2">Between 0 and 50. The fewest rows must not be more than the most.</span>
    </div>
  )
}

export function FieldSettings({ idBase, field: f, scope, taken, issues, onChange, onRemove }: Props) {
  const [keyError, setKeyError] = useState<{ for: string; text: string } | null>(null)
  const [formulaSeen, setFormulaSeen] = useState<string | null>(null)
  const set = (patch: Partial<Field>) => onChange({ ...f, ...patch })
  const formula = f.type === 'calculated' ? compile(f.expression ?? '') : null
  const formulaError = formula && !formula.ok && formulaSeen === f.key ? formula.error : null
  const commitKey = (k: string) => {
    const fail = (text: string) => setKeyError({ for: f.key, text })
    if (!KEY_RE.test(k)) return fail('Use lowercase letters, numbers and underscores, starting with a letter.')
    if (taken.includes(k)) return fail('Another field already uses this key. Choose a different one.')
    setKeyError(null)
    set({ key: k })
  }
  return (
    <FolderCard tab={<h2 id={`${idBase}-h`} tabIndex={-1}>{typeLabel(f.type)} settings</h2>}>
      <div className="grid gap-4">
      {issues.length > 0 && <ul className="rnr-error">{issues.map((i) => <li key={i.message}>{i.message}</li>)}</ul>}
      <div className="rnr-field">
        <label htmlFor={`${idBase}-label`} className="rnr-label">{f.type === 'page_break' ? 'Page title' : 'Label'}</label>
        <input id={`${idBase}-label`} className="rnr-input" maxLength={200} value={f.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
      </div>
      <DraftInput label="Key" hint="Used in rules and formulas. Changing it breaks anything that uses the old key."
        value={f.key} error={keyError?.for === f.key ? keyError.text : null} onCommit={commitKey} />
      {f.type !== 'page_break' && (
        <div className="rnr-field">
          <label htmlFor={`${idBase}-help`} className="rnr-label">Help text</label>
          {f.type === 'file' && <span className="rnr-hint">People can upload one file, up to 10 MB.</span>}
          {f.type === 'signature' && <span className="rnr-hint">People draw it or type their name.</span>}
          <textarea id={`${idBase}-help`} className="rnr-input" rows={2} maxLength={500} value={f.help ?? ''} onChange={(e) => set({ help: e.target.value || undefined })} />
        </div>
      )}
      {(f.type === 'single_select' || f.type === 'multi_select') && (
        <DraftInput multiline label="Options" hint="One option per line." value={(f.options ?? []).join('\n')}
          onCommit={(t) => set({ options: t.split('\n').map((s) => s.trim()).filter(Boolean) })} />
      )}
      {f.type === 'group' && <RowLimits key={f.key} idBase={idBase} repeat={f.repeat ?? DEFAULT_ROWS} onChange={(repeat) => set({ repeat })} />}
      {f.type === 'calculated' && (
        <div className="rnr-field" data-invalid={formulaError ? true : undefined}>
          <label htmlFor={`${idBase}-expr`} className="rnr-label">Formula</label>
          <span id={`${idBase}-expr-hint`} className="rnr-hint">Use + - * / or × ÷ −, brackets, field keys, and sum, count, min, max, days_between, round, if. Example: days_between(start, end) + 1</span>
          <input id={`${idBase}-expr`} className="rnr-input" maxLength={500} spellCheck={false} autoCapitalize="off" value={f.expression ?? ''}
            aria-invalid={formulaError ? true : undefined}
            aria-describedby={`${idBase}-expr-hint${formulaError ? ` ${idBase}-expr-err` : ''}`}
            onChange={(e) => set({ expression: e.target.value })} onBlur={() => setFormulaSeen(f.key)} />
          {formulaError && <p id={`${idBase}-expr-err`} className="rnr-error">{formulaError}</p>}
        </div>
      )}
      {f.type !== 'page_break' && f.type !== 'calculated' && (
        <label className="rnr-check">
          <input type="checkbox" checked={!!f.required} onChange={(e) => set({ required: e.target.checked || undefined })} />Required
        </label>
      )}
      {f.type !== 'page_break' && <RuleEditor rule={f.show_if} scope={scope} self={f.key} onChange={(show_if) => set({ show_if })} />}
      <div><button type="button" className="rnr-btn rnr-btn-danger" aria-label={`Remove ${f.label || typeLabel(f.type)}`} onClick={onRemove}>Remove field</button></div>
      </div>
    </FolderCard>
  )
}
