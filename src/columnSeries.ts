/** Money in and out are never colour alone: the ledger header carries the arrow and these words (v2/design/components/LedgerTable). */
export function seriesOf(columnId: string): { series: 'in' | 'out'; word: 'Receipts' | 'Payments' } | null {
  if (columnId === 'receipts') return { series: 'in', word: 'Receipts' }
  if (columnId === 'payments') return { series: 'out', word: 'Payments' }
  return null
}
