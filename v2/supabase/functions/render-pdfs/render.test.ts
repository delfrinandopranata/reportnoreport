import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'npm:pdf-lib@1.17.1'
import { loadFonts, plainAdvance, renderPdf } from './render.ts'
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

Deno.test('both Inter fonts are embedded as subsets', async () => {
  const bytes = await renderPdf(SOURCE, NOW, fonts, () => Promise.resolve(PNG_1X1))
  const doc = await PDFDocument.load(bytes)
  // A subset carries a six-capital tag on its BaseFont (PDF 32000-1 §9.6.4), which is how pdffonts reports "sub: yes".
  const names = doc.context.enumerateIndirectObjects().flatMap(([, o]) => {
    const n = o instanceof PDFDict ? o.get(PDFName.of('BaseFont')) : undefined
    return n instanceof PDFName ? [n.decodeText()] : []
  })
  assertEquals([...new Set(names)].sort(), ['RNRAAA+Inter-Regular', 'RNRAAB+Inter-SemiBold'])
  assertEquals(bytes.length < 60_000, true, `the full fonts are 830 kB; this PDF is ${bytes.length} bytes`)
})

// Random words of random length: the realistic worst case. Repeated text lets any word cache hide the cost (QA-P5-1).
function randomText(n: number, seed: number): string {
  let s = seed
  const r = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  let out = ''
  while (out.length < n) out += Array.from({ length: 2 + Math.floor(r() * 9) }, () => String.fromCharCode(97 + Math.floor(r() * 26))).join('') + (r() < 0.1 ? '. ' : ' ')
  return out.slice(0, n)
}

Deno.test('two 10,000-character answers render inside the Edge CPU budget (the Edge runtime is about 3x slower than this)', async () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = randomText(10_000, 7)
  src.submissions[1].answers.comment = randomText(10_000, 11)
  const t = performance.now()
  const bytes = await renderPdf(src, NOW, fonts, () => Promise.resolve(PNG_1X1))
  const ms = performance.now() - t
  assertEquals((await PDFDocument.load(bytes)).getPageCount() >= 5, true)
  assertEquals(ms < 400, true, `took ${ms.toFixed(0)} ms`)
})

Deno.test('6,000 characters with both signatures stay inside the budget', async () => {
  const src = structuredClone(SOURCE)
  src.submissions[0].answers.story = randomText(6_000, 3)
  const t = performance.now()
  await renderPdf(src, NOW, fonts, () => Promise.resolve(PNG_1X1))
  const ms = performance.now() - t
  assertEquals(ms < 300, true, `took ${ms.toFixed(0)} ms`)
})

Deno.test('a render that spends more than its budget fails fast with a reason people can act on', async () => {
  await assertRejects(() => renderPdf(SOURCE, NOW, fonts, () => Promise.resolve(PNG_1X1), 0), PdfProblem,
    'This record has more content than one PDF can hold, so the PDF was not made. Ask a reports manager to remove long fields from the PDF template.')
})

Deno.test('measuring by advances matches the width pdf-lib draws, so lines stay inside the margin', async () => {
  const doc = await PDFDocument.create()
  doc.registerFontkit((await import('npm:@pdf-lib/fontkit@1.1.1')).default)
  const f = await doc.embedFont(fonts.regular, { subset: true })
  const adv = plainAdvance(f)
  for (const s of ['The floor was wet near the entrance.', 'AVAVA To Ty', 'Łódź Ünïcødé — 12,345.67']) {
    const measured = [...s].reduce((n, ch) => n + adv(ch), 0) * 10.5
    assertEquals(Math.abs(measured - f.widthOfTextAtSize(s, 10.5)) < 0.01, true, s)
  }
})
