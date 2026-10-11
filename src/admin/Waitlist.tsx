import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { btn, Dialog, Icon } from '../ui'
import { callAdmin, type AdminListWaitlistResponse } from './api'
import { formatDate } from '../settings/constants'

export function Waitlist() {
  const [copyConfirm, setCopyConfirm] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const waitlist = useQuery({
    queryKey: ['admin', 'waitlist'],
    queryFn: async () => (await callAdmin('list_waitlist', {})) as AdminListWaitlistResponse,
  })

  const copy = useMutation({
    mutationFn: async () => {
      if (!waitlist.data?.waitlist) return
      const emails = waitlist.data.waitlist.map((w) => w.email).join(', ')
      await navigator.clipboard.writeText(emails)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 3000)
    },
  })

  const entries = waitlist.data?.waitlist ?? []

  return (
    <div className="grid gap-4">
      <div className="rnr-card rnr-table-card">
        <div className="rnr-admin-bar">
          <h2 className="rnr-card-title">Waitlist ({entries.length})</h2>
          {entries.length > 0 && (
            <button
              onClick={() => setCopyConfirm(true)}
              className={`${btn.primary} ml-auto`}
              disabled={copy.isPending}
              aria-busy={copy.isPending}
            >
              <Icon name="mail" className="size-4" />
              Copy emails
            </button>
          )}
        </div>

        {copySuccess && (
          <div className="p-4 pb-0">
            <div className="rnr-note" data-tone="ok" role="status">
              <Icon name="check" className="size-5" />
              <div>Copied {entries.length} email{entries.length !== 1 ? 's' : ''} to clipboard</div>
            </div>
          </div>
        )}

        {waitlist.isPending && (
          <p className="p-8 text-center text-ink-2" role="status">Loading waitlist…</p>
        )}

        {waitlist.isError && (
          <div className="p-4"><div className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>Failed to load waitlist</div></div></div>
        )}

        {!waitlist.isPending && !waitlist.isError && entries.length === 0 && (
          <div className="p-4">
            <div className="rnr-empty">
              <h3>No waitlist entries</h3>
              <p>No one has joined the waitlist yet</p>
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <table className="rnr-table rnr-admin-table">
            <caption className="rnr-sr-only">Waitlist</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Firm name</th>
                <th scope="col">Date joined</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i}>
                  <td className="rnr-admin-id"><strong>{entry.email}</strong></td>
                  <td>{entry.firm_name}</td>
                  <td>{formatDate(entry.created_at.slice(0, 10), 'text')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={copyConfirm} onClose={() => setCopyConfirm(false)} title="Copy waitlist emails?">
        <div className="grid gap-4">
          <p className="text-ink-2">
            {entries.length} email{entries.length !== 1 ? 's' : ''} will be copied to your clipboard, separated by commas.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCopyConfirm(false)} className={btn.ghost}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                copy.mutate()
                setCopyConfirm(false)
              }}
              className={btn.primary}
              disabled={copy.isPending}
              aria-busy={copy.isPending}
            >
              {copy.isPending ? 'Copying…' : 'Copy'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
