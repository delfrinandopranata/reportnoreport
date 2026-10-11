import { PDFDocument, rgb, type PDFFont, type PDFImage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import { PdfProblem, buildPdfModel, layoutPdf, type Measure, type PdfSource } from '../_shared/reports/index.ts'

export type Fonts = { regular: Uint8Array; bold: Uint8Array }

// shortcut: Inter covers Latin, Greek and Cyrillic only. Tamil, CJK and other scripts draw as the font's empty box (QA-P5-2);
// add a Noto subset per script (embed a third font and pick per character) when an organisation needs those names on a PDF.
// Text is also laid out without shaping (no kerning, ligatures or mark positioning): fontkit's shaping took ~25 ms per
// 1,000 characters, which put two 10,000-character answers over the Edge CPU limit. Latin text reads the same; scripts
// that need shaping (Arabic, Indic) are unsupported anyway. Widths are then plain advances, so measure() and the drawn text agree exactly.

/** The Edge runtime kills a request at 2 s of CPU; a render that has used this much stops and says why instead. */
export const RENDER_BUDGET_MS = 1200
const TOO_BIG = 'This record has more content than one PDF can hold, so the PDF was not made. Ask a reports manager to remove long fields from the PDF template.'
const NO_FEATURES = { ccmp: false, locl: false, rlig: false, clig: false, calt: false, liga: false, mark: false, mkmk: false, kern: false }

type Fontkit = { unitsPerEm: number; glyphForCodePoint(cp: number): { advanceWidth: number }; layout(s: string, features?: unknown): unknown }

/** Turns off shaping for this embedded font and returns its per-character advance (em units), cached. */
export function plainAdvance(f: PDFFont): (ch: string) => number {
  const fk = (f as unknown as { embedder: { font: Fontkit } }).embedder.font
  const shape = fk.layout.bind(fk)
  fk.layout = (s: string) => shape(s, NO_FEATURES)
  const cache = new Map<string, number>()
  return (ch) => {
    let n = cache.get(ch)
    if (n === undefined) { n = fk.glyphForCodePoint(ch.codePointAt(0)!).advanceWidth / fk.unitsPerEm; cache.set(ch, n) }
    return n
  }
}

// Light-theme tokens from design/tokens.css: ink #18181b, ink-muted #71717a, line-200 #e4e4e7. Paper is always light.
const INK = rgb(24 / 255, 24 / 255, 27 / 255)
const MUTED = rgb(113 / 255, 113 / 255, 122 / 255)
const LINE = rgb(228 / 255, 228 / 255, 231 / 255)
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

/** Read once at boot; throws when a font is missing, so a bad deploy fails before it renders anything. */
export async function loadFonts(): Promise<Fonts> {
  const read = (name: string) => Deno.readFile(new URL(`./fonts/${name}`, import.meta.url))
  return { regular: await read('Inter-Regular.ttf'), bold: await read('Inter-SemiBold.ttf') }
}

export async function renderPdf(
  src: PdfSource, now: Date, fonts: Fonts, loadImage: (path: string) => Promise<Uint8Array | null>, budgetMs = RENDER_BUDGET_MS,
): Promise<Uint8Array> {
  const started = performance.now()
  let waited = 0 // time spent awaiting storage is not CPU
  const check = () => { if (performance.now() - started - waited >= budgetMs) throw new PdfProblem(TOO_BIG) }
  const model = buildPdfModel(src, now)
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(model.title)
  doc.setCreator('ReportNoReport')
  doc.setProducer('ReportNoReport')
  doc.setCreationDate(now)
  const regular = await doc.embedFont(fonts.regular, { subset: true, customName: 'RNRAAA+Inter-Regular' })
  const bold = await doc.embedFont(fonts.bold, { subset: true, customName: 'RNRAAB+Inter-SemiBold' }) // the six-capital tag marks a subset to PDF readers; pdf-lib only adds a numeric suffix
  const font = (b: boolean): PDFFont => (b ? bold : regular)
  const advance = { false: plainAdvance(regular), true: plainAdvance(bold) }
  const measure: Measure = (t, size, b) => {
    const adv = advance[String(b) as 'true' | 'false']
    let n = 0
    for (const ch of t) n += adv(ch)
    return n * size
  }
  const embedded = new Map<string, PDFImage>()
  const image = async (path: string) => {
    const hit = embedded.get(path)
    if (hit) return hit
    const t0 = performance.now()
    const bytes = await loadImage(path)
    waited += performance.now() - t0
    if (!bytes) throw new PdfProblem('A signature file is missing, so the PDF was not made. Ask the person to sign again.')
    if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new PdfProblem('A signature image could not be read, so the PDF was not made. Ask the person to sign again.')
    const img = await doc.embedPng(bytes)
    embedded.set(path, img)
    return img
  }
  const pages = layoutPdf(model, measure)
  check()
  for (const ops of pages) {
    const page = doc.addPage([595.28, 841.89])
    for (const o of ops) {
      if (o.op === 'text') page.drawText(o.text, { x: o.x, y: o.y, size: o.size, font: font(o.bold), color: o.muted ? MUTED : INK })
      else if (o.op === 'rule') page.drawLine({ start: { x: o.x, y: o.y }, end: { x: o.x + o.width, y: o.y }, thickness: 1, color: LINE })
      else {
        const img = await image(o.path)
        const fit = img.scaleToFit(o.width, o.height) // keeps the drawn signature's proportions inside its box
        page.drawImage(img, { x: o.x, y: o.y + (o.height - fit.height), width: fit.width, height: fit.height })
      }
    }
    check()
  }
  return doc.save()
}
