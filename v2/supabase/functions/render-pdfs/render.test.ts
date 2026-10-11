import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PDFDocument, PDFName, PDFRawStream } from 'npm:pdf-lib@1.17.1'
import { loadFonts, renderPdf } from './render.ts'
import { PdfProblem } from '../_shared/reports/pdf.ts'
import { APPROVER_SIG, PNG_1X1, SIG_PATH, SOURCE } from '../_shared/reports/fixture.ts'

const NOW = new Date('2026-10-13T09:00:00Z')
const fonts = await loadFonts()
const images = (doc: PDFDocument) => doc.context.enumerateIndirectObjects()
  .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length

Deno.test('renders a valid multi-page PDF with embedded signatures', async () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = 'The floor was wet near the entrance. '.repeat(300)
  const asked: string[] = []
  const bytes = await renderPdf(src, NOW, fonts, (p) => { asked.push(p); return Promise.resolve(PNG_1X1) })
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-')
  const doc = await PDFDocument.load(bytes)
  assertEquals(doc.getTitle(), 'Incident: Ada Lovelace')
  assertEquals(doc.getPageCount() >= 3, true)
  assertEquals([...new Set(asked)].sort(), [APPROVER_SIG, SIG_PATH].sort()) // each image fetched, and embedded once
  assertEquals(images(doc) >= 2, true)
})

Deno.test('names outside Latin-1 render with the embedded font', async () => {
  const src = structuredClone(SOURCE)
  src.record.title = 'Siti Nurhaliza — Łódź, Ünïcødé, Tamil: தமிழ்'
  const bytes = await renderPdf(src, NOW, fonts, () => Promise.resolve(PNG_1X1))
  assertEquals((await PDFDocument.load(bytes)).getPageCount() >= 1, true)
})

Deno.test('a missing signature file is a PdfProblem', async () => {
  await assertRejects(() => renderPdf(SOURCE, NOW, fonts, () => Promise.resolve(null)), PdfProblem,
    'A signature file is missing, so the PDF was not made. Ask the person to sign again.')
})

Deno.test('a signature that is not a PNG is a PdfProblem', async () => {
  await assertRejects(() => renderPdf(SOURCE, NOW, fonts, () => Promise.resolve(new TextEncoder().encode('GIF89a'))), PdfProblem,
    'A signature image could not be read, so the PDF was not made. Ask the person to sign again.')
})

Deno.test('an 11,000-character answer renders well inside the Edge CPU limit', async () => {
  const src = structuredClone(SOURCE)
  // Unique words defeat any measuring cache: the case that took over 2 s when every wrap step shaped a whole line.
  src.submissions[0].answers.story = Array.from({ length: 1800 }, (_, i) => `w${(i * 7919).toString(36)}`).join(' ')
  const t = performance.now()
  const bytes = await renderPdf(src, NOW, fonts, () => Promise.resolve(PNG_1X1))
  const ms = performance.now() - t
  assertEquals((await PDFDocument.load(bytes)).getPageCount() >= 3, true)
  assertEquals(ms < 1500, true, `took ${ms.toFixed(0)} ms`)
})
