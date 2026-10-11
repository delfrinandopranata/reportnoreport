import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../data/session'
import { useCheckoutSession, useFirmBilling } from '../data/queries'
import { btn, Icon } from '../ui'
import { billingView } from './billing'
import { formatMoney } from '../ledger'
const PRICE = formatMoney(1000)

export function BillingPage() {
  const session = useSession()
  const { firm, profile } = session
  const queryClient = useQueryClient()
  const [pollingStartTime, setPollingStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const { data: billingData } = useFirmBilling()
  const checkout = useCheckoutSession()

  const isOwner = profile.role === 'owner'
  const now = useMemo(() => new Date(), [])

  const currentFirm = billingData ? {
    billingStatus: billingData.billing_status,
    trialEndsAt: billingData.trial_ends_at,
    paidAt: billingData.paid_at,
  } : firm

  const view = billingView(currentFirm, isOwner, now)

  const isPaying = useMemo(() => {
    return new URLSearchParams(window.location.hash.split('?')[1] || '').get('paid') === '1'
  }, [])

  useEffect(() => {
    if (isPaying && pollingStartTime === null) {
      setPollingStartTime(Date.now())
    }
  }, [isPaying, pollingStartTime])

  useEffect(() => {
    if (!isPaying || !pollingStartTime) return

    const checkPayment = () => {
      const e = Date.now() - pollingStartTime
      setElapsed(e)

      if (e > 30000) {
        return
      }

      queryClient.invalidateQueries({ queryKey: ['firm', firm.id, 'billing'] })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    }

    const interval = setInterval(checkPayment, 2000)
    return () => clearInterval(interval)
  }, [isPaying, pollingStartTime, firm.id, queryClient])

  // Once the webhook has marked the firm paid, the paid view replaces the 'confirming' notice.
  const showSuccess = isPaying && pollingStartTime !== null && view.kind !== 'paid'
  const showPollingTimeout = isPaying && pollingStartTime !== null && elapsed > 30000

  const pay = isOwner && (view.kind === 'trial' || view.kind === 'ended' || view.kind === 'read_only') && (
    <>
      <button type="button" disabled={checkout.isPending} className={`${btn.primary} w-full sm:w-auto`} onClick={() => checkout.mutate()}>
        {checkout.isPending ? 'Opening secure payment…' : `Pay ${PRICE}`}
      </button>
      {checkout.isError && <p className="rnr-error" role="alert">{(checkout.error as Error).message}</p>}
    </>
  )
  const state = (tone: 'ok' | 'warn' | 'down' | 'info', icon: 'check' | 'x' | 'alert', title: string, detail?: string) => (
    <div className="grid gap-1">
      <p className="rnr-status" data-tone={tone} data-wrap><Icon name={icon} className="size-5" />{title}</p>
      {detail && <p className="rnr-hint">{detail}</p>}
    </div>
  )

  return (
    <section id="billing" ref={(el) => { if (el && location.hash.startsWith('#settings/billing')) el.scrollIntoView({ block: 'start' }) }} className="rnr-folder rnr-kpi-tile scroll-mt-4" aria-labelledby="billing-heading">
      <span className="rnr-folder-tab" id="billing-heading">Billing</span>
      <div className="rnr-folder-body">
        <div className="rnr-perf" aria-hidden="true" />
        {view.kind === 'paid' && <span className="rnr-stamp rnr-stamp--corner" aria-hidden="true">Paid</span>}
        <p className="rnr-muted">Your licence and payment status.</p>

        {view.kind !== 'paid' && view.kind !== 'complimentary' && (
          <>
            <p className="rnr-kpi-figure">{PRICE}</p>
            <p className="rnr-caption">Free for 14 days. Then {PRICE}, once.</p>
          </>
        )}

        {showSuccess && !showPollingTimeout && (
          <p className="rnr-note" data-tone="ok" role="status"><Icon name="check" className="size-5" /><span>Payment received — confirming…</span></p>
        )}

        {showPollingTimeout && (
          <div className="rnr-note" data-tone="warn" role="status">
            <Icon name="alert" className="size-5" />
            <div className="grid gap-2">
              <p>Your payment is still being confirmed. This page will update when it is.</p>
              <button type="button" className={`${btn.secondary} rnr-btn-sm justify-self-start`} onClick={() => window.location.reload()}>Refresh</button>
            </div>
          </div>
        )}

        {view.kind === 'trial' && state('info', 'check', view.daysLeft === 1 ? 'You have 1 day left in your trial.' : `You have ${view.daysLeft} days left in your trial.`, `Ends ${view.endsOn}`)}
        {view.kind === 'ended' && state('warn', 'alert', `Your trial ended on ${view.endedOn}.`, `Pay ${PRICE} to keep adding and editing — your data stays viewable and exportable.`)}
        {view.kind === 'read_only' && state('down', 'x', 'Your account is read-only.', `Payment was refunded or the trial expired. Pay ${PRICE} to restore write access.`)}
        {view.kind === 'paid' && (
          <>
            {state('ok', 'check', 'Thank you — ReportNoReport is yours to keep.', `Paid on ${view.paidOn}`)}
            <p className="rnr-hint">Licence: one-time, no renewal</p>
          </>
        )}
        {view.kind === 'complimentary' && state('ok', 'check', 'Complimentary — no payment needed.', 'Your firm has complimentary access to ReportNoReport.')}

        {pay}

        {!isOwner && (view.kind === 'trial' || view.kind === 'ended' || view.kind === 'read_only') && (
          <p className="rnr-note" data-tone="info"><Icon name="info" className="size-5" /><span>Only the firm owner can pay.</span></p>
        )}
      </div>
    </section>
  )
}
