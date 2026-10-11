import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { BackIcon, CheckIcon, ClockIcon, StopIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { useFocusWhenPresent } from '../ui/useFocusWhenPresent'
import { useNow } from '../ui/useNow'
import { useForm, type SubmitResult } from '../forms/api'
import { FormRunner } from '../forms/fill/FormRunner'
import { uploadFile } from '../forms/upload'
import { validateSchema } from '../forms/logic'
import { AnswerList } from '../forms/submissions/AnswerList'
import { useMemberEmails } from '../members/useMemberEmails'
import { nodeById, nodeName, type FormNode } from '../workflows/logic'
import { stoppedBody } from '../records/status'
import { advance, claimTask, useRecordSubmissions, useTask, type RecordSubmission, type TaskDetail } from '../workflows/api'

type Done = Extract<SubmitResult, { ok: true }>
const VERB = { submitted: 'submitted', approved: 'approved', rejected: 'rejected' } as const
const APPROVE = [{ value: 'approved', label: 'Approve', busyLabel: 'Approving…' }, { value: 'rejected', label: 'Reject', busyLabel: 'Rejecting…' }]
const SETUP = 'This step has a setup problem. Ask a workflow manager to fix it.'

function Card({ children }: { children: ReactNode }) {
  return <div className="rnr-card gap-3">{children}</div>
}

/** Answers are rendered, and files signed, only while the row is open. */
function EarlierRow({ sub, task, initiallyOpen, who }: { sub: RecordSubmission; task: TaskDetail; initiallyOpen: boolean; who: string }) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <li className="rnr-card">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="rnr-focus" style={{ cursor: 'pointer' }}>
          <span className="label">{nodeName(nodeById(task.record.workflow.graph, sub.node_id))}</span>{' '}
          <span className="rnr-muted">· {who} {VERB[sub.outcome]} · <When iso={sub.created_at} /></span>
        </summary>
        {open && sub.form && <div className="pt-3"><AnswerList fields={sub.form.schema} answers={sub.answers} createdAt={sub.created_at} by={who} /></div>}
      </details>
    </li>
  )
}

function Earlier({ task }: { task: TaskDetail }) {
  const { orgId, userId } = useOrg()
  const subs = useRecordSubmissions(task.record_id)
  const emails = useMemberEmails(orgId)
  const who = (id: string) => (id === userId ? 'You' : emails.data?.get(id) ?? 'Former member')
  if (subs.isPending) return <Skeleton rows={[{ w: '100%', h: 48 }]} />
  if (subs.isError) return <p role="alert">We could not load the earlier steps. Reload the page to try again.</p>
  if (!subs.data.length) return null
  return (
    <section className="flex flex-col gap-2" aria-labelledby="earlier-h">
      <h2 id="earlier-h" className="dialog-title">Earlier steps</h2>
      <ul className="flex flex-col gap-2">
        {subs.data.map((s, i) => <EarlierRow key={s.id} sub={s} task={task} initiallyOpen={i === subs.data.length - 1} who={who(s.submitted_by)} />)}
      </ul>
    </section>
  )
}

function MyForm({ task, node, onDone }: { task: TaskDetail; node: FormNode; onDone(r: Done): void }) {
  const { userId } = useOrg()
  const form = useForm(node.formId)
  if (form.isPending) return <Skeleton rows={[{ w: '100%', h: 240 }]} />
  if (form.isError || !form.data || validateSchema(form.data.schema).length) return <Card><p className="rnr-error" role="alert">{SETUP}</p></Card>
  return (
    <section className="rnr-card gap-4" aria-labelledby="mine-h">
      <h2 id="mine-h" tabIndex={-1} className="dialog-title">{node.mode === 'approve' ? 'Your decision' : 'Your answers'}</h2>
      <FormRunner fields={form.data.schema} idPrefix="task" filePrefix={`${task.org_id}/${userId}/`}
        upload={(blob, name) => uploadFile(task.org_id, userId, blob, name)}
        outcomes={node.mode === 'approve' ? APPROVE : undefined}
        onSubmit={(answers, outcome) => advance({ action: 'submit', taskId: task.id, outcome: outcome === 'approved' || outcome === 'rejected' ? outcome : 'submitted', answers })}
        onDone={onDone} />
    </section>
  )
}

