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
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="font-semibold">Waitlist ({entries.length})</h2>
          {entries.length > 0 && (
            <button
              onClick={() => setCopyConfirm(true)}
              className={`${btn.primary} gap-2`}
              disabled={copy.isPending}
              aria-busy={copy.isPending}
            >
              <Icon name="mail" className="size-4" />
              Copy emails
            </button>
          )}
        </div>

        {copySuccess && (
          <div className="border-b border-green-200 bg-green-50 px-6 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
            <div className="flex items-center gap-2">
              <Icon name="check" className="size-4" />
              Copied {entries.length} email{entries.length !== 1 ? 's' : ''} to clipboard
            </div>
          </div>
        )}

        {waitlist.isPending && (
          <div className="p-8 text-center text-sm text-zinc-600 dark:text-zinc-400">Loading waitlist…</div>
        )}

        {waitlist.isError && (
          <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">Failed to load waitlist</div>
        )}

        {!waitlist.isPending && !waitlist.isError && entries.length === 0 && (
          <div className="p-8 text-center">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">No waitlist entries</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No one has joined the waitlist yet</p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                  <th className="px-6 py-3 text-left font-medium">Email</th>
                  <th className="px-6 py-3 text-left font-medium">Firm name</th>
                  <th className="px-6 py-3 text-left font-medium">Date joined</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={i}
                    className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                  >
                    <td className="px-6 py-3 font-mono text-xs">{entry.email}</td>
                    <td className="px-6 py-3 text-sm">{entry.firm_name}</td>
                    <td className="px-6 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                      {formatDate(entry.created_at.slice(0, 10), 'text')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={copyConfirm} onClose={() => setCopyConfirm(false)} title="Copy waitlist emails?">
        <div className="grid gap-4 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">
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
