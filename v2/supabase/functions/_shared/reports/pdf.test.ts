import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PdfProblem, buildPdfModel, formatWhen } from './pdf.ts'
import { PAGE, layoutPdf, wrapText, type Measure, type Op } from './layout.ts'
import { APPROVER_SIG, ORG, SIG_PATH, SOURCE } from './fixture.ts'

const NOW = new Date('2026-10-13T09:00:00Z')
const measure: Measure = (t, size) => t.length * size * 0.5
const texts = (pages: Op[][]) => pages.flat().filter((o): o is Extract<Op, { op: 'text' }> => o.op === 'text')

test('the model renders every field type and omits hidden fields', () => {
  const m = buildPdfModel(SOURCE, NOW)
  assert.deepEqual([m.org, m.title, m.header], ['Alpha School', 'Incident: Ada Lovelace', 'Incident record\nAlpha School, Health and Safety'])
  assert.deepEqual(m.meta, ['Workflow: Incident report', 'Status: Done', 'Started 12 Oct 2026, 08:30 UTC by Ada Lovelace'])
  assert.deepEqual(m.sections.map((s) => s.step), ['Start', 'Manager approval'])
  assert.deepEqual(m.sections[0].items, [
    { kind: 'text', label: 'Full name', text: 'Ada Lovelace' },
    { kind: 'text', label: 'What happened', text: 'Slipped on the wet floor.' },
    { kind: 'text', label: 'Age', text: '34.5' },
    { kind: 'text', label: 'Date', text: '12 Oct 2026' },
    { kind: 'text', label: 'Kind', text: 'Fall' },
    { kind: 'text', label: 'Tags', text: 'Urgent, Outdoor' },
    { kind: 'text', label: 'Confirmed', text: 'Yes' },
    { kind: 'text', label: 'Photo', text: 'floor.jpg' },
    { kind: 'rows', label: 'Witnesses', rows: ['1. Name: Ben · Age: 40', '2. Name: Cy · Age: Not answered'] },
    { kind: 'text', label: 'Score', text: '35.5' },
    { kind: 'signature', label: 'Signature', path: SIG_PATH },
  ])
  assert.equal(JSON.stringify(m).includes('smuggled'), false) // "Other details" was hidden by show_if
  assert.deepEqual(m.sections[1].items, [{ kind: 'text', label: 'Comment', text: 'Seen.' }])
  assert.equal(m.generated, 'Generated 13 Oct 2026, 09:00 UTC')
})

test('a question removed from the form and a step not yet submitted say so', () => {
  const src = structuredClone(SOURCE)
  src.template.fields.splice(-1, 0, { nodeId: 'start', key: 'gone' }) // before the approval step's field
  src.submissions = src.submissions.slice(0, 1)
  const m = buildPdfModel(src, NOW)
  assert.deepEqual(m.sections.map((s) => s.items.at(-1)), [
    { kind: 'text', label: 'gone', text: 'This question is no longer on the form.' },
    { kind: 'text', label: 'Comment', text: 'Not submitted yet' },
  ])
  assert.deepEqual(m.signoffs[1], { step: 'Manager approval', line: 'Not done yet', signature: null })
})

test('sign-off lists name, outcome, UTC time and signature', () => {
  assert.equal(formatWhen('2026-10-12T14:05:00Z'), '12 Oct 2026, 14:05 UTC')
  assert.deepEqual(buildPdfModel(SOURCE, NOW).signoffs, [
    { step: 'Start', line: 'Submitted by Ada Lovelace · 12 Oct 2026, 08:30 UTC', signature: SIG_PATH },
    { step: 'Manager approval', line: 'Approved by Grace Hopper · 12 Oct 2026, 14:05 UTC', signature: APPROVER_SIG },
  ])
})

test('a signature stored outside the record\'s organisation is refused', () => {
  const src = structuredClone(SOURCE)
  src.submissions[1].answers.ok_sig = `0000000b-0000-0000-0000-000000000001/${ORG.slice(0, 8)}/x.png`
  assert.throws(() => buildPdfModel(src, NOW), (e: unknown) =>
    e instanceof PdfProblem && e.message === 'A signature on "Manager approval" is not stored with this organisation, so the PDF was not made.')
})

test('long text wraps inside the margin and breaks pages', () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = 'The floor was wet near the entrance. '.repeat(300) // about 11,000 characters
  const pages = layoutPdf(buildPdfModel(src, NOW), measure)
  assert.ok(pages.length >= 3, `expected at least 3 pages, got ${pages.length}`)
  for (const t of texts(pages)) assert.ok(t.x + measure(t.text, t.size, t.bold) <= PAGE.width - PAGE.margin + 0.001, `overflows: ${t.text}`)
  const body = texts(pages).filter((t) => !t.text.includes(' · Page '))
  assert.ok(body.every((t) => t.y >= PAGE.margin + 24), 'body text runs into the footer')
  assert.deepEqual(pages.map((p) => (p.at(-1) as { text: string }).text),
    pages.map((_, i) => `Generated 13 Oct 2026, 09:00 UTC · Page ${i + 1} of ${pages.length}`))
  assert.equal(pages.flat().filter((o) => o.op === 'image').length, 3) // two sign-off signatures + the Signature answer
})

test('wrapText breaks a word longer than the line and keeps blank lines', () => {
  assert.deepEqual(wrapText('a'.repeat(25), 10 * 5, 10, false, measure), ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaa'])
  assert.deepEqual(wrapText('one two\r\n\r\nthree\u0007', 1000, 10, false, measure), ['one two', '', 'three'])
})
