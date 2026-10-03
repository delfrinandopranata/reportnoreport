export type ExpiringContract = { id: string; firm_id: string; title: string; end_date: string; client_name: string; counterparty: string }

/** True when end_date falls within [today, today + 7 days] inclusive. */
export function inReminderWindow(endDate: string, today: string): boolean {
  const days = (new Date(`${endDate}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) / 86_400_000
  return days >= 0 && days <= 7
}

/** Groups contracts by firm so each firm gets one email, not one per contract. */
export function groupByFirm(contracts: ExpiringContract[]): Map<string, ExpiringContract[]> {
  const map = new Map<string, ExpiringContract[]>()
  for (const c of contracts) map.set(c.firm_id, [...(map.get(c.firm_id) ?? []), c])
  return map
}

/** Plain-text body listing every expiring contract for one firm. */
export function reminderEmailBody(contracts: ExpiringContract[]): string {
  const lines = contracts.map((c) => `- ${c.title} (${c.client_name}${c.counterparty ? ` with ${c.counterparty}` : ''}) — ends ${c.end_date}`)
  const subject = contracts.length === 1 ? 'A contract is' : 'Contracts are'
  return `${subject} approaching its end date:\n\n${lines.join('\n')}\n\nRenew in time to avoid a lapse in cover.`
}
