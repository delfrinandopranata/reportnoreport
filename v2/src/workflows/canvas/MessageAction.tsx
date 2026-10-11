import { useId, useState } from 'react'
import type { Field } from '../../forms/logic'
import { readRecipient, type Recipient } from '../../comms/logic'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import type { Action, Graph } from '../logic'
import { stepLabel } from './canvasOps'

type Kind = 'role' | 'user' | 'starter' | 'step' | 'field'
const KINDS: [Kind, string, string][] = [
  ['role', 'Everyone with a role', 'Role'], ['user', 'A person', 'Person'], ['starter', 'The person who started the record', ''],
  ['step', 'The person who completed a step', 'Step'], ['field', 'An email address from an answer', 'Answer'],
]
type Send = Extract<Action, { type: 'send_message' }>
type Props = {
  action: Send; graph: Graph; roles: { id: string; name: string }[]; members: Map<string, string>
  templates: { id: string; name: string }[]; fields: Field[]; canManage: boolean
  onChange(a: Send): void; onSay(t: string): void
}

/** One Send message action: its template and its recipients. Adding a recipient is two steps, like adding an action. */
export function MessageAction({ action, graph, roles, members, templates, fields, canManage, onChange, onSay }: Props) {
  const id = useId()
  const focusLater = useFocusAfterRender()
  const [kind, setKind] = useState<Kind | ''>('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recipients = Array.isArray(action.recipients) ? action.recipients : []
  const steps = graph.nodes.filter((n) => n.type === 'start' || n.type === 'form')
  const options: Record<Kind, [string, string][]> = {
    role: roles.map((r) => [r.id, r.name]),
    user: [...members].map(([uid, email]) => [uid, email]),
    starter: [],
    step: steps.map((n) => [n.id, stepLabel(graph, n)]),
    field: fields.filter((x) => x.type === 'short_text').map((x) => [x.key, x.label || x.key]),
  }
  const describe = (r: Recipient) => {
    if ('starter' in r) return 'The person who started the record'
    if ('role' in r) return `Everyone with the role ${roles.find((x) => x.id === r.role)?.name ?? '(deleted role)'}`
    if ('user' in r) return members.get(r.user) ?? 'A former member'
    if ('step' in r) {
      const n = graph.nodes.find((x) => x.id === r.step)
      return `Whoever completed ${n ? stepLabel(graph, n) : '(deleted step)'}`
    }
    return `The email in the answer ${fields.find((x) => x.key === r.field)?.label ?? r.field}`
  }
  const add = () => {
    const empty = !kind || (kind !== 'starter' && !target)
    const r = empty ? null : readRecipient(kind === 'starter' ? { starter: true } : { [kind]: target })
    if (!r) {
      setError('Choose who to send to.')
      focusLater(`${id}-${!kind ? 'k' : 'v'}`)
      return
    }
    onChange({ ...action, recipients: [...recipients, r] })
    setKind('')
    setTarget('')
    setError(null)
    onSay(`${describe(r)} added as a recipient.`)
    focusLater(`${id}-k`)
  }
  const remove = (i: number) => {
    const r = recipients[i]
    onChange({ ...action, recipients: recipients.filter((_, j) => j !== i) })
    onSay(`${describe(r)} removed.`)
    focusLater(i > 0 ? `${id}-rm-${i - 1}` : recipients.length > 1 ? `${id}-rm-0` : `${id}-k`)
  }
  const stale = !!action.templateId && !templates.some((t) => t.id === action.templateId)

  return (
    <div className="flex flex-col gap-2">
      <div className="rnr-field">
        <label className="rnr-label" htmlFor={`${id}-t`}>Template</label>
        <select id={`${id}-t`} className="rnr-input" value={action.templateId ?? ''} onChange={(e) => onChange({ ...action, templateId: e.target.value })}>
          <option value="">Choose a template…</option>
          {stale && <option value={action.templateId}>Deleted template</option>}
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {canManage && <a className="rnr-btn rnr-btn-ghost self-start" href="#/templates">Manage templates</a>}
      <fieldset className="rnr-field gap-2">
        <legend className="rnr-label">Send to</legend>
        {recipients.length === 0 && <p className="rnr-caption">No recipients yet.</p>}
        <ul className="flex flex-col gap-1">
          {recipients.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex-1">{describe(r)}</span>
              <button type="button" id={`${id}-rm-${i}`} className="rnr-btn rnr-btn-ghost" aria-label={`Remove recipient: ${describe(r)}`} onClick={() => remove(i)}>Remove</button>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="rnr-field" data-invalid={error ? true : undefined}>
        <label className="rnr-label" htmlFor={`${id}-k`}>Recipient to add</label>
        <select id={`${id}-k`} className="rnr-input" value={kind} aria-invalid={error && !kind ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => { setKind(e.target.value as Kind | ''); setTarget(''); setError(null) }}>
          <option value="">Choose who…</option>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {kind && kind !== 'starter' && (
        <div className="rnr-field" data-invalid={error ? true : undefined}>
          <label className="rnr-label" htmlFor={`${id}-v`}>{KINDS.find(([v]) => v === kind)?.[2]}</label>
          <select id={`${id}-v`} className="rnr-input" value={target} aria-invalid={error && !target ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => { setTarget(e.target.value); setError(null) }}>
            <option value="">Choose…</option>
            {options[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
      {error && <p id={`${id}-err`} className="rnr-error">{error}</p>}
      <button type="button" className="rnr-btn rnr-btn-secondary self-start" onClick={add}>Add recipient</button>
      <p className="rnr-caption">Each person gets an in-app notification. Email also goes out if the template is set to email and they have not turned it off.</p>
    </div>
  )
}
