import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemberEmails } from '../members/useMemberEmails'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { CheckIcon, ClockIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useFocusWhenPresent } from '../ui/useFocusWhenPresent'
import { useNow } from '../ui/useNow'
import { useNotice } from '../ui/useNotice'
import { nodeById, nodeName } from '../workflows/logic'
import { claimTask, useMyTasks, useStartable, type MyTask } from '../workflows/api'

export function InboxPage() {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const tasks = useMyTasks(orgId)
  const startable = useStartable(orgId)
  const emails = useMemberEmails(orgId)
  const [claiming, setClaiming] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const focusWhenPresent = useFocusWhenPresent()
  const now = useNow()

  const take = async (t: MyTask) => {
    if (claiming.has(t.id)) return
    setError(null)
    setClaiming((s) => new Set(s).add(t.id))
    try {
      await claimTask(t.id)
      setNotice(`You claimed ${t.record.title}.`)
      focusWhenPresent(`open-${t.id}`) // the Open link replaces Claim once the refetch renders
    } catch (e) {
      setError(friendlyError(e as { message?: string; code?: string }))
      focusLater('inbox-h') // the row may be gone: someone else claimed it first
    } finally {
      await qc.invalidateQueries({ queryKey: ['my-tasks', orgId] })
      setClaiming((s) => { const next = new Set(s); next.delete(t.id); return next })
    }
  }
  const who = (t: MyTask) => {
    if (t.claimed_by === userId) return 'Claimed by you'
    if (t.claimed_by) return `Claimed by ${emails.data?.get(t.claimed_by) ?? 'a former member'}`
    return t.assignee_role_id ? 'Not claimed yet' : null
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="inbox-h">
      <h1 id="inbox-h" tabIndex={-1} className="page-title">Inbox</h1>
      <section className="flex flex-col gap-3" aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="dialog-title">My tasks</h2>
        {error && <p className="rnr-error" role="alert">{error}</p>}
        <p className="rnr-status" role="status">{notice && <><CheckIcon size={14} />{notice}</>}</p>
        {tasks.isPending && <Skeleton rows={[{ w: '100%', h: 48 }, { w: '100%', h: 48 }]} />}
        {tasks.isError && (
          <div className="rnr-card gap-3">
            <p role="alert">Your tasks did not load. Check your connection and try again.</p>
            <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => tasks.refetch()}>Try again</button></div>
          </div>
        )}
        {tasks.data?.length === 0 && (
          <div className="rnr-card gap-2">
            <h3 className="dialog-title">Nothing to do</h3>
            <p className="rnr-muted">When a step needs you, or a role you hold, it appears here. You can start a workflow below.</p>
          </div>
        )}
        {!!tasks.data?.length && (
          <div className="rnr-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rnr-table rnr-sticky-first">
              <caption className="sr-only">Your open tasks</caption>
              <thead><tr><th scope="col">Record</th><th scope="col">Step</th><th scope="col" className="num">Due</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {tasks.data.map((t) => {
                  const mine = t.assignee_user_id === userId || t.claimed_by === userId
                  const overdue = !!t.due_at && Date.parse(t.due_at) < now
                  const line = who(t)
                  const busy = claiming.has(t.id)
                  return (
                    <tr key={t.id}>
                      <td><span className="label">{t.record.title}</span><br /><span className="rnr-caption">{t.record.workflow.name}</span></td>
                      <td>{nodeName(nodeById(t.record.workflow.graph, t.node_id))}{line && <><br /><span className="rnr-caption">{line}</span></>}</td>
                      <td className="num">
                        {t.due_at ? <When iso={t.due_at} /> : <span className="rnr-muted">No due date</span>}
                        {overdue && <div className="rnr-status justify-end"><ClockIcon size={14} />Overdue</div>}
                      </td>
                      <td>
                        <div className="flex justify-end">
                          {mine
                            ? <a id={`open-${t.id}`} className="rnr-btn rnr-btn-secondary" href={`#/tasks/${t.id}`} aria-label={`Open ${t.record.title}`}>Open</a>
                            : !t.claimed_by && (
                              <button className="rnr-btn rnr-btn-secondary" type="button" aria-busy={busy} aria-label={`Claim ${t.record.title}`} onClick={() => take(t)}>
                                {busy && <span className="rnr-spin" aria-hidden="true" />}{busy ? 'Claiming…' : 'Claim'}
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="new-h">
        <h2 id="new-h" className="dialog-title">Start new</h2>
        {startable.isPending && <Skeleton rows={[{ w: '100%', h: 48 }]} />}
        {startable.isError && (
          <div className="rnr-card gap-3">
            <p role="alert">The workflows you can start did not load. Check your connection and try again.</p>
            <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => startable.refetch()}>Try again</button></div>
          </div>
        )}
        {startable.data?.length === 0 && (
          <div className="rnr-card gap-2">
            <h3 className="dialog-title">No workflows to start</h3>
            <p className="rnr-muted">When a workflow manager publishes a workflow you have access to, it appears here.</p>
          </div>
        )}
        {!!startable.data?.length && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {startable.data.map((w) => (
              <li key={w.id} className="rnr-card gap-2">
                <span className="label">{w.name}</span>
                <div><a className="rnr-btn rnr-btn-secondary" href={`#/start/${w.id}`} aria-label={`Start ${w.name}`}>Start</a></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