function Completed({ task, done }: { task: TaskDetail; done: Done }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const stopped = done.status === 'error'
  const closed = done.status === 'done' || done.status === 'rejected'
  return (
    <Card>
      {stopped ? <span aria-hidden="true"><StopIcon size={24} /></span> : <span className="rnr-pop" aria-hidden="true"><CheckIcon size={24} /></span>}
      <h2 ref={heading} tabIndex={-1} className="dialog-title">Step completed</h2>
      <p className="rnr-muted">
        {stopped ? stoppedBody(done.recordError)
          : closed ? `${task.record.title} has closed as ${done.status}.` : `${task.record.title} has moved on.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="rnr-btn rnr-btn-primary" href={`#/records/${task.record_id}`}>View record</a>
        <a className="rnr-btn rnr-btn-ghost" href="#/inbox">Back to inbox</a>
      </div>
    </Card>
  )
}

function TaskView({ task }: { task: TaskDetail }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const emails = useMemberEmails(orgId)
  const claim = useAction()
  const focusWhenPresent = useFocusWhenPresent()
  const now = useNow()
  const [claimError, setClaimError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const node = nodeById(task.record.workflow.graph, task.node_id)
  const mine = task.assignee_user_id === userId || task.claimed_by === userId
  const overdue = task.status === 'open' && !!task.due_at && Date.parse(task.due_at) < now

  const take = () => claim.run(async () => {
    setClaimError(null)
    try {
      await claimTask(task.id)
      focusWhenPresent('mine-h') // the Claim button unmounts; the form's heading takes focus once it renders
    } catch (e) {
      setClaimError(friendlyError(e as { message?: string; code?: string }))
    }
    await Promise.all([qc.invalidateQueries({ queryKey: ['task', task.id] }), qc.invalidateQueries({ queryKey: ['my-tasks', orgId] })])
  })
  const finished = (r: Done) => {
    setDone(r)
    for (const key of [['my-tasks', orgId], ['task', task.id], ['record', task.record_id], ['record-events', task.record_id], ['record-submissions', task.record_id], ['records', orgId]]) {
      qc.invalidateQueries({ queryKey: key })
    }
  }

  let body: ReactNode
  if (done) body = <Completed task={task} done={done} />
  else if (task.status === 'done') body = <Card><p>This task is already done.</p><div><a className="rnr-btn rnr-btn-secondary" href={`#/records/${task.record_id}`}>View record</a></div></Card>
  else if (task.status === 'cancelled') body = <Card><p>This task was cancelled because the record moved on.</p><div><a className="rnr-btn rnr-btn-secondary" href={`#/records/${task.record_id}`}>View record</a></div></Card>
  else if (!node || node.type !== 'form') body = <Card><p className="rnr-error" role="alert">{SETUP}</p></Card>
  else if (mine) body = <MyForm task={task} node={node} onDone={finished} />
  else if (task.assignee_user_id) body = <Card><p>This task is assigned to someone else. Only they can complete it.</p></Card>
  else if (task.claimed_by) {
    body = (
      <Card>
        <p>{emails.data?.get(task.claimed_by) ?? 'A former member'} has claimed this task.</p>
        <div><a className="rnr-btn rnr-btn-secondary" href="#/inbox">Back to inbox</a></div>
      </Card>
    )
  } else if (task.is_mine) {
    body = (
      <Card>
        <p>Anyone with this role can do this step. Claim it so others know you are on it.</p>
        {claimError && <p className="rnr-error" role="alert">{claimError}</p>}
        <div>
          <button className="rnr-btn rnr-btn-primary" type="button" aria-busy={claim.busy} onClick={take}>
            {claim.busy && <span className="rnr-spin" aria-hidden="true" />}{claim.busy ? 'Claiming…' : 'Claim this task'}
          </button>
        </div>
      </Card>
    )
  } else body = <Card><p>This task is assigned to someone else. Only they can complete it.</p></Card>

  return (
    <section className="flex flex-col gap-4 max-w-2xl" aria-labelledby="task-h">
      <div className="flex flex-col gap-1">
        <h1 id="task-h" tabIndex={-1} className="page-title">{task.record.title}</h1>
        <p className="rnr-muted">{task.record.workflow.name} · {nodeName(node)}{task.due_at && <> · Due <When iso={task.due_at} /></>}</p>
        {overdue && <p className="rnr-status"><ClockIcon size={14} />Overdue</p>}
      </div>
      <Earlier task={task} />
      {body}
    </section>
  )
}

export function TaskPage({ id }: { id: string }) {
  const { orgId } = useOrg()
  const task = useTask(id)
  const notice = (title: string, text: string, action?: ReactNode) => (
    <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">{title}</h1><p className="rnr-muted">{text}</p>{action && <div>{action}</div>}</div>
  )
  return (
    <div className="flex flex-col gap-4">
      <a className="rnr-btn rnr-btn-ghost self-start" href="#/inbox"><BackIcon />Back to inbox</a>
      {task.isPending && <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />}
      {task.isError && notice('We could not load this task', 'Check your connection and try again.',
        <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => task.refetch()}>Try again</button>)}
      {task.isSuccess && (!task.data || task.data.org_id !== orgId) && notice('This task does not exist', 'It may be finished and no longer visible to you, or it belongs to another organisation.')}
      {task.data && task.data.org_id === orgId && <TaskView task={task.data} />}
    </div>
  )
}
