import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { btn, Avatar } from '../ui'
import { callAdmin, type AdminListFirmsResponse } from './api'

type Firm = AdminListFirmsResponse['firms'][0]

type Action = { type: 'suspend' | 'reactivate' | 'extend' | 'makeComplimentary'; firmId: string; days?: 7 | 14 }

export function FirmsTable({ onSupportView }: { onSupportView: (firmId: string, firmName: string, currency: string) => void }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [confirmAction, setConfirmAction] = useState<Action | null>(null)
  const [actionError, setActionError] = useState<{ firmId: string; message: string } | null>(null)

  const list = useQuery({
    queryKey: ['admin', 'firms'],
    queryFn: async () => (await callAdmin('list_firms', {})) as AdminListFirmsResponse,
  })

  const suspend = useMutation({
    mutationFn: async (firmId: string) => {
      setActionError(null)
      try {
        await callAdmin('set_status', { firmId, status: 'suspended' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to suspend'
        setActionError({ firmId, message: msg })
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'firms'] })
      setConfirmAction(null)
    },
  })

  const reactivate = useMutation({
    mutationFn: async (firmId: string) => {
      setActionError(null)
      try {
        await callAdmin('set_status', { firmId, status: 'active' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to reactivate'
        setActionError({ firmId, message: msg })
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'firms'] })
      setConfirmAction(null)
    },
  })

  const extendTrial = useMutation({
    mutationFn: async ({ firmId, days }: { firmId: string; days: 7 | 14 }) => {
      setActionError(null)
      try {
        await callAdmin('extend_trial', { firmId, days })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to extend trial'
        setActionError({ firmId, message: msg })
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'firms'] })
      setConfirmAction(null)
    },
  })

  const makeComplimentary = useMutation({
    mutationFn: async (firmId: string) => {
      setActionError(null)
      try {
        await callAdmin('set_billing', { firmId, billing_status: 'complimentary' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to make complimentary'
        setActionError({ firmId, message: msg })
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'firms'] })
      setConfirmAction(null)
    },
  })

  const firms = list.data?.firms ?? []
  const filtered = firms.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.currency.toLowerCase().includes(search.toLowerCase()),
  )

  const now = useMemo(() => new Date(), [])

  const getBillingLabel = (f: Firm) => {
    if (f.billing_status === 'trial' && f.trial_ends_at) {
      const ends = new Date(f.trial_ends_at)
      const daysLeft = Math.ceil((ends.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return daysLeft > 0 ? `Trial: ${daysLeft}d` : 'Trial ended'
    }
    if (f.billing_status === 'paid' && f.paid_at) {
      return `Paid: ${new Date(f.paid_at).toLocaleDateString()}`
    }
    return f.billing_status === 'complimentary' ? 'Complimentary' : 'Read-only'
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <input
          type="text"
          placeholder="Search by name or currency..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/25 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-400 dark:focus:ring-white/30"
        />
      </div>

      {list.isPending && <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading firms...</div>}
      {list.isError && <div className="text-center text-sm text-red-600 dark:text-red-400">Failed to load firms</div>}

      {!list.isPending && !list.isError && filtered.length === 0 && (
        <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">No firms found</div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Currency</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Billing</th>
                <th className="px-4 py-3 text-left font-medium">Members</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((firm) => (
                <tr
                  key={firm.id}
                  className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={firm.name} size="size-6" />
                      <span className="font-medium">{firm.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{firm.currency}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 capitalize">{firm.source}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                        firm.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {firm.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{getBillingLabel(firm)}</td>
                  <td className="px-4 py-3">{firm.members}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {new Date(firm.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onSupportView(firm.id, firm.name, firm.currency)}
                        className={`${btn.ghost} !px-2 !py-1 text-xs`}
                      >
                        Support
                      </button>
                      {firm.status === 'active' ? (
                        <button
                          onClick={() => setConfirmAction({ type: 'suspend', firmId: firm.id })}
                          className={`${btn.danger} !px-2 !py-1 text-xs`}
                          disabled={suspend.isPending}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmAction({ type: 'reactivate', firmId: firm.id })}
                          className={`${btn.primary} !px-2 !py-1 text-xs`}
                          disabled={reactivate.isPending}
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmAction({ type: 'extend', firmId: firm.id, days: 7 })}
                        className={`${btn.ghost} !px-2 !py-1 text-xs`}
                        disabled={extendTrial.isPending}
                      >
                        +7d
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: 'extend', firmId: firm.id, days: 14 })}
                        className={`${btn.ghost} !px-2 !py-1 text-xs`}
                        disabled={extendTrial.isPending}
                      >
                        +14d
                      </button>
                      {firm.billing_status === 'trial' && (
                        <button
                          onClick={() => setConfirmAction({ type: 'makeComplimentary', firmId: firm.id })}
                          className={`${btn.ghost} !px-2 !py-1 text-xs`}
                          disabled={makeComplimentary.isPending}
                        >
                          Comp
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actionError && actionError.firmId && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {actionError.message}
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm dark:bg-zinc-950/50">
          <div className="w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-2 text-base font-semibold">
              {confirmAction.type === 'suspend' && 'Suspend firm?'}
              {confirmAction.type === 'reactivate' && 'Reactivate firm?'}
              {confirmAction.type === 'extend' && `Extend trial by ${confirmAction.days} days?`}
              {confirmAction.type === 'makeComplimentary' && 'Make firm complimentary?'}
            </h3>
            <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">
              {confirmAction.type === 'suspend' && 'The firm owner will see a suspension message and cannot make changes.'}
              {confirmAction.type === 'reactivate' && 'The firm will be active again.'}
              {confirmAction.type === 'extend' && 'Trial end date will be extended.'}
              {confirmAction.type === 'makeComplimentary' && 'The trial will end and the firm will be free forever.'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className={btn.ghost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAction.type === 'suspend') suspend.mutate(confirmAction.firmId)
                  else if (confirmAction.type === 'reactivate') reactivate.mutate(confirmAction.firmId)
                  else if (confirmAction.type === 'extend') extendTrial.mutate({ firmId: confirmAction.firmId, days: confirmAction.days! })
                  else if (confirmAction.type === 'makeComplimentary') makeComplimentary.mutate(confirmAction.firmId)
                }}
                className={confirmAction.type === 'suspend' ? btn.danger : btn.primary}
                disabled={suspend.isPending || reactivate.isPending || extendTrial.isPending || makeComplimentary.isPending}
              >
                {suspend.isPending || reactivate.isPending || extendTrial.isPending || makeComplimentary.isPending ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
