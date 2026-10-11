import type { Answers } from '../forms/types.ts'
import { KEY_RE } from '../forms/schema.ts'

export type RenderContext = {
  record: { title: string; data: Answers }
  step: { assignee: { name: string } }
  link: { task: string; record: string; invite: string }
  org: { name: string }
  recipient: { name: string }
}
export type TemplateText = { subject: string; body: string }
export type Rendered = { subject: string; text: string; html: string; unknown: string[] }

export const MAX_SUBJECT = 200
export const DATA_PREFIX = 'record.data.'
/** Every variable a template may use (spec §8); `record.data.<key>` reads one answer by its form field key. */
export const VARIABLES = [
  { key: 'record.title', label: 'Record title', hint: 'The record this message is about.' },
  { key: 'step.assignee.name', label: 'Step assignee', hint: 'Who holds the task, or who completed the step the path leaves.' },
  { key: 'link.task', label: 'Task link', hint: 'Only in Task assigned and Task overdue.' },
  { key: 'link.record', label: 'Record link', hint: 'Opens the record page.' },
  { key: 'link.invite', label: 'Invite link', hint: 'Only in Invite to org.' },
  { key: 'org.name', label: 'Organisation name', hint: 'Your organisation.' },
  { key: 'recipient.name', label: 'Recipient name', hint: 'The person reading the message.' },
] as const

const TOKEN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const FIXED = new Set<string>(VARIABLES.map((v) => v.key))

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c])
export const variablesIn = (s: string) => [...s.matchAll(TOKEN)].map((m) => m[1])
export const isVariable = (key: string) => FIXED.has(key) || (key.startsWith(DATA_PREFIX) && KEY_RE.test(key.slice(DATA_PREFIX.length)))

/** An answer as one line of text: lists joined, repeating groups counted, anything else empty. */
export function valueText(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) return v.join(', ')
    return `${v.length} ${v.length === 1 ? 'row' : 'rows'}`
  }
  return ''
}

/** null = not a variable. */
function lookup(key: string, c: RenderContext): string | null {
  if (!isVariable(key)) return null
  if (key.startsWith(DATA_PREFIX)) {
    const k = key.slice(DATA_PREFIX.length)
    return Object.hasOwn(c.record.data ?? {}, k) ? valueText(c.record.data[k]) : ''
  }
  switch (key) {
    case 'record.title': return c.record.title
    case 'step.assignee.name': return c.step.assignee.name
    case 'link.task': return c.link.task
    case 'link.record': return c.link.record
    case 'link.invite': return c.link.invite
    case 'org.name': return c.org.name
    default: return c.recipient.name
  }
}

const isHttp = (v: string) => /^https?:\/\//i.test(v)
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ')

/**
 * Single pass over the template: values are inserted once and never scanned again. In `html` every literal character and
 * every value is escaped; only http(s) links become anchors. `text` is the same message unescaped, for the text part.
 */
export function render(t: TemplateText, c: RenderContext): Rendered {
  const unknown = new Set<string>()
  const fill = (s: string, literal: (x: string) => string, value: (v: string, key: string) => string) => {
    let out = ''
    let last = 0
    for (const m of s.matchAll(TOKEN)) {
      out += literal(s.slice(last, m.index))
      last = (m.index as number) + m[0].length
      const v = lookup(m[1], c)
      if (v === null) unknown.add(m[1])
      else out += value(v, m[1])
    }
    return out + literal(s.slice(last))
  }
  const subject = fill(t.subject, oneLine, (v) => oneLine(v)).trim().slice(0, MAX_SUBJECT)
  const text = fill(t.body, (x) => x, (v) => v)
  const html = fill(t.body, escapeHtml, (v, key) =>
    key.startsWith('link.') && isHttp(v) ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v))
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n')
  return { subject, text, html, unknown: [...unknown] }
}

const APP_URL_HELP = 'APP_URL must be an absolute URL such as https://reportnoreport.com/app/.'
/** The app's base URL for links in messages. Read when a function boots; throws so a bad setting stops it at once. */
export function readAppUrl(raw: string | undefined): string {
  let u: URL
  try { u = new URL(raw ?? '') } catch { throw new Error(APP_URL_HELP) }
  if (!/^https?:$/.test(u.protocol) || !u.pathname.endsWith('/app/') || u.search || u.hash || raw !== u.href) throw new Error(APP_URL_HELP)
  return u.href
}
