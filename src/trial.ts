export type TrialState =
  | { kind: 'none' }
  | { kind: 'active'; daysLeft: number; endsOn: string }
  | { kind: 'ended'; endedOn: string }

function formatUTCDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day} ${monthNames[month]} ${year}`
}

export function trialState(
  firm: { billingStatus: string; trialEndsAt: string | null },
  now: Date
): TrialState {
  // Non-trial statuses always return none
  if (firm.billingStatus !== 'trial') {
    return { kind: 'none' }
  }

  // Trial status but no end date returns none
  if (!firm.trialEndsAt) {
    return { kind: 'none' }
  }

  const endDate = new Date(firm.trialEndsAt)
  const timeRemaining = endDate.getTime() - now.getTime()

  // Trial has ended
  if (timeRemaining <= 0) {
    return { kind: 'ended', endedOn: formatUTCDate(endDate) }
  }

  // Trial is active
  const daysRemaining = timeRemaining / (1000 * 60 * 60 * 24)
  const daysLeft = Math.max(1, Math.ceil(daysRemaining))

  return { kind: 'active', daysLeft, endsOn: formatUTCDate(endDate) }
}
