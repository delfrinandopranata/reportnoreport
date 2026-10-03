import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../data/session'
import { useCheckoutSession, useFirmBilling } from '../data/queries'
import { makeMoney } from '../ledger'
import { btn, Icon } from '../ui'
import { billingView } from './billing'

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

  const showSuccess = isPaying && pollingStartTime !== null
  const showPollingTimeout = isPaying && pollingStartTime !== null && elapsed > 30000

  const moneyFormatter = makeMoney(firm.currency).format

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900" aria-labelledby="billing-heading">
      <header className="flex flex-wrap items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="billing-heading" className="font-semibold">
            Billing
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Your subscription and payment status.</p>
        </div>
      </header>

      <div className="p-5 space-y-4">
        {showSuccess && !showPollingTimeout && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            Payment received — confirming…
          </div>
        )}

        {showPollingTimeout && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <p className="mb-2">We're still confirming your payment. This page will update when it does.</p>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
        )}

        {view.kind === 'trial' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {view.daysLeft === 1
                ? 'You have 1 day left in your trial.'
                : `You have ${view.daysLeft} days left in your trial.`}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ends {view.endsOn}</p>
            {isOwner && (
              <button
                type="button"
                disabled={checkout.isPending}
                className={btn.primary}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending ? 'Opening secure payment…' : 'Pay RM 10'}
              </button>
            )}
            {checkout.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {(checkout.error as Error).message}
              </p>
            )}
          </div>
        )}

        {view.kind === 'ended' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Your trial ended on {view.endedOn}.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pay RM 10 to keep adding and editing — your data stays viewable and exportable.
            </p>
            {isOwner && (
              <button
                type="button"
                disabled={checkout.isPending}
                className={btn.primary}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending ? 'Opening secure payment…' : 'Pay RM 10'}
              </button>
            )}
            {checkout.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {(checkout.error as Error).message}
              </p>
            )}
          </div>
        )}

        {view.kind === 'read_only' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Your account is read-only.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Payment was refunded or the trial expired. Pay RM 10 to restore write access.
            </p>
            {isOwner && (
              <button
                type="button"
                disabled={checkout.isPending}
                className={btn.primary}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending ? 'Opening secure payment…' : 'Pay RM 10'}
              </button>
            )}
            {checkout.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {(checkout.error as Error).message}
              </p>
            )}
          </div>
        )}

        {view.kind === 'paid' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Icon name="check" className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <div>
                <p className="font-medium text-emerald-900 dark:text-emerald-100">Thank you — ReportNoReport is yours to keep.</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Paid on {view.paidOn}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Licence: one-time, no renewal
            </p>
          </div>
        )}

        {view.kind === 'complimentary' && (
          <div className="space-y-3">
            <p className="font-medium text-zinc-900 dark:text-white">Complimentary — no payment needed.</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Your firm has complimentary access to ReportNoReport.
            </p>
          </div>
        )}

        {!isOwner && (view.kind === 'trial' || view.kind === 'ended' || view.kind === 'read_only') && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
            Only the firm owner can pay.
          </div>
        )}

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wide mb-2">Pricing</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Free for 14 days. Then {moneyFormatter(1000)}, once.
          </p>
        </div>
      </div>
    </section>
  )
}
