import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PdfProblem, buildPdfModel, formatWhen } from './pdf.ts'
import { PAGE, layoutPdf, wrapText, type Measure, type Op } from './layout.ts'
import { APPROVER_SIG, ORG, SIG_PATH, SOURCE } from './fixture.ts'

const NOW = new Date('2026-10-13T09:00:00Z')
const measure: Measure = (t, size) => t.length * size * 0.5
const footer = (p: Op[]) => p.filter((o): o is Extract<Op, { op: 'text' }> => o.op === 'text' && o.size === 8 && o.y === 28).map((o) => o.text)
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
    { kind: 'text', label: 'gone', text: 'This question is no longer on the form.', placeholder: true },
    { kind: 'text', label: 'Comment', text: 'Not submitted yet', placeholder: true },
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
  const body = texts(pages).filter((t) => t.size !== 8)
  assert.ok(body.every((t) => t.y >= PAGE.margin + 24), 'body text runs into the footer')
  assert.deepEqual(pages.map((p) => footer(p)), pages.map((_, i) => ['Generated 13 Oct 2026, 09:00 UTC', `Page ${i + 1} of ${pages.length}`]))
  assert.equal(pages.flat().filter((o) => o.op === 'image').length, 3) // two sign-off signatures + the Signature answer
})

test('wrapText breaks a word longer than the line and keeps blank lines', () => {
  assert.deepEqual(wrapText('a'.repeat(25), 10 * 5, 10, false, measure), ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaa'])
  assert.deepEqual(wrapText('one two\r\n\r\nthree\u0007', 1000, 10, false, measure), ['one two', '', 'three'])
})

const story = (n: number) => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = 'The floor was wet near the entrance. '.repeat(n)
  return layoutPdf(buildPdfModel(src, NOW), measure)
}

test('the footer is split: generated on the left, the page number right-aligned to the column', () => {
  const pages = story(1)
  const f = texts([pages[0]]).filter((t) => t.size === 8 && t.y === 28)
  assert.deepEqual(f.map((t) => t.text), ['Generated 13 Oct 2026, 09:00 UTC', `Page 1 of ${pages.length}`])
  assert.equal(f[0].x, PAGE.margin)
  assert.ok(Math.abs(f[1].x + measure(f[1].text, 8, false) - (PAGE.width - PAGE.margin)) < 0.001)
})

test('pages 2 and up carry a running head and start the body 16pt lower', () => {
  const pages = story(300)
  const head = (p: Op[]) => texts([p]).filter((t) => t.size === 8 && t.y > PAGE.height / 2)
  assert.deepEqual(head(pages[0]), [])
  for (const p of pages.slice(1)) {
    const [h, ...rest] = head(p)
    assert.equal(h.text, 'Alpha School · Incident: Ada Lovelace')
    assert.equal(h.x, PAGE.margin)
    assert.deepEqual(rest, [])
    const first = texts([p]).filter((t) => t.size !== 8)[0]
    assert.ok(Math.abs(first.y - (PAGE.height - PAGE.margin - 16 - first.size * 1.4)) < 0.001, `body starts at ${first.y}`)
  }
  const src = structuredClone(SOURCE)
  src.record.title = 'T'.repeat(400)
  const long = texts(layoutPdf(buildPdfModel(src, NOW), measure)).filter((t) => t.size === 8 && t.y > PAGE.height / 2)
  for (const h of long) assert.ok(measure(h.text, 8, false) <= PAGE.width - 2 * PAGE.margin)
})

test('a signature has a 1pt baseline 2pt under it and its label never ends a page', () => {
  for (let n = 1; n < 80; n += 3) {
    for (const p of story(n)) {
      p.forEach((o, i) => {
        if (o.op !== 'image') return
        assert.deepEqual(p[i + 1], { op: 'rule', x: o.x, y: o.y - 2, width: o.width })
      })
    }
  }
  const src = structuredClone(SOURCE)
  const pages = layoutPdf(buildPdfModel(src, NOW), measure)
  const lastLabel = (p: Op[]) => texts([p]).filter((t) => t.size === 9 && t.bold).at(-1)?.text
  pages.forEach((p, i) => { if (lastLabel(p) === 'Signature') assert.ok(p.some((o) => o.op === 'image' && o.y < 400) || i === 0, 'signature label stranded') })
})

test('placeholders are muted, a typed "Not answered" is not', () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.name = 'Not answered'
  delete src.submissions[0].answers.story
  const t = texts(layoutPdf(buildPdfModel(src, NOW), measure)).filter((x) => x.size === 10.5 && x.text === 'Not answered')
  assert.deepEqual(t.map((x) => x.muted), [false, true])
  const m = buildPdfModel(src, NOW)
  assert.deepEqual(m.sections[0].items.slice(0, 2), [
    { kind: 'text', label: 'Full name', text: 'Not answered' },
    { kind: 'text', label: 'What happened', text: 'Not answered', placeholder: true },
  ])
})

test('negative numbers use a true minus', () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.age = -3
  const age = buildPdfModel(src, NOW).sections[0].items.find((i) => i.label === 'Age')
  assert.deepEqual(age, { kind: 'text', label: 'Age', text: '\u22123' })
})

test('a label keeps at least two value lines with it when an answer splits across pages', () => {
  let splits = 0
  for (let n = 100; n < 140; n++) {
    const pages = story(n)
    pages.forEach((p, i) => {
      const next = pages[i + 1]
      if (!next) return
      const label = texts([p]).filter((t) => t.size === 9 && t.bold).at(-1)
      if (!label || label.text !== 'What happened') return
      const after = texts([p]).filter((t) => t.size === 10.5 && t.y < label.y)
      const continues = texts([next]).filter((t) => t.size !== 8)[0]?.size === 10.5
      if (continues) { splits += 1; assert.ok(after.length >= 2, `n=${n}: only ${after.length} line(s) with the label`) }
    })
  }
  assert.ok(splits > 0, 'the sweep never split an answer')
})

test('group rows are 2pt apart', () => {
  const rows = texts(layoutPdf(buildPdfModel(SOURCE, NOW), measure)).filter((t) => t.text.startsWith('1. Name') || t.text.startsWith('2. Name'))
  assert.equal(rows.length, 2)
  assert.ok(Math.abs(rows[0].y - rows[1].y - (10.5 * 1.4 + 2)) < 0.001)
})
