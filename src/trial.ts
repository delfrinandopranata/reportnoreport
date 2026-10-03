export type TrialState =
  | { kind: 'none' }
  | { kind: 'active'; daysLeft: number; endsOn: string }
  | { kind: 'ended'; endedOn: string }
  | { kind: 'read_only'; endedOn: string }

function formatLocalDate(date: Date): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = date.getDate()
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

export function trialState(
  firm: { billingStatus: string; trialEndsAt: string | null },
  now: Date
): TrialState {
  // Handle read_only status
  if (firm.billingStatus === 'read_only') {
    const endDate = firm.trialEndsAt ? new Date(firm.trialEndsAt) : new Date()
    return { kind: 'read_only' as const, endedOn: formatLocalDate(endDate) }
  }

  // Non-trial statuses (paid, complimentary) return none
  if (firm.billingStatus !== 'trial') {
    return { kind: 'none' as const }
  }

  // Trial status but no end date returns none
  if (!firm.trialEndsAt) {
    return { kind: 'none' as const }
  }

  const endDate = new Date(firm.trialEndsAt)
  const timeRemaining = endDate.getTime() - now.getTime()

  // Trial has ended
  if (timeRemaining <= 0) {
    return { kind: 'ended' as const, endedOn: formatLocalDate(endDate) }
  }

  // Trial is active
  const daysRemaining = timeRemaining / (1000 * 60 * 60 * 24)
  const daysLeft = Math.max(1, Math.ceil(daysRemaining))

  return { kind: 'active' as const, daysLeft, endsOn: formatLocalDate(endDate) }
}
