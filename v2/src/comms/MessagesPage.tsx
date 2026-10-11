import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { CheckIcon, ClockIcon, XIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { MESSAGE_LIMIT, retryMessage, useMessages, type MessageFilter, type QueueRow } from './api'
import { attemptsText, problemHint, resultText } from './messageText'

const FILTERS: [MessageFilter, string][] = [['all', 'All'], ['failed', 'Failed'], ['queued', 'Queued'], ['sent', 'Sent']]
const STATUS = {
  queued: { Icon: ClockIcon, word: 'Queued' },
  sent: { Icon: CheckIcon, word: 'Sent' },
  failed: { Icon: XIcon, word: 'Failed' },
} as const
const FILTERED_OUT: Record<Exclude<MessageFilter, 'all'>, string> = {
  failed: 'No failed messages. Everything that was queued has been sent or is waiting.',
  queued: 'Nothing is waiting to be sent.',
  sent: 'Nothing has been sent yet.',
}

export function MessagesPage() {
  const { orgId, orgs } = useOrg()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [announced, setAnnounced] = useState<MessageFilter | null>(null) // set by a click, so the first load stays silent
  const messages = useMessages(orgId, filter)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const rows = messages.data
  const loadingFilter = messages.isPlaceholderData

  const retry = async (m: QueueRow) => {
    if (busy.has(m.id)) return
    setBusy((s) => new Set(s).add(m.id))
    setError(null)
    const { error: e } = await retryMessage(m.id)
    setBusy((s) => { const n = new Set(s); n.delete(m.id); return n })
    await qc.invalidateQueries({ queryKey: ['messages', orgId] }) // refetch on failure too: another admin may have retried it
    const gone = filter !== 'all' && !qc.getQueryData<QueueRow[]>(['messages', orgId, filter])?.some((r) => r.id === m.id)
    if (e) { setError(friendlyError(e)); if (gone) focusLater('messages-h'); return }
    setNotice(`Retried. The message to ${m.recipient_email} will be sent within a minute.`)
    focusLater(filter === 'failed' ? 'messages-h' : `msg-${m.id}`) // under Failed the row leaves; otherwise it stays and says its new status
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="messages-h">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title" id="messages-h" tabIndex={-1}>Messages</h1>
        <button type="button" className="rnr-btn rnr-btn-ghost ml-auto" aria-busy={messages.isFetching} onClick={() => void messages.refetch()}>
          {messages.isFetching && <span className="rnr-spin" aria-hidden="true" />}{messages.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="rnr-muted">Every email waits here until it is sent. Each message is tried up to four times, and failures stay until you retry them.</p>
      <div className="rnr-seg self-start" role="group" aria-label="Show messages">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setAnnounced(value) }}>{label}</button>
        ))}
      </div>
      <p className="sr-only" role="status">{rows && announced === filter && !loadingFilter ? resultText(filter, rows.length) : ''}</p>
      <p className="rnr-caption" role="status">{notice}</p>
      {error && <p className="rnr-error" role="alert">{error}</p>}
      {messages.isPending && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
      {messages.isError && (
        <div className="rnr-card gap-3">
          <p role="alert">The messages did not load. Check your connection and try again.</p>
          <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => void messages.refetch()}>Try again</button></div>
        </div>
      )}
      {rows?.length === 0 && filter === 'all' && (
        <div className="rnr-card gap-3">
          <div className="rnr-card" data-state="placeholder" aria-hidden="true">
            <span className="label">admin@alpha.test</span><span className="rnr-muted">Task assigned · Sent</span>
          </div>
          <h2 className="dialog-title">No messages yet</h2>
          <p className="rnr-muted">Task notices, invitations and workflow messages appear here once they are queued.</p>
        </div>
      )}
      {rows?.length === 0 && filter !== 'all' && <div className="rnr-card"><p className="rnr-muted">{FILTERED_OUT[filter]}</p></div>}
      {!!rows?.length && (
        <>
          <div className="rnr-card rnr-table-card" aria-busy={loadingFilter}>
            <table className="rnr-table rnr-sticky-first">
              <caption className="sr-only">Messages for {orgs.find((o) => o.id === orgId)?.name ?? 'this organisation'}, newest first</caption>
              <thead><tr><th scope="col">Message</th><th scope="col">Status</th><th scope="col">Problem</th><th scope="col" className="num">When</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const { Icon, word } = STATUS[m.status]
                  const tried = attemptsText(m)
                  const hint = problemHint(m)
                  return (
                    <tr key={m.id} id={`msg-${m.id}`} tabIndex={-1}>
                      <td><span className="label">{m.recipient_email}</span><br /><span className="rnr-caption">{m.subject}</span></td>
                      <td className="whitespace-nowrap">
                        <span className="rnr-status"><Icon size={14} />{word}</span>
                        {tried && <><br /><span className="rnr-caption">{tried}</span></>}
                      </td>
                      <td className="rnr-problem">
                        {m.error}
                        {hint && <>{m.error && <br />}<span className="rnr-caption">{hint}</span></>}
                      </td>
                      <td className="num whitespace-nowrap"><When iso={m.sent_at ?? m.created_at} /></td>
                      <td>
                        <div className="flex justify-end whitespace-nowrap">
                          {m.status === 'failed' && (
                            <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={busy.has(m.id)} aria-label={`Retry message to ${m.recipient_email}`} onClick={() => void retry(m)}>
                              {busy.has(m.id) && <span className="rnr-spin" aria-hidden="true" />}{busy.has(m.id) ? 'Retrying…' : 'Retry'}
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
          {rows.length === MESSAGE_LIMIT && <p className="rnr-caption">Showing the newest {MESSAGE_LIMIT}. Filter to Failed to find problems quickly.</p>}
        </>
      )}
    </section>
  )
}
