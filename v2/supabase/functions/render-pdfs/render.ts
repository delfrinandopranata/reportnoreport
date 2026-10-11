import { PDFDocument, rgb, type PDFFont, type PDFImage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import { PdfProblem, buildPdfModel, layoutPdf, type Measure, type PdfSource } from '../_shared/reports/index.ts'

export type Fonts = { regular: Uint8Array; bold: Uint8Array }

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

export async function renderPdf(src: PdfSource, now: Date, fonts: Fonts, loadImage: (path: string) => Promise<Uint8Array | null>): Promise<Uint8Array> {
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
  // Shaping a whole line per wrap step cost ~1 ms each and blew the Edge CPU limit on long answers, so words are measured
  // once and lines are summed. Kerning across a space is ignored; the 0.5% margin keeps lines inside the margin regardless.
  const words = new Map<string, number>()
  const word = (w: string, size: number, b: boolean) => {
    const k = `${b ? 1 : 0}${size}|${w}`
    let n = words.get(k)
    if (n === undefined) { n = font(b).widthOfTextAtSize(w, size); words.set(k, n) }
    return n
  }
  const measure: Measure = (t, size, b) => {
    const parts = t.split(' ')
    return 1.005 * (parts.reduce((n, w) => n + (w ? word(w, size, b) : 0), 0) + (parts.length - 1) * word(' ', size, b))
  }
  const embedded = new Map<string, PDFImage>()
  const image = async (path: string) => {
    const hit = embedded.get(path)
    if (hit) return hit
    const bytes = await loadImage(path)
    if (!bytes) throw new PdfProblem('A signature file is missing, so the PDF was not made. Ask the person to sign again.')
    if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new PdfProblem('A signature image could not be read, so the PDF was not made. Ask the person to sign again.')
    const img = await doc.embedPng(bytes)
    embedded.set(path, img)
    return img
  }
  for (const ops of layoutPdf(model, measure)) {
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
  }
  return doc.save()
}
