import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { btn } from '../ui'
import { callAdmin, type AdminListWaitlistResponse } from './api'

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
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Waitlist ({entries.length})</h2>
          {entries.length > 0 && (
            <button
              onClick={() => setCopyConfirm(true)}
              className={btn.ghost}
              disabled={copy.isPending}
            >
              Copy emails
            </button>
          )}
        </div>

        {copySuccess && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600 dark:bg-green-950 dark:text-green-200">
            Copied {entries.length} email{entries.length !== 1 ? 's' : ''} to clipboard.
          </div>
        )}

        {waitlist.isPending && <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading waitlist...</div>}
        {waitlist.isError && <div className="text-sm text-red-600 dark:text-red-400">Failed to load waitlist</div>}

        {!waitlist.isPending && !waitlist.isError && entries.length === 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">No one on the waitlist</div>
        )}

        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Firm name</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={i}
                    className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{entry.email}</td>
                    <td className="px-4 py-3">{entry.firm_name}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {copyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm dark:bg-zinc-950/50">
          <div className="w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-2 text-base font-semibold">Copy waitlist emails?</h3>
            <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">
              {entries.length} email{entries.length !== 1 ? 's' : ''} will be copied to your clipboard, separated by commas.
            </p>
            <div className="flex gap-3">
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
              >
                {copy.isPending ? 'Copying...' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
