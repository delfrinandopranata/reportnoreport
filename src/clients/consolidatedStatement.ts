/** A table section on the consolidated statement: one per group shown on the Clients page. */
export type StatementSection<R> = { key: string; heading?: string; rows: R[]; subtotal?: Record<string, string> }

type Group<R> = { key: string; label: string; rows: R[]; receipts: number; payments: number; closing?: number }

/**
 * Shapes the Clients table, exactly as shown, into statement sections. Every group is included
 * (collapsing is a screen convenience, not a filter); cells are rendered by the caller's columns.
 */
export function buildSections<R>(groups: Group<R>[], mode: 'none' | 'client' | 'month', fmt: (minor: number) => string): StatementSection<R>[] {
  if (mode === 'none') return groups.map((g) => ({ key: g.key, rows: g.rows }))
  return groups.map((g) => ({
    key: g.key,
    heading: g.label,
    rows: g.rows,
    subtotal: {
      receipts: fmt(g.receipts),
      payments: fmt(g.payments),
      ...(g.closing === undefined ? {} : { balance: fmt(g.closing) }),
    },
  }))
}

/** "Receipts only · Grouped by client"; filter notes come from the page in lower case. */
export function preparedFrom(filterNote: string[], mode: 'none' | 'client' | 'month'): string {
  const parts = [...filterNote.filter((n) => !n.startsWith('grouped by')), ...(mode === 'none' ? [] : [`grouped by ${mode}`])]
  if (!parts.length) return 'All clients, no filters'
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const countClients = (clientIds: string[]): number => new Set(clientIds).size
