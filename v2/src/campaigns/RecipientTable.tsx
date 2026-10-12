import { useState } from 'react'
import { CheckIcon, ClockIcon, DownloadIcon, XIcon } from '../ui/icons'
import { FolderCard } from '../ui/FolderCard'
import { Note } from '../ui/Note'
import { Skeleton } from '../ui/Skeleton'
import { When } from '../ui/Time'
import { useAction } from '../ui/useAction'
import { csvFilename } from '../reports/logic'
import { RECIPIENT_PAGE, downloadRecipients, useRecipients, type Campaign, type RecipientFilter } from './api'
import { recipientStatus } from './labels'
import { RECIPIENT_STATUS, type RecipientRow } from './logic'

const time = (iso: string | null) => (iso ? <When iso={iso} /> : <span className="rnr-muted">Not yet</span>)
const ICONS = { queued: ClockIcon, sent: CheckIcon, failed: XIcon, bounced: XIcon }
const TONES = { queued: 'info', sent: 'ok', failed: 'down', bounced: 'down' } as const
const WORDS = { ...RECIPIENT_STATUS, bounced: 'Bounced' } as Record<string, string>
const pageText = (page: number, total: number) => `Showing ${((page - 1) * RECIPIENT_PAGE + 1).toLocaleString('en-GB')}–${Math.min(page * RECIPIENT_PAGE, total).toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}`

function Status({ row }: { row: RecipientRow }) {
  const s = recipientStatus(row)
  const Icon = ICONS[s]
  return (
    <>
      <span className="rnr-status" data-tone={TONES[s]}><Icon size={14} />{WORDS[s]}</span>
      {s === 'queued' && row.error && <p className="rnr-caption">Will try again automatically.</p>}
    </>
  )
}

export function RecipientTable({ campaign: c }: { campaign: Campaign }) {
  const inApp = c.channel === 'in_app'
  const [filter, setFilter] = useState<RecipientFilter>('all')
  const [page, setPage] = useState(1)
  const q = useRecipients(c.id, filter, page, c.status === 'sending')
  const dl = useAction()
  const [dlNote, setDlNote] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)
  const filters: [RecipientFilter, string][] = inApp
    ? [['all', 'Everyone'], ['not_opened', 'Not read']]
    : [['all', 'Everyone'], ['not_opened', 'Not opened'], ['bounced', 'Bounced'], ['failed', 'Failed']]
  const empty: Record<RecipientFilter, string> = {
    all: 'Nobody received this campaign.', not_opened: inApp ? 'Everyone read it.' : 'Everyone opened it.', bounced: 'Nothing bounced.', failed: 'No email failed.',
  }
  const total = q.data?.total ?? 0
  const last = Math.max(1, Math.ceil(total / RECIPIENT_PAGE))
  if (q.data && page > last) setPage(last) // the list shrank under the reader
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const filename = csvFilename(c.name, today)
  const download = () => dl.run(async () => {
    setDlNote(null); setDlError(null)
    const r = await downloadRecipients(c)
    if ('error' in r) setDlError(r.error)
    else setDlNote(`Downloaded ${r.filename}.`)
  })

  return (
    <FolderCard tab="Recipient list" headingId="recipients-h">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rnr-seg self-start" role="group" aria-label="Show">
            {filters.map(([f, label]) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setPage(1) }}>{label}</button>
            ))}
          </div>
          <button type="button" className="rnr-btn rnr-btn-secondary" aria-busy={dl.busy} onClick={() => void download()}>
            {dl.busy ? <span className="rnr-spin" aria-hidden="true" /> : <DownloadIcon />}{dl.busy ? 'Preparing CSV…' : 'Download CSV'}
          </button>
        </div>
        <p className="rnr-caption">Saves every recipient as {filename}, not just the ones shown here.</p>
        <p className="rnr-caption" role="status">{dlNote}</p>
        {dlError && <Note role="alert">{dlError}</Note>}
        {q.isPending && <Skeleton rows={[{ w: '100%', h: 160 }]} />}
        {q.isError && (
          <div className="flex flex-col items-start gap-2">
            <Note role="alert">The recipients did not load. Check your connection and try again.</Note>
            <button type="button" className="rnr-btn rnr-btn-secondary" onClick={() => void q.refetch()}>Try again</button>
          </div>
        )}
        {q.data && !q.data.rows.length && <p className="rnr-muted">{empty[filter]}</p>}
        {q.data && !!q.data.rows.length && (
          <div className="rnr-card rnr-table-card" aria-busy={q.isFetching || undefined}>
            <table className="rnr-table rnr-sticky-first">
              <caption className="sr-only">Recipients of {c.name}</caption>
              <thead>
                {inApp
                  ? <tr><th scope="col">Email</th><th scope="col" className="num">Read</th></tr>
                  : <tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col" className="num">Delivered</th><th scope="col" className="num">Opened</th><th scope="col" className="num">Clicked</th><th scope="col">Reason</th></tr>}
              </thead>
              <tbody>
                {q.data.rows.map((r) => (inApp
                  ? <tr key={r.id}><th scope="row">{r.recipient_email}</th><td className="num whitespace-nowrap">{time(r.opened_at)}</td></tr>
                  : (
                    <tr key={r.id}>
                      <th scope="row">{r.recipient_email}</th><td><Status row={r} /></td><td className="num whitespace-nowrap">{time(r.delivered_at)}</td>
                      <td className="num whitespace-nowrap">{time(r.opened_at)}</td><td className="num whitespace-nowrap">{time(r.clicked_at)}</td>
                      <td className="rnr-problem">{r.error ?? (r.status === 'failed' ? 'No reason was recorded.' : '')}</td>
                    </tr>
                  )))}
              </tbody>
            </table>
            <nav className="rnr-pager" aria-label="Recipient pages">
              <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page <= 1 || undefined} onClick={() => page > 1 && setPage(page - 1)}>Previous</button>
              <span className="rnr-num" aria-live="polite">{pageText(page, total)}</span>
              <button type="button" className="rnr-btn rnr-btn-ghost" aria-disabled={page >= last || undefined} onClick={() => page < last && setPage(page + 1)}>Next</button>
              {q.isFetching && <span className="rnr-spin" aria-hidden="true" />}
            </nav>
          </div>
        )}
      </div>
    </FolderCard>
  )
}
