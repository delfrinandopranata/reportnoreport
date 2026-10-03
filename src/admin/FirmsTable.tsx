import { useState, useMemo, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { btn, Avatar, Icon, ring } from '../ui'
import { callAdmin, type AdminListFirmsResponse } from './api'
import { formatDate } from '../settings/constants'
import { trialState } from '../trial'

type Firm = AdminListFirmsResponse['firms'][0]

type Action = { type: 'suspend' | 'reactivate' | 'extend' | 'makeComplimentary'; firmId: string; days?: 7 | 14; firmName?: string }

function ActionMenu({ firmId, firmName, firm, onSetConfirmAction, isBusy }: { firmId: string; firmName: string; firm: Firm; onSetConfirmAction: (action: Action) => void; isBusy: boolean }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) {
        return // Ignore the button itself
      }
      if (menuRef.current?.contains(e.target as Node)) {
        return // Ignore clicks inside the menu
      }
      setShowMenu(false)
    }
    if (showMenu) {
      document.addEventListener('pointerdown', onPointerDown)
      return () => document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [showMenu])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMenu(false)
      buttonRef.current?.focus()
    }
  }

  const items = [
    { label: 'Extend trial by 7 days', action: () => { onSetConfirmAction({ type: 'extend', firmId, days: 7, firmName }); setShowMenu(false) }, danger: false },
    { label: 'Extend trial by 14 days', action: () => { onSetConfirmAction({ type: 'extend', firmId, days: 14, firmName }); setShowMenu(false) }, danger: false },
    ...(firm.status === 'active' ? [{ label: 'Suspend', action: () => { onSetConfirmAction({ type: 'suspend', firmId, firmName }); setShowMenu(false) }, danger: true }] : []),
    ...(firm.status === 'suspended' ? [{ label: 'Reactivate', action: () => { onSetConfirmAction({ type: 'reactivate', firmId, firmName }); setShowMenu(false) }, danger: false }] : []),
    ...(firm.billing_status === 'trial' ? [{ label: 'Make complimentary', action: () => { onSetConfirmAction({ type: 'makeComplimentary', firmId, firmName }); setShowMenu(false) }, danger: false }] : []),
  ]

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={`${btn.ghost} !px-2 !py-1 text-xs`}
        aria-haspopup="menu"
        aria-expanded={showMenu}
        aria-label={`Actions for ${firmName}`}
        disabled={isBusy}
      >
        <Icon name="sliders" className="size-3" />
      </button>
      {showMenu && (
        <div className="absolute right-0 top-8 z-50 min-w-max rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800" role="menu" onKeyDown={onKeyDown}>
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={item.action}
              className={`block w-full px-3 py-2 text-left text-xs font-medium rounded transition first:rounded-t last:rounded-b ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/50'
                  : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function FirmsTable({ onSupportView }: { onSupportView: (firmId: string, firmName: string, currency: string) => void }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [confirmAction, setConfirmAction] = useState<Action | null>(null)
  const [actionError, setActionError] = useState<{ firmId: string; message: string } | null>(null)
  const [now] = useState(() => new Date())

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

  const getBillingLabel = useMemo(() => (f: Firm) => {
    const state = trialState(
      { billingStatus: f.billing_status, trialEndsAt: f.trial_ends_at },
      now,
    )
    if (state.kind === 'active') {
      return `Trial: ${state.daysLeft}d`
    }
    if (state.kind === 'ended') {
      return 'Trial ended'
    }
    if (f.billing_status === 'paid' && f.paid_at) {
      return `Paid: ${formatDate(f.paid_at.slice(0, 10), 'text')}`
    }
    if (f.billing_status === 'complimentary') {
      return 'Complimentary'
    }
    return 'Read-only'
  }, [now])

  const getSourceLabel = (source: string) => {
    if (source === 'self_serve') return 'Self-serve'
    if (source === 'admin') return 'Admin'
    return source
  }

  const getStatusLabel = (status: string) => {
    if (status === 'active') return 'Active'
    if (status === 'suspended') return 'Suspended'
    return status
  }

  const isBusy = suspend.isPending || reactivate.isPending || extendTrial.isPending || makeComplimentary.isPending

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <input
          type="text"
          placeholder="Search by name or currency…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/25 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-400 dark:focus:ring-white/30 ${ring}`}
        />
      </div>

      {list.isPending && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading firms…</div>
        </div>
      )}

      {list.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950">
          <div className="text-sm text-red-600 dark:text-red-400">Failed to load firms</div>
        </div>
      )}

      {!list.isPending && !list.isError && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {search ? 'No firms found' : 'No firms yet'}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {search ? 'Try a different search' : 'Create your first firm'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Currency</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Billing</th>
                  <th className="px-4 py-3 text-right font-medium">Members</th>
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
                    <td className="px-4 py-3 text-sm">{firm.currency}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">{getSourceLabel(firm.source)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          firm.status === 'active'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                        aria-label={getStatusLabel(firm.status)}
                      >
                        <Icon
                          name={firm.status === 'active' ? 'check' : 'x'}
                          className="size-3"
                        />
                        {getStatusLabel(firm.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {getBillingLabel(firm)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-tabular-nums text-sm">{firm.members}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                      {formatDate(firm.created_at.slice(0, 10), 'text')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onSupportView(firm.id, firm.name, firm.currency)}
                          className={`${btn.primary} !px-2 !py-1 text-xs gap-1`}
                          title="View support details for this firm"
                        >
                          <Icon name="building" className="size-3" />
                          Support
                        </button>
                        <ActionMenu firmId={firm.id} firmName={firm.name} firm={firm} onSetConfirmAction={setConfirmAction} isBusy={isBusy} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            <h3 className="mb-1 text-base font-semibold">
              {confirmAction.type === 'suspend' && `Suspend ${confirmAction.firmName}?`}
              {confirmAction.type === 'reactivate' && `Reactivate ${confirmAction.firmName}?`}
              {confirmAction.type === 'extend' && `Extend trial for ${confirmAction.firmName}?`}
              {confirmAction.type === 'makeComplimentary' && `Make ${confirmAction.firmName} complimentary?`}
            </h3>
            <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">
              {confirmAction.type === 'suspend' && "Members can't sign in until you reactivate it."}
              {confirmAction.type === 'reactivate' && 'Members will regain access to the firm.'}
              {confirmAction.type === 'extend' && `Trial will be extended by ${confirmAction.days} days.`}
              {confirmAction.type === 'makeComplimentary' && 'The trial will remain free indefinitely.'}
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
                aria-busy={suspend.isPending || reactivate.isPending || extendTrial.isPending || makeComplimentary.isPending}
              >
                {suspend.isPending || reactivate.isPending || extendTrial.isPending || makeComplimentary.isPending ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
