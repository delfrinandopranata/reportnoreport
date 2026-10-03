import type { Column } from '../table'
import type { StatementLine } from '../ledger'

export type ConsolidatedStatementInput = {
  view: 'transactions' | 'balances'
  groups: Array<{
    key: string
    label: string
    rows: StatementLine[]
    receipts: number
    payments: number
    closing?: number
  }>
  rows: StatementLine[] | any[]
  columns: Column<any>[]
  visibleColumns: Column<any>[]
  footer: Record<string, any>
  filterNote: string[]
  mode: 'none' | 'client' | 'month'
  collapsedGroups?: Set<string>
}

export type ConsolidatedStatementOutput = {
  sections: Array<{
    heading?: string
    rows: string[][]
    subtotal?: Record<string, string>
  }>
  total: Record<string, string>
  clientCount: number
  preparedFrom: string
}

export function buildConsolidatedStatement(input: ConsolidatedStatementInput): ConsolidatedStatementOutput {
  const { view } = input

  if (view === 'transactions') {
    return buildTransactionStatement(input)
  } else {
    return buildBalanceStatement(input)
  }
}

function buildTransactionStatement(input: ConsolidatedStatementInput): ConsolidatedStatementOutput {
  const { groups, visibleColumns, footer, filterNote, mode } = input

  // Get unique client IDs from all groups
  const clientIds = new Set<string>()
  groups.forEach((g) => {
    g.rows.forEach((r) => {
      clientIds.add(r.clientId)
    })
  })

  // Build sections for each group
  const sections = groups.map((group) => {
    const rows = group.rows.map((row) => visibleColumns.map((col) => col.text(row)))

    const heading = mode === 'none' ? undefined : group.label
    const subtotal = buildSubtotal(group, visibleColumns)

    return {
      heading,
      rows,
      subtotal,
    }
  })

  const preparedFrom = formatPreparedFrom(filterNote, mode)
  const total = buildFooter(footer)

  return {
    sections,
    total,
    clientCount: clientIds.size,
    preparedFrom,
  }
}

function buildBalanceStatement(input: ConsolidatedStatementInput): ConsolidatedStatementOutput {
  const { rows, visibleColumns, footer, filterNote } = input

  // For balances view, all rows go into a single section
  const renderedRows = rows.map((row) => visibleColumns.map((col) => col.text(row)))

  // Get unique client IDs - rows may have 'clientId' or 'id' field
  const clientIds = new Set<string>()
  rows.forEach((r: any) => {
    const id = r.clientId || r.id
    if (id) clientIds.add(id)
  })

  const sections = [
    {
      heading: undefined,
      rows: renderedRows,
      subtotal: undefined,
    },
  ]

  const preparedFrom = formatPreparedFrom(filterNote, 'none')
  const total = buildFooter(footer)

  return {
    sections,
    total,
    clientCount: clientIds.size,
    preparedFrom,
  }
}

function buildSubtotal(group: ConsolidatedStatementInput['groups'][0], visibleColumns: Column<StatementLine>[]): Record<string, string> {
  const subtotal: Record<string, string> = {}

  visibleColumns.forEach((col) => {
    if (col.id === 'receipts' || col.id === 'payments' || col.id === 'balance' || col.id === 'closing') {
      if (col.id === 'receipts') {
        subtotal[col.id] = String(group.receipts)
      } else if (col.id === 'payments') {
        subtotal[col.id] = String(group.payments)
      } else if (col.id === 'balance' || col.id === 'closing') {
        if (group.closing !== undefined) {
          subtotal[col.id] = String(group.closing)
        }
      }
    }
  })

  return subtotal
}

function buildFooter(footer: Record<string, string | number>): Record<string, string> {
  const result: Record<string, string> = {}
  Object.entries(footer).forEach(([key, value]) => {
    result[key] = String(value)
  })
  return result
}

function formatPreparedFrom(filterNote: string[], mode: 'none' | 'client' | 'month'): string {
  const parts = [...filterNote]

  if (mode !== 'none') {
    parts.push(`Grouped by ${mode}`)
  }

  if (parts.length === 0) {
    return 'All clients, no filters'
  }

  return parts.join(', ')
}
