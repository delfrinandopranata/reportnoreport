export type ContractStatus = 'pending_review' | 'approved' | 'rejected'

export const STATUS_LABEL: Record<ContractStatus, string> = { pending_review: 'Pending review', approved: 'Approved', rejected: 'Rejected' }
export const STATUS_TONE: Record<ContractStatus, string> = {
  pending_review: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

/** Whole days from `today` to `endDate` (negative once it's past). Both are YYYY-MM-DD. */
export function daysUntilEnd(endDate: string, today: string): number {
  return Math.round((new Date(`${endDate}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) / 86_400_000)
}

/** A short "ends in N days" hint for an approved contract nearing its end date; '' otherwise. */
export function endingSoonHint(status: ContractStatus, endDate: string, today: string): string {
  if (status !== 'approved') return ''
  const days = daysUntilEnd(endDate, today)
  if (days < 0 || days > 7) return ''
  return days === 0 ? 'Ends today' : days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`
}
