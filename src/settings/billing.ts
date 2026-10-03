import { formatDate } from './constants.ts'
import { trialState } from '../trial.ts'

export type BillingViewState =
  | { kind: 'trial'; daysLeft: number; endsOn: string }
  | { kind: 'ended'; endedOn: string }
  | { kind: 'read_only'; endedOn: string }
  | { kind: 'paid'; paidOn: string }
  | { kind: 'complimentary' }
  | { kind: 'polling'; isSuccess: boolean }

export function billingView(
  firm: { billingStatus: string; trialEndsAt: string | null; paidAt: string | null },
  _isOwner: boolean,
  now: Date
): BillingViewState {
  const trial = trialState(firm, now)

  if (trial.kind === 'active') {
    return { kind: 'trial', daysLeft: trial.daysLeft, endsOn: trial.endsOn }
  }

  if (trial.kind === 'ended') {
    return { kind: 'ended', endedOn: trial.endedOn }
  }

  if (trial.kind === 'read_only') {
    return { kind: 'read_only', endedOn: trial.endedOn }
  }

  if (firm.billingStatus === 'paid') {
    return { kind: 'paid', paidOn: firm.paidAt ? formatDate(new Date(firm.paidAt).toLocaleDateString('en-CA'), 'text') : 'recently' }
  }

  if (firm.billingStatus === 'complimentary') {
    return { kind: 'complimentary' }
  }

  return { kind: 'trial', daysLeft: 0, endsOn: '' }
}
