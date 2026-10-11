import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { friendlyError } from '../ui/errors'
import { CheckIcon, ClockIcon, NAV_ICONS, XIcon } from '../ui/icons'
import { LoadError, Note } from '../ui/Note'
import { PageHead } from '../ui/PageHead'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useFocusAfterRender } from '../ui/useFocusAfterRender'
import { useNotice } from '../ui/useNotice'
import { retryMessage, useMessages, type MessageFilter, type QueueRow } from './api'
import { lastPage, pageText, type MessageSource } from './messageQuery'
import { attemptsText, problemHint, resultText } from './messageText'

const FILTERS: [MessageFilter, string][] = [['all', 'All'], ['failed', 'Failed'], ['queued', 'Queued'], ['sent', 'Sent']]
const SOURCES: [MessageSource, string][] = [['system', 'System'], ['campaign', 'Campaign'], ['all', 'All']]
const STATUS = {
  queued: { Icon: ClockIcon, word: 'Queued' },
  sent: { Icon: CheckIcon, word: 'Sent' },
  failed: { Icon: XIcon, word: 'Failed' },
} as const
const TONE = { queued: 'info', sent: 'ok', failed: 'down' } as const
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
  const [source, setSource] = useState<MessageSource>('system') // operational failures stay in view; campaign mail is one press away
  const [page, setPage] = useState(1)
  const messages = useMessages(orgId, source, filter, page)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useNotice()
  const focusLater = useFocusAfterRender()
  const rows = messages.data?.rows
  const total = messages.data?.total ?? 0
  const last = lastPage(total)
  if (messages.data && page > last) setPage(last)
  const loadingFilter = messages.isPlaceholderData

  const retry = async (m: QueueRow) => {
    if (busy.has(m.id)) return
    setBusy((s) => new Set(s).add(m.id))
    setError(null)
    const { error: e } = await retryMessage(m.id)
    setBusy((s) => { const n = new Set(s); n.delete(m.id); return n })
    await qc.invalidateQueries({ queryKey: ['messages', orgId] }) // refetch on failure too: another admin may have retried it
    const gone = filter !== 'all' && !qc.getQueryData<{ rows: QueueRow[] }>(['messages', orgId, source, filter, page])?.rows.some((r) => r.id === m.id)
    if (e) { setError(friendlyError(e)); if (gone) focusLater('messages-h'); return }
    setNotice(`Retried. The message to ${m.recipient_email} will be sent within a minute.`)
    focusLater(filter === 'failed' ? 'messages-h' : `msg-${m.id}`) // under Failed the row leaves; otherwise it stays and says its new status
  }

  return (
    <section aria-labelledby="messages-h">
      <PageHead id="messages-h" crumb="Admin · Messages" title="Messages" lede="Every email waits here until it is sent. Each message is tried up to four times, and failures stay until you retry them.">
        <button type="button" className="rnr-btn rnr-btn-ghost" aria-busy={messages.isFetching} onClick={() => void messages.refetch()}>
          {messages.isFetching && <span className="rnr-spin" aria-hidden="true" />}{messages.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </PageHead>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="rnr-seg self-start" role="group" aria-label="Source">
            {SOURCES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={source === value} onClick={() => { setSource(value); setPage(1); setAnnounced(filter) }}>{label}</button>
            ))}
          </div>
          <div className="rnr-seg self-start" role="group" aria-label="Status">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setAnnounced(value) }}>{label}</button>
            ))}
          </div>
        </div>
        <p className="sr-only" role="status">{rows && announced === filter && !loadingFilter ? resultText(filter, total) : ''}</p>
        <p className="rnr-caption" role="status">{notice}</p>
        {error && <Note role="alert">{error}</Note>}
        {messages.isPending && <Skeleton rows={[{ w: '100%', h: 240 }]} />}
        {messages.isError && <LoadError what="The messages" onRetry={() => void messages.refetch()} />}
        {rows?.length === 0 && filter === 'all' && source !== 'campaign' && (
          <div className="rnr-empty">
            <span className="rnr-kind"><NAV_ICONS.messages size={20} /></span>
            <h2>No messages yet</h2>
            <p>Task notices, invitations and workflow messages appear here once they are queued.</p>
          </div>
        )}
        {rows?.length === 0 && (filter !== 'all' || source === 'campaign') && (
          <div className="rnr-empty">
            <span className="rnr-kind"><NAV_ICONS.messages size={20} /></span>
            <h2>{filter === 'all' ? 'No campaign messages yet' : 'Nothing matches these filters'}</h2>
            <p>{filter === 'all' ? 'Messages from campaigns appear here once they are queued.' : FILTERED_OUT[filter]}</p>
          </div>
        )}
        {!!rows?.length && (
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
                      <th scope="row"><span className="font-medium">{m.recipient_email}</span><br /><span className="rnr-caption">{m.subject}</span>{m.campaign_id && <><br /><a className="rnr-caption rnr-link underline" href={`#/campaigns/${m.campaign_id}`}>Campaign: {m.campaign?.name ?? 'Open the campaign'}</a></>}</th>
                      <td className="whitespace-nowrap">
                        <span className="rnr-status" data-tone={TONE[m.status]}><Icon size={14} />{word}</span>
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
                            <button type="button" className="rnr-btn rnr-btn-secondary rnr-btn-sm" aria-busy={busy.has(m.id)} aria-label={`Retry message to ${m.recipient_email}`} onClick={() => void retry(m)}>
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
            <nav className="rnr-pager" aria-label="Message pages">
              <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page <= 1 || undefined} onClick={() => page > 1 && setPage(page - 1)}>Previous</button>
              <span className="rnr-num" aria-live="polite">{pageText(page, total)}</span>
              <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page >= last || undefined} onClick={() => page < last && setPage(page + 1)}>Next</button>
              {messages.isFetching && <span className="rnr-spin" aria-hidden="true" />}
            </nav>
          </div>
        )}
      </div>
    </section>
  )
}
