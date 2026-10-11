import type { Cell } from './run.ts'

// OWASP CSV injection: a spreadsheet runs a text cell that starts with one of these as a formula.
const FORMULA = /^[=+\-@\t\r]/

/** RFC 4180 cell. Numbers are not text, so they are never prefixed (a negative stays a number). */
export function csvCell(v: Cell): string {
  if (v === null) return ''
  if (typeof v === 'number') return String(v)
  const s = FORMULA.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** BOM so Excel reads UTF-8 names; CRLF rows. Header labels are guarded like data. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/** "Leave days by type" on 2026-10-11 → leave-days-by-type-2026-10-11.csv; run-report and the browser name files alike. */
export const csvFilename = (name: string, day: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report'}-${day}.csv`
