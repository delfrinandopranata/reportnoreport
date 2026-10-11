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

/** Places the model on A4 pages (PDF coordinates, origin bottom-left), to design spec §3.4. A heading never ends a page; a sign-off entry never splits. */
export function layoutPdf(m: PdfModel, measure: Measure): Op[][] {
  const { width: W, height: H, margin: M } = PAGE
  const inner = W - 2 * M
  const pages: Op[][] = [[]]
  let y = H - M
  const page = () => pages[pages.length - 1]
  const newPage = () => {
    pages.push([])
    // Running head: a loose sheet can be matched to its record. Truncated with an ellipsis to the column.
    let head = `${m.org} · ${m.title}`.replace(/\s+/g, ' ')
    while (head.length > 1 && measure(head, 8, false) > inner) head = `${head.slice(0, -2).trimEnd()}…`
    page().push({ op: 'text', x: M, y: H - M - 8, size: 8, bold: false, muted: true, text: head })
    y = H - M - 16
  }
  const need = (h: number) => { if (y - h < M + FOOTER) newPage() }
  const gap = (h: number) => { y -= h }
  const wrap = (text: string, size: number, bold: boolean, indent = 0) => wrapText(text, inner - indent, size, bold, measure)
  const put = (ls: string[], size: number, bold: boolean, muted: boolean, indent = 0) => {
    for (const l of ls) {
      need(size * LEAD)
      y -= size * LEAD
      page().push({ op: 'text', x: M + indent, y, size, bold, muted, text: l })
    }
  }
  const lines = (text: string, size: number, bold: boolean, muted: boolean, indent = 0) => put(wrap(text, size, bold, indent), size, bold, muted, indent)
  const image = (path: string) => {
    need(SIG.height + 6)
    y -= SIG.height + 6
    page().push({ op: 'image', x: M, y, width: SIG.width, height: SIG.height, path })
    page().push({ op: 'rule', x: M, y: y - 2, width: SIG.width }) // baseline
  }
  const heading = (text: string) => {
    gap(14)
    need(12 * LEAD + 8 + 9 * LEAD + 2 * 10.5 * LEAD)
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
      if (it.kind === 'signature') need(9 * LEAD + SIG.height + 6) // label and image never separate
      else if (it.kind === 'text') need(9 * LEAD + Math.min(2, wrap(it.text, 10.5, false).length) * 10.5 * LEAD) // label + two lines
      else need(9 * LEAD + 10.5 * LEAD)
      lines(it.label, 9, true, true)
      if (it.kind === 'text') lines(it.text, 10.5, false, !!it.placeholder)
      else if (it.kind === 'rows') it.rows.forEach((r, i) => { if (i) gap(2); lines(r, 10.5, false, false, 12) })
      else image(it.path)
    }
  }
  if (m.signoffs.length) {
    heading('Sign-off')
    for (const s of m.signoffs) {
      gap(6)
      need(9 * LEAD + 10.5 * LEAD + (s.signature ? SIG.height + 6 : 0))
      lines(s.step, 9, true, true)
      lines(s.line, 10.5, false, s.line === 'Not done yet')
      if (s.signature) image(s.signature)
    }
  }
  return pages.map((ops, i) => {
    const right = `Page ${i + 1} of ${pages.length}`
    return [...ops,
      { op: 'text', x: M, y: M / 2, size: 8, bold: false, muted: true, text: m.generated } as Op,
      { op: 'text', x: M + inner - measure(right, 8, false), y: M / 2, size: 8, bold: false, muted: true, text: right } as Op]
  })
}
