import type { Field } from './types.ts'

export const ORG = '0000000a-0000-0000-0000-000000000001'
export const USER = '00000000-0000-0000-0000-0000000000a3'
export const PREFIX = `${ORG}/${USER}/`

export const FORM: Field[] = [
  { key: 'name', type: 'short_text', label: 'Full name', required: true },
  { key: 'reason', type: 'long_text', label: 'Reason' },
  { key: 'leave_type', type: 'single_select', label: 'Leave type', required: true, options: ['Annual', 'Medical', 'Other'] },
  { key: 'other_reason', type: 'short_text', label: 'Other reason', required: true, show_if: { field: 'leave_type', operator: 'is', value: 'Other' } },
  { key: 'mc', type: 'file', label: 'Medical certificate', required: true, show_if: { field: 'leave_type', operator: 'is', value: 'Medical' } },
  { key: 'p2', type: 'page_break', label: 'Dates' },
  { key: 'start', type: 'date', label: 'First day', required: true },
  { key: 'end', type: 'date', label: 'Last day', required: true },
  { key: 'days', type: 'calculated', label: 'Days', expression: 'days_between(start, end) + 1' },
  { key: 'cover', type: 'multi_select', label: 'Cover arranged with', options: ['Team lead', 'Peer'] },
  { key: 'p3', type: 'page_break', label: 'Expenses' },
  {
    key: 'claims', type: 'group', label: 'Claims', repeat: { min: 0, max: 3 }, fields: [
      { key: 'item', type: 'short_text', label: 'Item', required: true },
      { key: 'amount', type: 'number', label: 'Amount', required: true },
    ],
  },
  { key: 'total', type: 'calculated', label: 'Total claimed', expression: 'sum(claims[].amount)' },
  { key: 'agree', type: 'checkbox', label: 'I confirm these details are true', required: true },
  { key: 'sig', type: 'signature', label: 'Signature', required: true },
]

export const VALID = {
  name: 'Ada', leave_type: 'Annual', start: '2026-10-12', end: '2026-10-14',
  claims: [{ item: 'Taxi', amount: 12.5 }], agree: true, sig: `${PREFIX}sig.png`,
}
