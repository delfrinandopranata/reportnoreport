import { useState, useMemo, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { btn, Dialog, Icon, input } from '../ui'
import { callAdmin, type AdminListFirmsResponse } from './api'
import { formatDate } from '../settings/constants'
import { trialState } from '../trial'

type Firm = AdminListFirmsResponse['firms'][0]

type Action = { type: 'suspend' | 'reactivate' | 'extend' | 'makeComplimentary'; firmId: string; days?: 7 | 14; firmName?: string }

function ActionMenu({ firmId, firmName, firm, onSetConfirmAction, onSupportView, isBusy }: { firmId: string; firmName: string; firm: Firm; onSetConfirmAction: (action: Action) => void; onSupportView: () => void; isBusy: boolean }) {
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
    <div ref={menuRef} className="rnr-menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className="rnr-icon-btn"
        aria-haspopup="menu"
        aria-expanded={showMenu}
        aria-label={`Actions for ${firmName}`}
        disabled={isBusy}
      >
        <Icon name="more" className="size-5" />
      </button>
      {showMenu && (
        <div className="rnr-menu" role="menu" onKeyDown={onKeyDown}>
          <button type="button" role="menuitem" onClick={onSupportView} className="rnr-menu-item">
            <Icon name="building" />
            View support details
          </button>
          <div className="rnr-menu-sep" />
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={item.action}
              className={`rnr-menu-item${item.danger ? ' is-danger' : ''}`}
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
  const confirmTitle = confirmAction && (
    confirmAction.type === 'suspend' ? `Suspend ${confirmAction.firmName}?`
    : confirmAction.type === 'reactivate' ? `Reactivate ${confirmAction.firmName}?`
    : confirmAction.type === 'extend' ? `Extend trial for ${confirmAction.firmName}?`
    : `Make ${confirmAction.firmName} complimentary?`
  )

  return (
    <div className="grid gap-4">
      <div className="rnr-card rnr-table-card min-h-80 lg:overflow-visible">
        <div className="rnr-admin-bar">
          <input
            type="text"
            aria-label="Search firms"
            placeholder="Search by name or currency…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={input}
          />
          {!list.isPending && !list.isError && <span className="rnr-caption" role="status">{filtered.length} {filtered.length === 1 ? 'firm' : 'firms'}</span>}
        </div>

        {list.isPending && <p className="p-8 text-center text-ink-2" role="status">Loading firms…</p>}

        {list.isError && (
          <div className="p-4"><div className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>Failed to load firms</div></div></div>
        )}

        {!list.isPending && !list.isError && filtered.length === 0 && (
          <div className="p-4">
            <div className="rnr-empty">
              <h2>{search ? 'No firms found' : 'No firms yet'}</h2>
              <p>{search ? 'Try a different search' : 'Create your first firm'}</p>
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <table className="rnr-table rnr-admin-table">
            <caption className="rnr-sr-only">Firms</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Currency</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Billing</th>
                <th scope="col" className="num">Members</th>
                <th scope="col">Created</th>
                <th scope="col"><span className="rnr-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((firm) => (
                <tr key={firm.id} data-muted={firm.status === 'suspended' ? '' : undefined}>
                  <td className="rnr-admin-id"><strong>{firm.name}</strong></td>
                  <td>{firm.currency}</td>
                  <td>{getSourceLabel(firm.source)}</td>
                  <td>
                    <span className="rnr-status" data-tone={firm.status === 'active' ? 'ok' : 'down'}>
                      <Icon name={firm.status === 'active' ? 'check' : 'x'} />
                      {getStatusLabel(firm.status)}
                    </span>
                  </td>
                  <td><span className="rnr-chip">{getBillingLabel(firm)}</span></td>
                  <td className="num">{firm.members}</td>
                  <td>{formatDate(firm.created_at.slice(0, 10), 'text')}</td>
                  <td className="rnr-admin-act">
                    <ActionMenu firmId={firm.id} firmName={firm.name} firm={firm} onSetConfirmAction={setConfirmAction} onSupportView={() => onSupportView(firm.id, firm.name, firm.currency)} isBusy={isBusy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {actionError && actionError.firmId && (
        <div className="rnr-note" data-tone="down" role="alert"><Icon name="alert" className="size-5" /><div>{actionError.message}</div></div>
      )}

      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmTitle ?? ''}>
        {confirmAction && (
          <div className="grid gap-4">
            <p className="text-ink-2">
              {confirmAction.type === 'suspend' && "Members can't sign in until you reactivate it."}
              {confirmAction.type === 'reactivate' && 'Members will regain access to the firm.'}
              {confirmAction.type === 'extend' && `Trial will be extended by ${confirmAction.days} days.`}
              {confirmAction.type === 'makeComplimentary' && 'The trial will remain free indefinitely.'}
            </p>
            <div className="flex justify-end gap-3">
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
                disabled={isBusy}
                aria-busy={isBusy}
              >
                {isBusy ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
