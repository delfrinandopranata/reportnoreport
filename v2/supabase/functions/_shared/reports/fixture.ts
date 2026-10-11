import type { Answers, Field } from '../forms/index.ts'
import { ORG, PREFIX, USER } from '../forms/fixture.ts'
import type { Graph } from '../workflow/graph.ts'
import type { ReportRecord, RunCtx } from './run.ts'
import type { PdfSource } from './pdf.ts'

export { ORG, USER }
export const APPROVER = '00000000-0000-0000-0000-0000000000a2'
export const F_ALL = '0000000a-0000-0000-0000-0000000000f7'
export const F_OK = '0000000a-0000-0000-0000-0000000000f8'
export const SIG_PATH = `${PREFIX}sig.png`
export const APPROVER_SIG = `${ORG}/${APPROVER}/ok.png`

/** Every answerable field type, one hidden by show_if, and a page break that never prints. */
export const ALL_TYPES: Field[] = [
  { key: 'name', type: 'short_text', label: 'Full name' },
  { key: 'story', type: 'long_text', label: 'What happened' },
  { key: 'age', type: 'number', label: 'Age' },
  { key: 'when', type: 'date', label: 'Date' },
  { key: 'kind', type: 'single_select', label: 'Kind', options: ['Fall', 'Other'] },
  { key: 'details', type: 'short_text', label: 'Other details', show_if: { field: 'kind', operator: 'is', value: 'Other' } },
  { key: 'tags', type: 'multi_select', label: 'Tags', options: ['Urgent', 'Outdoor'] },
  { key: 'agree', type: 'checkbox', label: 'Confirmed' },
  { key: 'photo', type: 'file', label: 'Photo' },
  { key: 'pb', type: 'page_break', label: 'More' },
  {
    key: 'witnesses', type: 'group', label: 'Witnesses', repeat: { min: 0, max: 5 }, fields: [
      { key: 'who', type: 'short_text', label: 'Name' },
      { key: 'age', type: 'number', label: 'Age' },
    ],
  },
  { key: 'score', type: 'calculated', label: 'Score', expression: 'age + 1' },
  { key: 'sig', type: 'signature', label: 'Signature' },
]
export const OK_FORM: Field[] = [
  { key: 'comment', type: 'long_text', label: 'Comment' },
  { key: 'ok_sig', type: 'signature', label: 'Approver signature' },
]
export const ALL_ANSWERS: Answers = {
  name: 'Ada Lovelace', story: 'Slipped on the wet floor.', age: 34.5, when: '2026-10-12', kind: 'Fall',
  details: 'smuggled', tags: ['Urgent', 'Outdoor'], agree: true,
  photo: `${PREFIX}0f0e0d0c-0000-4000-8000-000000000001-floor.jpg`,
  witnesses: [{ who: 'Ben', age: 40 }, { who: 'Cy' }], score: 35.5, sig: SIG_PATH,
}

const at = { x: 0, y: 0 }
export const GRAPH: Graph = {
  nodes: [
    { id: 'start', type: 'start', formId: F_ALL, position: at },
    { id: 'approve', type: 'form', label: 'Manager approval', formId: F_OK, assignee: { user: APPROVER }, mode: 'approve', position: at },
    { id: 'done', type: 'end', status: 'done', position: at },
  ],
  edges: [
    { id: 'e1', from: 'start', outcome: 'submitted', to: 'approve', actions: [] },
    { id: 'e2', from: 'approve', outcome: 'approved', to: 'done', actions: [{ type: 'generate_pdf' }] },
  ],
}

const FIELD_KEYS = ['name', 'story', 'age', 'when', 'kind', 'details', 'tags', 'agree', 'photo', 'witnesses', 'score', 'sig']
export const SOURCE: PdfSource = {
  orgId: ORG, orgName: 'Alpha School', workflowName: 'Incident report', graph: GRAPH,
  record: { id: '0000000a-0000-0000-0000-00000000d001', title: 'Incident: Ada Lovelace', status: 'done', started_by: USER, created_at: '2026-10-12T08:30:00Z' },
  template: {
    header: 'Incident record\nAlpha School, Health and Safety',
    fields: [...FIELD_KEYS.map((key) => ({ nodeId: 'start', key })), { nodeId: 'approve', key: 'comment' }],
    signoff: ['start', 'approve'],
  },
  forms: { [F_ALL]: ALL_TYPES, [F_OK]: OK_FORM },
  submissions: [
    { node_id: 'start', answers: ALL_ANSWERS, submitted_by: USER, outcome: 'submitted', created_at: '2026-10-12T08:30:00Z' },
    { node_id: 'approve', answers: { comment: 'Seen.', ok_sig: APPROVER_SIG }, submitted_by: APPROVER, outcome: 'approved', created_at: '2026-10-12T14:05:00Z' },
  ],
  names: { [USER]: 'Ada Lovelace', [APPROVER]: 'Grace Hopper' },
}

/** A valid 1×1 PNG, for signatures in render tests. */
export const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

export const CTX: RunCtx = {
  now: new Date('2026-10-11T12:00:00Z'),
  stepName: (id) => (id === 'approve' ? 'Manager approval' : 'Start'),
  personName: (id) => (id === USER ? 'Ada Lovelace' : 'Former member'),
}
export const rec = (id: string, data: Answers, extra: Partial<ReportRecord> = {}): ReportRecord => ({
  id, title: `Leave: ${id}`, status: 'done', label: null, current_node_id: null, started_by: USER,
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-02T09:00:00Z', data, ...extra,
})
