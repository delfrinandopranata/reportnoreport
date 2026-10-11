import { useId, useState } from 'react'
import type { Field } from '../../forms/logic'
import { DraftInput } from '../../forms/builder/DraftInput'
import { RuleEditor } from '../../forms/builder/RuleEditor'
import { useFocusAfterRender } from '../../ui/useFocusAfterRender'
import {
  OUTCOME_LABELS, TYPE_LABELS, UNITS, outcomesOf,
  type Action, type Duration, type Graph, type Outcome, type Unit, type WfNode,
} from '../logic'
import { MessageAction } from './MessageAction'
import { connect, setActions, setNode, stepLabel } from './canvasOps'

export type FormOption = { id: string; name: string; schema: Field[] }
export type MessageCtx = { templates: { id: string; name: string }[]; canManageTemplates: boolean }
type Props = {
  graph: Graph; node: WfNode; open: number; forms: FormOption[]; roles: { id: string; name: string }[]; members: Map<string, string>; messages: MessageCtx
  onChange(g: Graph): void; onDelete(): void; onSay(text: string): void
  /** In the bottom sheet the sheet itself carries the heading. */
  inSheet?: boolean
}

const WHEN: Record<Outcome, string> = {
  submitted: 'When submitted', approved: 'When approved', rejected: 'When rejected', yes: 'If yes', no: 'If no', next: 'Next',
}
const ACTION_TITLES = { set_status: 'Set status', send_message: 'Send message', generate_pdf: 'Generate PDF' } as const
const HINTS = { generate_pdf: "Makes a PDF of the record from the workflow's PDF template. If there is no template, the record stops. A reports manager sets it up from the Workflows list." } as const
const plural = (n: number) => (n === 1 ? ['record is', 'it'] : ['records are', 'them'])

function Select({ label, value, options, onChange, hint }: { label: string; value: string; options: [string, string][]; onChange(v: string): void; hint?: string }) {
  const id = useId()
  return (
    <div className="rnr-field">
      <label className="rnr-label" htmlFor={id}>{label}</label>
      <select id={id} className="rnr-input" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {hint && <p id={`${id}-hint`} className="rnr-hint">{hint}</p>}
    </div>
  )
}

function DurationInput({ label, value, optional, onChange }: { label: string; value?: Duration; optional?: boolean; onChange(d?: Duration): void }) {
  return (
    <fieldset className="rnr-field">
      <legend className="rnr-label">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <DraftInput key={value?.amount ?? ''} label="Amount" inputMode="numeric" value={value ? String(value.amount) : ''}
          hint={optional ? 'Leave empty for no due time.' : undefined}
          onCommit={(t) => onChange(t.trim() === '' && optional ? undefined : { amount: Number.isInteger(Number(t)) ? Number(t) : 0, unit: value?.unit ?? 'days' })} />
        <Select label="Unit" value={value?.unit ?? 'days'} options={UNITS.map((u) => [u, u])} onChange={(u) => onChange({ amount: value?.amount ?? 1, unit: u as Unit })} />
      </div>
    </fieldset>
  )
}

