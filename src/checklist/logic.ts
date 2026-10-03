import type { Firm } from '../data/mappers.ts'
import type { ChecklistItem } from './summary.ts'

export interface ChecklistPreferences {
  skipped: string[]
  dismissed: boolean
}

export function computeChecklistItems(
  firm: Firm | null,
  clientsCount: number,
  transactionsCount: number,
  membersCount: number,
  prefs: ChecklistPreferences,
): ChecklistItem[] {
  if (!firm) return []

  const profileDone = !!(firm.phone && firm.email && firm.registrationNo)
  const teamDone = membersCount > 1
  const clientDone = clientsCount > 0
  const transactionDone = transactionsCount > 0

  const items: ChecklistItem[] = [
    {
      id: 'profile',
      title: 'Complete your firm profile',
      description: 'Add phone, email, and registration number',
      href: '#settings',
      state: getItemState('profile', profileDone, prefs.skipped),
    },
    {
      id: 'team',
      title: 'Invite your team',
      description: 'Add team members with roles',
      href: '#users',
      state: getItemState('team', teamDone, prefs.skipped),
    },
    {
      id: 'client',
      title: 'Add a client',
      description: 'Create a client record',
      href: '#clients',
      state: getItemState('client', clientDone, prefs.skipped),
    },
    {
      id: 'transaction',
      title: 'Record a transaction',
      description: 'Post a receipt or payment',
      href: '#clients',
      state: getItemState('transaction', transactionDone, prefs.skipped),
    },
  ]

  return items
}

function getItemState(
  itemId: string,
  isDone: boolean,
  skipped: string[],
): 'todo' | 'done' | 'skipped' {
  if (isDone) return 'done'
  if (skipped.includes(itemId)) return 'skipped'
  return 'todo'
}

export function shouldShowChecklist(items: ChecklistItem[], dismissed: boolean): boolean {
  if (dismissed) return false
  const allCompleted = items.every((i) => i.state === 'done' || i.state === 'skipped')
  if (allCompleted) return false
  return items.length > 0
}
