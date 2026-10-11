import type { PdfModel } from './pdf.ts'

export const PAGE = { width: 595.28, height: 841.89, margin: 56 } as const // A4 in points
export const SIG = { width: 180, height: 72 } as const
const FOOTER = 24
const LEAD = 1.4
export type Measure = (text: string, size: number, bold: boolean) => number
export type Op =
  | { op: 'text'; x: number; y: number; size: number; bold: boolean; muted: boolean; text: string }
  | { op: 'image'; x: number; y: number; width: number; height: number; path: string }
  | { op: 'rule'; x: number; y: number; width: number }

// Control characters other than the line breaks wrapText handles would draw as boxes or break the content stream.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g

/** Greedy word wrap; a word wider than the line breaks by character. Blank lines are kept. */
export function wrapText(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const fits = (s: string) => measure(s, size, bold) <= width
  const lines: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONTROL, '').split('\n')) {
    let line = ''
    for (const word of para.split(/ +/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (fits(next)) { line = next; continue }
      if (line) lines.push(line)
      let rest = Array.from(word) // by code point, so a surrogate pair is never split
      while (!fits(rest.join(''))) {
        let n = 1
        while (n < rest.length && fits(rest.slice(0, n + 1).join(''))) n++
        lines.push(rest.slice(0, n).join(''))
        rest = rest.slice(n)
      }
      line = rest.join('')
    }
    lines.push(line)
  }
  return lines
}

/** Places the model on A4 pages (PDF coordinates, origin bottom-left). A heading never ends a page; a sign-off entry never splits. */
export function layoutPdf(m: PdfModel, measure: Measure): Op[][] {
  const { width: W, height: H, margin: M } = PAGE
  const inner = W - 2 * M
  const pages: Op[][] = [[]]
  let y = H - M
  const page = () => pages[pages.length - 1]
  const need = (h: number) => { if (y - h < M + FOOTER) { pages.push([]); y = H - M } }
  const gap = (h: number) => { y -= h }
  const lines = (text: string, size: number, bold: boolean, muted: boolean, indent = 0) => {
    for (const l of wrapText(text, inner - indent, size, bold, measure)) {
      need(size * LEAD)
      y -= size * LEAD
      page().push({ op: 'text', x: M + indent, y, size, bold, muted, text: l })
    }
  }
  const image = (path: string) => {
    need(SIG.height + 6)
    y -= SIG.height + 6
    page().push({ op: 'image', x: M, y, width: SIG.width, height: SIG.height, path })
  }
  const heading = (text: string) => {
    gap(14)
    need(12 * LEAD + 8 + 9 * LEAD + 10.5 * LEAD)
    lines(text, 12, true, false)
    page().push({ op: 'rule', x: M, y: y - 4, width: inner })
    gap(8)
  }

  lines(m.org, 9, false, true)
  lines(m.title, 18, true, false)
  if (m.header.trim()) { gap(4); lines(m.header, 11, false, false) }
  gap(6)
  for (const t of m.meta) lines(t, 9, false, true)
  for (const s of m.sections) {
    heading(s.step)
    for (const it of s.items) {
      gap(6)
      need(9 * LEAD + 10.5 * LEAD)
      lines(it.label, 9, true, true)
      if (it.kind === 'text') lines(it.text, 10.5, false, false)
      else if (it.kind === 'rows') for (const r of it.rows) lines(r, 10.5, false, false, 12)
      else image(it.path)
    }
  }
  if (m.signoffs.length) {
    heading('Sign-off')
    for (const s of m.signoffs) {
      gap(6)
      need(9 * LEAD + 10.5 * LEAD * 2 + (s.signature ? SIG.height + 6 : 0))
      lines(s.step, 9, true, true)
      lines(s.line, 10.5, false, false)
      if (s.signature) image(s.signature)
    }
  }
  return pages.map((ops, i) => [...ops, {
    op: 'text', x: M, y: M / 2, size: 8, bold: false, muted: true, text: `${m.generated} · Page ${i + 1} of ${pages.length}`,
  } as Op])
}
