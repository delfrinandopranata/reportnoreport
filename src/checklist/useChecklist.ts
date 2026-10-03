import { useSession } from '../data/session.tsx'
import { usePreference, useClientsCount, useTransactionsCount, useMembersCount } from '../data/queries.ts'
import { computeChecklistItems, shouldShowChecklist, type ChecklistPreferences } from './logic.ts'

export function useChecklist() {
  const { firm } = useSession()
  const clientsCount = useClientsCount(false)
  const transactionsCount = useTransactionsCount(false)
  const membersCount = useMembersCount()
  const [prefs, savePrefs, loaded] = usePreference<ChecklistPreferences>(
    'checklist',
    { skipped: [], dismissed: false },
  )

  const items = computeChecklistItems(firm, clientsCount, transactionsCount, membersCount, prefs)
  const open = loaded && shouldShowChecklist(items, prefs.dismissed)

  const onSkip = (itemId: string) => {
    savePrefs({
      ...prefs,
      skipped: [...prefs.skipped, itemId],
    })
  }

  const onRestore = (itemId: string) => {
    savePrefs({
      ...prefs,
      skipped: prefs.skipped.filter((id) => id !== itemId),
    })
  }

  const onDismiss = () => {
    savePrefs({
      ...prefs,
      dismissed: true,
    })
  }

  return {
    open,
    items,
    onSkip,
    onRestore,
    onDismiss,
  }
}
