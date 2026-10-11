import { useState, type ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { BackIcon, CheckIcon, ClockIcon, StopIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { AnswerList } from '../forms/submissions/AnswerList'
import { useMemberEmails } from '../members/useMemberEmails'
import { nodeById, nodeName } from '../workflows/logic'
import { useRecord, useRecordEvents, useRecordSubmissions, type RecordRow, type RecordSubmission } from '../workflows/api'
import { MiniCanvas } from '../workflows/canvas/MiniCanvas'
import { PdfPanel } from '../reports/PdfPanel'
import { RecordStatusMark } from './StatusMark'
import { eventIcon, eventNote, eventText } from './timeline'

const ICONS = { clock: ClockIcon, stop: StopIcon, check: CheckIcon, x: XIcon }

/** Answers (and signed file links) are rendered only while the details are open. */
function Answers({ sub, by }: { sub: RecordSubmission; by: string }) {
  const [open, setOpen] = useState(false)
  if (!sub.form) return null
  return (
    <details className="mt-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="rnr-focus" style={{ cursor: 'pointer' }}>Show answers</summary>
      {open && <div className="pt-2"><AnswerList fields={sub.form.schema} answers={sub.answers} createdAt={sub.created_at} by={by} /></div>}
    </details>
  )
}

function RecordView({ rec }: { rec: RecordRow }) {
  const { orgId, userId } = useOrg()
  const events = useRecordEvents(rec.id)
  const subs = useRecordSubmissions(rec.id)
  const emails = useMemberEmails(orgId)
  const graph = rec.workflow.graph
  const who = (id: string | null) => (!id ? null : id === userId ? 'You' : emails.data?.get(id) ?? 'Former member')
  const byId = new Map((subs.data ?? []).map((s) => [s.id, s]))
  const step = nodeName(rec.current_node_id ? nodeById(graph, rec.current_node_id) : undefined)
  const closed = rec.status === 'done' || rec.status === 'rejected'
  return (
    <section className="flex flex-col gap-4" aria-labelledby="rec-h">
      <div className="flex flex-col gap-1">
        <h1 id="rec-h" tabIndex={-1} className="page-title">{rec.title}</h1>
        <p className="rnr-muted">{rec.workflow.name} · started <When iso={rec.created_at} /> by {who(rec.started_by) ?? 'Someone'}</p>
        <div><RecordStatusMark status={rec.status} label={rec.label} /></div>
      </div>
      {rec.status === 'error' && (
        <div className="rnr-card gap-2" role="alert">
          <h2 className="dialog-title">This record stopped</h2>
          <p>{rec.error}</p>
          <p className="rnr-muted">Nothing after this step has run. Ask a workflow manager to fix the workflow, then start a new record.</p>
        </div>
      )}
      <PdfPanel recordId={rec.id} workflowId={rec.workflow_id} recordTitle={rec.title} recordStatus={rec.status} />
      <section className="rnr-card gap-3" aria-labelledby="map-h">
        <h2 id="map-h" className="rnr-card-title">{closed ? `Finished at: ${step}` : `Current step: ${step}`}</h2>
        <MiniCanvas graph={graph} current={rec.current_node_id} />
      </section>
      <section className="rnr-card gap-3" aria-labelledby="timeline-h">
        <h2 id="timeline-h" className="dialog-title">Timeline</h2>
        {(events.isPending || subs.isPending) && <Skeleton rows={[{ w: '100%', h: 32 }, { w: '100%', h: 32 }]} />}
        {(events.isError || subs.isError) && <p role="alert">The timeline did not load. Reload the page to try again.</p>}
        {events.data && subs.data && (
          <ol className="flex flex-col">
            {events.data.map((e) => {
              const sub = typeof e.detail.submissionId === 'string' ? byId.get(e.detail.submissionId) : undefined
              const icon = eventIcon(e)
              const Icon = icon ? ICONS[icon] : null
              return (
                <li key={e.id} className="flex gap-3 py-3 border-t border-line-100 first:border-t-0">
                  <span className="flex-none pt-0.5" style={{ width: 14, color: 'var(--ink-muted)' }} aria-hidden="true">{Icon && <Icon size={14} />}</span>
                  <div className="min-w-0">
                    <p className="label">{eventText(e, graph, who(e.actor_id))}</p>
                    {eventNote(e) && <p className="rnr-caption">{eventNote(e)}</p>}
                    <p className="rnr-caption"><When iso={e.created_at} /></p>
                    {sub && <Answers sub={sub} by={who(sub.submitted_by) ?? 'Someone'} />}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </section>
  )
}

export function RecordPage({ id }: { id: string }) {
  const { orgId } = useOrg()
  const rec = useRecord(id)
  const notice = (title: string, text: string, action?: ReactNode) => (
    <div className="rnr-card gap-3 max-w-xl"><h1 className="page-title">{title}</h1><p className="rnr-muted">{text}</p>{action && <div>{action}</div>}</div>
  )
  return (
    <div className="flex flex-col gap-4">
      <a className="rnr-btn rnr-btn-ghost self-start" href="#/records"><BackIcon />Back to records</a>
      {rec.isPending && <Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />}
      {rec.isError && notice('This record did not load', 'Check your connection and try again.',
        <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => rec.refetch()}>Try again</button>)}
      {rec.isSuccess && (!rec.data || rec.data.org_id !== orgId) && notice('This record does not exist', 'You may not have access to it, or it belongs to another organisation.')}
      {rec.data && rec.data.org_id === orgId && <RecordView rec={rec.data} />}
    </div>
  )
}
