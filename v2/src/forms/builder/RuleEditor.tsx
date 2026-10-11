import { useId } from 'react'
import { OPERATORS, type Field, type Operator, type Rule } from '../logic'
import { DraftInput } from './DraftInput'
import { parseValue, ruleTarget, rulePaths, valueText } from './builderOps'

const OP_LABELS: Record<Operator, string> = {
  is: 'is', is_not: 'is not', is_one_of: 'is one of', contains: 'contains', is_empty: 'is empty',
  is_not_empty: 'is not empty', gt: 'is more than', lt: 'is less than', within_days: 'is within … days of today',
}

/** `required` drops the on/off checkbox: a workflow Condition always has a rule. */
type Props = { rule?: Rule; scope: Field[]; self: string; onChange(rule?: Rule): void; required?: boolean; legend?: string }

function ValueControl({ rule, target, onChange }: { rule: Rule; target?: Field; onChange(r: Rule): void }) {
  const id = useId()
  const op = rule.operator
  const options = target?.options
  if (op === 'is_empty' || op === 'is_not_empty') return null
  if (op === 'within_days') {
    return <DraftInput label="Days" inputMode="numeric" value={valueText(rule.value)} onCommit={(t) => onChange({ ...rule, value: parseValue(op, t) })} />
  }
  if (options && op === 'is_one_of') {
    const picked = Array.isArray(rule.value) ? (rule.value as string[]) : []
    return (
      <fieldset className="rnr-field">
        <legend className="rnr-label">Value</legend>
        {options.map((o) => (
          <label key={o} className="rnr-check">
            <input type="checkbox" checked={picked.includes(o)}
              onChange={(e) => onChange({ ...rule, value: e.target.checked ? [...picked, o] : picked.filter((x) => x !== o) })} />{o}
          </label>
        ))}
      </fieldset>
    )
  }
  const select = (choices: { value: string; label: string }[], current: string, set: (v: string) => void) => (
    <div className="rnr-field">
      <label htmlFor={id} className="rnr-label">Value</label>
      <select id={id} className="rnr-input" value={current} onChange={(e) => set(e.target.value)}>
        <option value="">Choose a value</option>
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </div>
  )
  if (options) return select(options.map((o) => ({ value: o, label: o })), valueText(rule.value), (v) => onChange({ ...rule, value: v || undefined }))
  if (target?.type === 'checkbox') {
    return select([{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], valueText(rule.value),
      (v) => onChange({ ...rule, value: v === '' ? undefined : v === 'true' }))
  }
  if (target?.type === 'date') {
    return (
      <div className="rnr-field">
        <label htmlFor={id} className="rnr-label">Value</label>
        <input id={id} className="rnr-input" type="date" value={valueText(rule.value)} onChange={(e) => onChange({ ...rule, value: e.target.value || undefined })} />
      </div>
    )
  }
  return <DraftInput label="Value" hint={op === 'is_one_of' ? 'Separate values with commas.' : undefined}
    value={valueText(rule.value)} onCommit={(t) => onChange({ ...rule, value: parseValue(op, t) })} />
}

export function RuleEditor({ rule, scope, self, onChange, required, legend = 'Show this field' }: Props) {
  const uid = useId()
  const paths = rulePaths(scope, self)
  const missing = rule && !paths.some((p) => p.value === rule.field)
  return (
    <fieldset className="rnr-filter">
      <legend className="rnr-label">{legend}</legend>
      {!required && <label className="rnr-check">
        <input type="checkbox" checked={!!rule} disabled={!rule && !paths.length}
          onChange={(e) => onChange(e.target.checked ? { field: paths[0]?.value ?? '', operator: 'is_not_empty' } : undefined)} />
        Only when a condition is met
      </label>}
      {!rule && !paths.length && !required && <span className="rnr-hint">Add another field first to use as a condition.</span>}
      {rule && (
        <div className="grid gap-3">
          <div className="rnr-field">
            <label htmlFor={`${uid}-f`} className="rnr-label">Field</label>
            <select id={`${uid}-f`} className="rnr-input" value={rule.field} onChange={(e) => onChange({ field: e.target.value, operator: rule.operator })}>
              {missing && <option value={rule.field}>{rule.field ? `${rule.field} (no longer exists)` : 'Choose a field'}</option>}
              {paths.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="rnr-field">
            <label htmlFor={`${uid}-o`} className="rnr-label">Condition</label>
            <select id={`${uid}-o`} className="rnr-input" value={rule.operator} onChange={(e) => onChange({ field: rule.field, operator: e.target.value as Operator })}>
              {OPERATORS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
            </select>
          </div>
          <ValueControl key={`${rule.field}:${rule.operator}`} rule={rule} target={ruleTarget(scope, rule.field)} onChange={onChange} />
        </div>
      )}
    </fieldset>
  )
}
