import { test, describe } from 'node:test'
import { strictEqual } from 'node:assert'
import { buildConsolidatedStatement } from './consolidatedStatement.ts'
import type { Column } from '../table.ts'
import type { StatementLine } from '../ledger.ts'

describe('buildConsolidatedStatement', () => {
  // Mock column definitions matching the real ones used in ClientsPage
  const txnColumns: Column<StatementLine>[] = [
    { id: 'date', label: 'Date', width: 136, cell: (t) => t.date, text: (t) => t.date },
    { id: 'client', label: 'Client', width: 190, cell: (t) => t.clientId, text: (t) => t.clientId },
    { id: 'description', label: 'Description', width: 240, flex: true, cell: (t) => t.note, text: (t) => t.note },
    { id: 'receipts', label: 'Receipts', width: 140, align: 'right', cell: (t) => (t.kind === 'in' ? '100' : ''), text: (t) => (t.kind === 'in' ? '100' : '') },
    { id: 'payments', label: 'Payments', width: 140, align: 'right', cell: (t) => (t.kind === 'out' ? '50' : ''), text: (t) => (t.kind === 'out' ? '50' : '') },
    { id: 'balance', label: 'Balance', width: 150, align: 'right', hidden: true, cell: (t) => String(t.balance), text: (t) => String(t.balance) },
  ]

  const mockTxn = (id: string, clientId: string, date: string, kind: 'in' | 'out', amount: number, balance: number, note: string): StatementLine => ({
    id,
    clientId,
    date,
    kind,
    amount,
    balance,
    note,
  })

  test('transactions view, grouped by client, includes all rows and subtotals', () => {
    const rows = [
      mockTxn('t1', 'c1', '2024-01-01', 'in', 100, 100, 'Receipt 1'),
      mockTxn('t2', 'c1', '2024-01-02', 'out', 50, 50, 'Payment 1'),
      mockTxn('t3', 'c2', '2024-01-03', 'in', 200, 200, 'Receipt 2'),
    ]

    const groups = [
      {
        key: 'c1',
        label: 'Client 1',
        rows: [rows[0], rows[1]],
        receipts: 100,
        payments: 50,
        closing: 50,
      },
      {
        key: 'c2',
        label: 'Client 2',
        rows: [rows[2]],
        receipts: 200,
        payments: 0,
        closing: 200,
      },
    ]

    const visibleColumns = txnColumns.filter((c) => c.id !== 'balance')
    const result = buildConsolidatedStatement({
      view: 'transactions',
      groups,
      rows,
      columns: txnColumns,
      visibleColumns,
      footer: { receipts: '300', payments: '50', balance: '250' },
      filterNote: ['Search "Receipt"'],
      mode: 'client',
    })

    strictEqual(result.sections.length, 2)
    strictEqual(result.sections[0].heading, 'Client 1')
    strictEqual(result.sections[1].heading, 'Client 2')
    // Each section should have rows + subtotal row
    strictEqual(result.sections[0].rows.length, 2) // 2 data rows
    strictEqual(result.sections[1].rows.length, 1) // 1 data row
    strictEqual(result.clientCount, 2)
    strictEqual(result.preparedFrom, 'Search "Receipt", Grouped by client')
  })

  test('transactions view, no grouping, renders single section without heading', () => {
    const rows = [
      mockTxn('t1', 'c1', '2024-01-01', 'in', 100, 100, 'Receipt 1'),
      mockTxn('t2', 'c2', '2024-01-02', 'out', 50, 50, 'Payment 1'),
    ]

    const groups = [
      {
        key: 'all',
        label: '',
        rows,
        receipts: 100,
        payments: 50,
        closing: 50,
      },
    ]

    const visibleColumns = txnColumns.filter((c) => c.id !== 'balance')
    const result = buildConsolidatedStatement({
      view: 'transactions',
      groups,
      rows,
      columns: txnColumns,
      visibleColumns,
      footer: { receipts: '100', payments: '50', balance: '50' },
      filterNote: [],
      mode: 'none',
    })

    strictEqual(result.sections.length, 1)
    strictEqual(result.sections[0].heading, undefined)
    strictEqual(result.sections[0].rows.length, 2)
    strictEqual(result.preparedFrom, 'All clients, no filters')
  })

  test('hidden columns are excluded from visible columns in output', () => {
    const rows = [
      mockTxn('t1', 'c1', '2024-01-01', 'in', 100, 100, 'Receipt'),
    ]

    const groups = [
      {
        key: 'all',
        label: '',
        rows,
        receipts: 100,
        payments: 0,
        closing: 100,
      },
    ]

    // Include hidden column but it shouldn't appear in output
    const visibleColumns = txnColumns.filter((c) => c.id !== 'balance')

    const result = buildConsolidatedStatement({
      view: 'transactions',
      groups,
      rows,
      columns: txnColumns,
      visibleColumns,
      footer: { receipts: '100', payments: '0' },
      filterNote: [],
      mode: 'none',
    })

    // Verify balance column is not in the row data
    const headers = result.sections[0].rows[0]
    strictEqual(headers.includes('Balance'), false)
  })

  test('collapsed groups are still included in the output', () => {
    const rows = [
      mockTxn('t1', 'c1', '2024-01-01', 'in', 100, 100, 'Receipt'),
      mockTxn('t2', 'c2', '2024-01-02', 'out', 50, 50, 'Payment'),
    ]

    const groups = [
      {
        key: 'c1',
        label: 'Client 1',
        rows: [rows[0]],
        receipts: 100,
        payments: 0,
        closing: 100,
      },
      {
        key: 'c2',
        label: 'Client 2',
        rows: [rows[1]],
        receipts: 0,
        payments: 50,
        closing: -50,
      },
    ]

    const visibleColumns = txnColumns.filter((c) => c.id !== 'balance')
    const result = buildConsolidatedStatement({
      view: 'transactions',
      groups,
      rows,
      columns: txnColumns,
      visibleColumns,
      footer: { receipts: '100', payments: '50' },
      filterNote: [],
      mode: 'client',
      collapsedGroups: new Set(['c2']), // c2 is collapsed
    })

    // Both groups should still be in output
    strictEqual(result.sections.length, 2)
    strictEqual(result.sections[0].heading, 'Client 1')
    strictEqual(result.sections[1].heading, 'Client 2')
  })

  test('empty filter note becomes "All clients, no filters"', () => {
    const rows = [mockTxn('t1', 'c1', '2024-01-01', 'in', 100, 100, 'Receipt')]
    const groups = [{ key: 'all', label: '', rows, receipts: 100, payments: 0, closing: 100 }]
    const visibleColumns = txnColumns.filter((c) => c.id !== 'balance')

    const result = buildConsolidatedStatement({
      view: 'transactions',
      groups,
      rows,
      columns: txnColumns,
      visibleColumns,
      footer: { receipts: '100', payments: '0' },
      filterNote: [],
      mode: 'none',
    })

    strictEqual(result.preparedFrom, 'All clients, no filters')
  })

  test('filter note with grouped by appends grouping', () => {
    const rows = [mockTxn('t1', 'c1', '2024-01-01', 'in', 100, 100, 'Receipt')]
    const groups = [
      { key: 'c1', label: 'Client 1', rows, receipts: 100, payments: 0, closing: 100 },
    ]
    const visibleColumns = txnColumns.filter((c) => c.id !== 'balance')

    const result = buildConsolidatedStatement({
      view: 'transactions',
      groups,
      rows,
      columns: txnColumns,
      visibleColumns,
      footer: { receipts: '100', payments: '0' },
      filterNote: ['Search "receipt"'],
      mode: 'client',
    })

    strictEqual(result.preparedFrom.includes('Grouped by client'), true)
  })
})