/** Adding is two steps (choose, then press Add): a closed select fires on every ArrowDown, which would add an action per key. */
function ActionList({ edgeId, actions, onChange, onSay, graph, roles, members, fields, messages }: {
  edgeId: string; actions: Action[]; onChange(a: Action[]): void; onSay(t: string): void
  graph: Graph; roles: { id: string; name: string }[]; members: Map<string, string>; fields: Field[]; messages: MessageCtx
}) {
  const id = useId()
  const focusLater = useFocusAfterRender()
  const [choice, setChoice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    if (!choice) { setError('Choose an action to add.'); return }
    setError(null)
    const type = choice as Action['type']
    const next: Action = type === 'set_status' ? { type, label: '' }
      : type === 'send_message' ? { type, templateId: '', recipients: [] }
      : { type: 'generate_pdf' }
    onChange([...actions, next])
    setChoice('')
    onSay(`${ACTION_TITLES[type]} action added.`)
    focusLater(() => {
      const block = document.getElementById(`act-${edgeId}-${actions.length}`)
      return block?.querySelector<HTMLElement>('input') ?? block?.querySelector<HTMLElement>('button') // Status text, else Remove
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="label">Actions</h3>
      <p className="rnr-caption">Actions run in the order you add them.</p>
      {actions.map((a, i) => {
        const title = ACTION_TITLES[a.type as keyof typeof ACTION_TITLES] ?? 'Unknown action'
        return (
          <div key={i} id={`act-${edgeId}-${i}`} className="rnr-block flex-col items-stretch gap-2">
            <div className="flex items-center gap-2">
              <span className="label flex-1">{title}</span>
              <button className="rnr-btn rnr-btn-ghost" type="button" aria-label={`Remove ${title} action`}
                onClick={() => { onChange(actions.filter((_, j) => j !== i)); onSay(`${title} action removed.`) }}>Remove</button>
            </div>
            {a.type === 'set_status'
              ? <DraftInput key={a.label} label="Status text" hint="Shown next to the record's status." value={a.label}
                  onCommit={(t) => onChange(actions.map((x, j) => (j === i ? { type: 'set_status', label: t.trim() } : x)))} />
              : a.type === 'send_message'
                ? <MessageAction action={a} graph={graph} roles={roles} members={members} fields={fields} templates={messages.templates}
                    canManage={messages.canManageTemplates} onSay={onSay} onChange={(n) => onChange(actions.map((x, j) => (j === i ? n : x)))} />
                : a.type in HINTS && <p className="rnr-caption">{HINTS[a.type as keyof typeof HINTS]}</p>}
          </div>
        )
      })}
      <div className="flex items-end gap-2">
        <div className="rnr-field flex-1" data-invalid={error ? true : undefined}>
          <label className="rnr-label" htmlFor={id}>Action to add</label>
          <select id={id} className="rnr-input" value={choice} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => { setChoice(e.target.value); setError(null) }}>
            <option value="">Choose an action…</option>
            <option value="set_status">Set status</option>
            <option value="send_message">Send message</option>
            <option value="generate_pdf">Generate PDF</option>
          </select>
        </div>
        <button className="rnr-btn rnr-btn-secondary" type="button" onClick={add}>Add action</button>
      </div>
      {error && <p id={`${id}-err`} className="rnr-error">{error}</p>}
    </div>
  )
}

/** Answers a Condition or a date-relative Time step can read: every field of the forms this workflow uses. */
function usedFields(graph: Graph, forms: FormOption[]): Field[] {
  const ids = new Set(graph.nodes.flatMap((n) => (n.type === 'start' || n.type === 'form' ? [n.formId] : [])))
  const byKey = new Map<string, Field>()
  for (const f of forms) if (ids.has(f.id)) for (const fld of f.schema) if (fld.type !== 'page_break' && !byKey.has(fld.key)) byKey.set(fld.key, fld)
  return [...byKey.values()]
}

export function SidePanel({ graph, node, open, forms, roles, members, messages, onChange, onDelete, onSay, inSheet }: Props) {
  const update = (n: WfNode) => onChange(setNode(graph, n))
  const choose: [string, string] = ['', 'Choose…']
  const targets: [string, string][] = graph.nodes.filter((n) => n.type !== 'start').map((n) => [n.id, stepLabel(graph, n)])
  const fields = usedFields(graph, forms)
  const name = stepLabel(graph, node)
  const goTo = (o: Outcome, to: string) => {
    onChange(connect(graph, node.id, o, to))
    const target = graph.nodes.find((n) => n.id === to)
    onSay(target ? `${OUTCOME_LABELS[o]} of ${name} now goes to ${stepLabel(graph, target)}.` : `${OUTCOME_LABELS[o]} of ${name} is not connected.`)
  }
  const [recordsAre, them] = plural(open)
  return (
    <section className={inSheet ? 'flex flex-col gap-4' : 'rnr-card gap-4'} aria-labelledby={inSheet ? undefined : 'sp-h'}>
      <div>
        {!inSheet && <h2 id="sp-h" tabIndex={-1} className="dialog-title">{TYPE_LABELS[node.type]} step</h2>}
        <p className="rnr-caption">{name}</p>
      </div>
      <DraftInput key={`${node.id}-label`} label="Step name" hint="Shown on the card and on the record's timeline." value={node.label ?? ''}
        onCommit={(t) => update({ ...node, label: t.trim() || undefined })} />

      {node.type === 'start' && (
        <Select label="Form to start with" value={node.formId} hint="People fill this in to start a record."
          options={[['', 'Choose a form…'], ...forms.map((f): [string, string] => [f.id, f.name])]} onChange={(formId) => update({ ...node, formId })} />
      )}
      {node.type === 'form' && (
        <>
          <Select label="Form" value={node.formId} options={[['', 'Choose a form…'], ...forms.map((f): [string, string] => [f.id, f.name])]} onChange={(formId) => update({ ...node, formId })} />
          <Select label="What they do" value={node.mode} options={[['fill', 'Fill in the form'], ['approve', 'Approve or reject']]}
            hint={node.mode === 'approve' ? 'They see earlier answers, then choose Approve or Reject. Add a comments field to the form if they should explain a rejection.' : undefined}
            onChange={(m) => update({ ...node, mode: m as 'fill' | 'approve' })} />
          <Select label="Who completes it" value={'role' in node.assignee ? 'role' : 'user' in node.assignee ? 'user' : 'step'}
            options={[['role', 'Anyone with a role'], ['user', 'A person'], ['step', 'Whoever submitted an earlier step']]}
            onChange={(k) => update({ ...node, assignee: k === 'role' ? { role: '' } : k === 'user' ? { user: '' } : { step: '' } })} />
          {'role' in node.assignee && <Select label="Role" value={node.assignee.role} options={[choose, ...roles.map((r): [string, string] => [r.id, r.name])]}
            onChange={(role) => update({ ...node, assignee: { role } })} hint="Someone with this role claims the task, then completes it." />}
          {'user' in node.assignee && <Select label="Person" value={node.assignee.user} options={[choose, ...[...members].map(([id, email]): [string, string] => [id, email])]}
            onChange={(user) => update({ ...node, assignee: { user } })} />}
          {'step' in node.assignee && <Select label="Earlier step" value={node.assignee.step}
            options={[choose, ...graph.nodes.filter((n) => (n.type === 'start' || n.type === 'form') && n.id !== node.id).map((n): [string, string] => [n.id, stepLabel(graph, n)])]}
            onChange={(step) => update({ ...node, assignee: { step } })} />}
          <DurationInput label="Due" optional value={node.due} onChange={(due) => update({ ...node, due })} />
        </>
      )}
      {node.type === 'condition' && (
        <div className="flex flex-col gap-2">
          <p className="rnr-hint">Looks at answers from the forms this workflow uses.</p>
          {!fields.length && <p className="rnr-caption">Choose a form on the Start or a Form step first.</p>}
          <RuleEditor required legend="Rule" rule={node.rule} scope={fields} self=""
            onChange={(rule) => update({ ...node, rule: rule ?? { field: '', operator: 'is', value: '' } })} />
        </div>
      )}
      {node.type === 'time' && (
        <>
          <Select label="Continue" value={node.relative ? 'relative' : 'after'} options={[['after', 'After a wait'], ['relative', 'Before or after a date answer']]}
            hint="Waiting steps check once a minute, so a wait can run up to a minute late."
            onChange={(m) => update(m === 'after'
              ? { ...node, after: { amount: 1, unit: 'days' }, relative: undefined }
              : { ...node, after: undefined, relative: { field: '', amount: 1, unit: 'days', direction: 'before' } })} />
          {node.after && <DurationInput label="Wait" value={node.after} onChange={(after) => update({ ...node, after: after ?? { amount: 1, unit: 'days' } })} />}
          {node.relative && (
            <>
              <Select label="Date answer" value={node.relative.field}
                options={[choose, ...fields.filter((f) => f.type === 'date').map((f): [string, string] => [f.key, f.label])]}
                onChange={(field) => update({ ...node, relative: { ...node.relative!, field } })} />
              <DurationInput label="How long" value={{ amount: node.relative.amount, unit: node.relative.unit }}
                onChange={(d) => update({ ...node, relative: { ...node.relative!, amount: d?.amount ?? 0, unit: d?.unit ?? 'days' } })} />
              <Select label="When" value={node.relative.direction} options={[['before', 'Before the date'], ['after', 'After the date']]}
                onChange={(direction) => update({ ...node, relative: { ...node.relative!, direction: direction as 'before' | 'after' } })} />
            </>
          )}
        </>
      )}
      {node.type === 'end' && (
        <Select label="Close the record as" value={node.status} options={[['done', 'Done'], ['rejected', 'Rejected']]}
          onChange={(s) => update({ ...node, status: s as 'done' | 'rejected' })} />
      )}

      {outcomesOf(node).map((o) => {
        const edge = graph.edges.find((e) => e.from === node.id && e.outcome === o)
        return (
          <fieldset key={o} id={`out-${o}`} className="rnr-field wf-outcome">
            <legend className="rnr-label" tabIndex={-1}>{WHEN[o]}</legend>
            {/* The keyboard way to connect: same result as dragging from the card's handle. */}
            <Select label="Goes to" value={edge?.to ?? ''} options={[['', 'Not connected'], ...targets]} onChange={(to) => goTo(o, to)} />
            {edge && <ActionList edgeId={edge.id} actions={edge.actions} onChange={(acts) => onChange(setActions(graph, edge.id, acts))} onSay={onSay}
              graph={graph} roles={roles} members={members} fields={fields} messages={messages} />}
          </fieldset>
        )
      })}

      {open > 0
        ? <p className="rnr-caption" id="del-hint">{open} open {recordsAre} on this step, so it cannot be deleted. Let {them} finish first.</p>
        : <div><button className="rnr-btn rnr-btn-danger" type="button" aria-label={`Delete ${name}`} onClick={onDelete}>Delete step</button></div>}
    </section>
  )
}
