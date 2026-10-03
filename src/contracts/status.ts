/** Whole days from `today` to `endDate` (negative once it's past). Both are YYYY-MM-DD. */
export function daysUntilEnd(endDate: string, today: string): number {
  return Math.round((new Date(`${endDate}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) / 86_400_000)
}

/** "Ended", "Ends today", "Ends tomorrow" or "Ends in N days". */
export function endsInLabel(endDate: string, today: string): string {
  const days = daysUntilEnd(endDate, today)
  if (days < 0) return 'Ended'
  return days === 0 ? 'Ends today' : days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`
}

/** True when the contract ends within the reminder window (today to 7 days out). */
export const isEndingSoon = (endDate: string, today: string): boolean => {
  const days = daysUntilEnd(endDate, today)
  return days >= 0 && days <= 7
}
