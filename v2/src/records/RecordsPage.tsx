import { useState } from 'react'
import { useMemberEmails } from '../members/useMemberEmails'
import { useOrg } from '../rbac/useOrg'
import { Skeleton } from '../ui/Skeleton'
import { Day } from '../ui/Time'
import { nodeById, nodeName } from '../workflows/logic'
import { RECORD_LIMIT, useRecords, type RecordFilter, type RecordRow } from '../workflows/api'
import { RecordStatusMark } from './StatusMark'

const FILTERS: [RecordFilter, string][] = [['all', 'All'], ['open', 'In progress'], ['error', 'Stopped'], ['closed', 'Closed']]

export function RecordsPage() {
  const { orgId, userId } = useOrg()
  const [filter, setFilter] = useState<RecordFilter>('all')
  const emails = useMemberEmails(orgId)
  const list = useRecords(orgId, filter)
  const n = list.data?.length ?? 0
  const who = (id: string) => (id === userId ? 'You' : emails.data?.get(id) ?? 'Former member')
  const reset = () => { setFilter('all'); document.getElementById('records-h')?.focus() }
  const step = (r: RecordRow) => {
    const name = nodeName(r.current_node_id ? nodeById(r.workflow.graph, r.current_node_id) : undefined)
    return r.status === 'done' || r.status === 'rejected' ? <><span className="rnr-muted">Finished at </span>{name}</> : name
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="records-h">
      <h1 id="records-h" tabIndex={-1} className="page-title">Records</h1>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rnr-seg" role="group" aria-label="Show records">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <p className="rnr-caption" role="status">
          {list.data && (n === RECORD_LIMIT ? `Showing the newest ${RECORD_LIMIT} records.` : `${n} ${n === 1 ? 'record' : 'records'}`)}
        </p>
      </div>
      {list.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
      {list.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">We could not load the records. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => list.refetch()}>Try again</button></div>
        </div>
      )}
      {list.data?.length === 0 && filter === 'all' && (
        <div className="rnr-card gap-3">
          <div className="rnr-card" data-state="placeholder" aria-hidden="true">
            <span className="label">Leave approval · Jo Tan</span><span className="rnr-muted">In progress</span>
          </div>
          <h2 className="dialog-title">No records yet</h2>
          <p className="rnr-muted">Records appear here when you start a workflow or a step needs you.</p>
          <div><a className="rnr-btn rnr-btn-primary" href="#/inbox">Go to inbox</a></div>
        </div>
      )}
      {list.data?.length === 0 && filter !== 'all' && (
        <div className="rnr-card gap-3">
          <h2 className="dialog-title">No records match this filter</h2>
          <p className="rnr-muted">Show every record you can view.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={reset}>Show all records</button></div>
        </div>
      )}
      {n > 0 && (
        <div className="rnr-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="rnr-table rnr-sticky-first" aria-busy={list.isPlaceholderData}>
            <caption className="sr-only">Records</caption>
            <thead><tr><th scope="col">Record</th><th scope="col">Status</th><th scope="col">Step</th><th scope="col">Started by</th><th scope="col" className="num">Started</th></tr></thead>
            <tbody>
              {list.data!.map((r) => (
                <tr key={r.id}>
                  <td><a href={`#/records/${r.id}`}>{r.title}</a><br /><span className="rnr-caption">{r.workflow.name}</span></td>
                  <td><RecordStatusMark status={r.status} label={r.label} /></td>
                  <td>{step(r)}</td>
                  <td>{who(r.started_by)}</td>
                  <td className="num"><Day iso={r.created_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
