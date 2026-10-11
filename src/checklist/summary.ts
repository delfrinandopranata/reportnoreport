export interface ChecklistItem {
  id: string
  title: string
  description: string
  href: string
  state: 'todo' | 'done' | 'skipped'
}

export interface ChecklistSummary {
  todoItems: ChecklistItem[]
  doneItems: ChecklistItem[]
  skippedItems: ChecklistItem[]
  doneCount: number
  totalCount: number
}

/**
 * Summarises a checklist into todo, done, and skipped groups.
 * Logic is pure for testability.
 */
export function summarise(items: ChecklistItem[]): ChecklistSummary {
  const todoItems = items.filter((i) => i.state === 'todo')
  const doneItems = items.filter((i) => i.state === 'done')
  const skippedItems = items.filter((i) => i.state === 'skipped')
  return {
    todoItems,
    doneItems,
    skippedItems,
    doneCount: doneItems.length,
    totalCount: items.length,
  }
}

/** After the row at `index` leaves the to-do list, the row that takes focus: the one now in its place, else the last, else none. */
export function nextFocusIndex(index: number, remaining: number): number {
  return remaining === 0 ? -1 : Math.min(index, remaining - 1)
}
