import { KEY_RE } from '../forms/schema.ts'
import { toCsv } from '../reports/csv.ts'
import type { Cell } from '../reports/run.ts'
import { EMAIL_RE } from './recipients.ts'
import { escapeHtml, variablesIn, type RenderContext, type TemplateText } from './render.ts'

/** Same ceiling as run-report's MAX_SCAN, so a report audience is never cut by the reader either (decision 2). */
export const MAX_AUDIENCE = 10_000
export const TOO_BIG = 'This audience has more than 10,000 people, which is more than one campaign can send. Split it into smaller roles or reports.'
export const NOBODY = 'Nobody in this audience can receive this campaign. Check who it is for, then schedule it again.'

export type FollowupWho = 'not_opened' | 'not_completed'
export type Audience =
  | { kind: 'role'; roleId: string }
  | { kind: 'report'; reportId: string; to: 'starter' | { field: string } }
  | { kind: 'followup'; campaignId: string; who: FollowupWho }
export type Person = { userId: string; email: string; name: string }
export type Found = { people: Person[]; emails: string[]; noEmail: number }
export type Recipient = { userId: string | null; email: string; name: string }
export type Excluded = { unsubscribed: number; duplicate: number; noEmail: number; noAccount: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const keys = (v: Record<string, unknown>) => Object.keys(v).length

export function readAudience(v: unknown): Audience | null {
  if (!isObj(v)) return null
  if (v.kind === 'role' && isUuid(v.roleId) && keys(v) === 2) return { kind: 'role', roleId: v.roleId }
  if (v.kind === 'report' && isUuid(v.reportId) && keys(v) === 3) {
    if (v.to === 'starter') return { kind: 'report', reportId: v.reportId, to: 'starter' }
    const to = v.to
    if (isObj(to) && keys(to) === 1 && typeof to.field === 'string' && KEY_RE.test(to.field)) return { kind: 'report', reportId: v.reportId, to: { field: to.field } }
    return null
  }
  if (v.kind === 'followup' && isUuid(v.campaignId) && (v.who === 'not_opened' || v.who === 'not_completed') && keys(v) === 3) {
    return { kind: 'followup', campaignId: v.campaignId, who: v.who }
  }
  return null
}

/**
 * De-duplicates by address, drops opted-out and unusable addresses, and counts every one it drops, so the report can
 * say who was left out. Refuses rather than cuts when more than MAX_AUDIENCE remain.
 */
export function planRecipients(found: Found, optedOut: ReadonlySet<string>, channel: 'email' | 'in_app'):
  { ok: true; list: Recipient[]; excluded: Excluded } | { ok: false; error: string } {
  const excluded: Excluded = { unsubscribed: 0, duplicate: 0, noEmail: found.noEmail, noAccount: 0 }
  const seen = new Set<string>()
  const list: Recipient[] = []
  const first = (email: string) => {
    if (seen.has(email)) { excluded.duplicate += 1; return false }
    seen.add(email)
    return true
  }
  for (const p of found.people) {
    const email = p.email.trim().toLowerCase()
    if (!first(email)) continue
    if (channel === 'email' && optedOut.has(email)) excluded.unsubscribed += 1
    else list.push({ userId: p.userId, email, name: p.name })
  }
  for (const raw of found.emails) {
    const email = raw.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { excluded.noEmail += 1; continue }
    if (!first(email)) continue
    if (channel === 'in_app') excluded.noAccount += 1 // an in-app notice needs an account
    else if (optedOut.has(email)) excluded.unsubscribed += 1
    else list.push({ userId: null, email, name: email })
  }
  if (list.length > MAX_AUDIENCE) return { ok: false, error: TOO_BIG }
  if (!list.length) return { ok: false, error: NOBODY }
  return { ok: true, list, excluded }
}

/** One decimal place; null when there is nothing to divide by, so the screen says so instead of 0% or NaN%. */
export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
const num = (n: number) => n.toLocaleString('en-GB')
export const pctText = (p: number | null) => (p === null ? 'No data yet' : `${p.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`)

export type Stats = { recipients: number; queued: number; sent: number; failed: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number }
export const NO_STATS: Stats = { recipients: 0, queued: 0, sent: 0, failed: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
export type Tile = { label: string; value: string; caption: string }

/** Delivered is a share of recipients; opened and clicked are shares of delivered (decision 7). */
export function campaignTiles(s: Stats, channel: 'email' | 'in_app'): Tile[] {
  if (channel === 'in_app') {
    return [
      { label: 'Recipients', value: num(s.recipients), caption: 'People sent an in-app notice' },
      { label: 'Read', value: pctText(pct(s.opened, s.recipients)), caption: `${num(s.opened)} of ${num(s.recipients)} read it` },
    ]
  }
  return [
    { label: 'Recipients', value: num(s.recipients), caption: s.queued ? `${num(s.recipients - s.queued)} of ${num(s.recipients)} sent so far` : 'Emails in this campaign' },
    { label: 'Delivered', value: pctText(pct(s.delivered, s.recipients)), caption: `${num(s.delivered)} of ${num(s.recipients)}` },
    { label: 'Opened', value: pctText(pct(s.opened, s.delivered)), caption: `${num(s.opened)} of ${num(s.delivered)} delivered, approximate` },
    { label: 'Clicked', value: pctText(pct(s.clicked, s.delivered)), caption: `${num(s.clicked)} of ${num(s.delivered)} delivered` },
    { label: 'Bounced and failed', value: `${num(s.bounced)} · ${num(s.failed)}`, caption: `${num(s.bounced)} bounced, ${num(s.failed)} failed` },
  ]
}

export function excludedText(x: Partial<Excluded>): string | null {
  const parts: [number, string, string][] = [
    [x.unsubscribed ?? 0, 'unsubscribed', 'unsubscribed'],
    [x.noEmail ?? 0, 'had no email address', 'had no email address'],
    [x.noAccount ?? 0, 'has no account for in-app notices', 'have no account for in-app notices'],
    [x.duplicate ?? 0, 'was listed twice', 'were listed twice'],
  ]
  const shown = parts.filter(([n]) => n > 0)
  const total = shown.reduce((a, [n]) => a + n, 0)
  if (!total) return null
  return `${num(total)} ${total === 1 ? 'person was' : 'people were'} left out: ${shown.map(([n, one, many]) => `${num(n)} ${n === 1 ? one : many}`).join(', ')}.`
}

export const CAMPAIGN_VARIABLES = ['org.name', 'recipient.name'] as const
/** A campaign has no record, task or step, so every other variable renders empty (decision 11). */
export function campaignTemplateIssue(t: TemplateText): string | null {
  const empty = [...new Set(variablesIn(`${t.subject}\n${t.body}`))].filter((k) => !(CAMPAIGN_VARIABLES as readonly string[]).includes(k))
  if (!empty.length) return null
  return `This template uses ${empty.map((k) => `{{${k}}}`).join(', ')}, which ${empty.length === 1 ? 'is' : 'are'} empty in a campaign. Only {{org.name}} and {{recipient.name}} are filled in.`
}
export const campaignContext = (orgName: string, recipientName: string): RenderContext => ({
  record: { title: '', data: {} }, step: { assignee: { name: '' } }, link: { task: '', record: '', invite: '' },
  org: { name: orgName }, recipient: { name: recipientName },
})

/** Appended by the server to every campaign email; a template cannot remove it. */
export function withFooter(r: { html: string; text: string }, orgName: string, unsubscribeUrl: string) {
  const o = escapeHtml(orgName)
  return {
    html: `${r.html}\n<hr>\n<p>You receive this because ${o} sent it to you through ReportNoReport. <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from ${o} campaign emails</a>.</p>`,
    text: `${r.text}\n\n--\nYou receive this because ${orgName} sent it to you through ReportNoReport.\nUnsubscribe from ${orgName} campaign emails: ${unsubscribeUrl}`,
  }
}

const enc = new TextEncoder()
export async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}
/** Constant time for equal lengths, so a token cannot be guessed a character at a time. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = async (secret: string, messageId: string) => b64url(await hmacSha256(enc.encode(secret), `unsubscribe:${messageId}`))

/** The token is `<message id>.<signature>`: it names the message but never the address, so no email address appears in a link (decision 5). */
export const unsubscribeLink = async (base: string, secret: string, messageId: string) => `${base}?t=${messageId}.${await token(secret, messageId)}`
/** The message id the token was signed for, or null when it is malformed or forged. */
export async function checkUnsubscribe(secret: string, t: unknown): Promise<string | null> {
  if (typeof t !== 'string') return null
  const [id, sig, ...rest] = t.split('.')
  if (rest.length || !isUuid(id) || !sig) return null
  return sameText(await token(secret, id), sig) ? id : null
}
/** Read when a function boots; throws so a bad setting stops it before it serves. */
export function readUnsubscribeConfig(url: string | undefined, secret: string | undefined): { url: string; secret: string } {
  let u: URL | null = null
  try { u = new URL(url ?? '') } catch { u = null }
  if (!u || !/^https?:$/.test(u.protocol) || u.search || u.hash || u.href !== url) {
    throw new Error('UNSUBSCRIBE_URL must be the absolute URL of the unsubscribe function, such as https://<ref>.supabase.co/functions/v1/unsubscribe.')
  }
  if (!secret || secret.length < 32) throw new Error('UNSUBSCRIBE_SECRET must be at least 32 characters.')
  return { url: u.href, secret }
}

export type RecipientRow = {
  id: string; recipient_email: string; status: string; error: string | null
  delivered_at: string | null; opened_at: string | null; clicked_at: string | null; bounced_at: string | null
}
export const RECIPIENT_STATUS: Record<string, string> = { queued: 'Waiting to send', sent: 'Sent', failed: 'Failed' }
/** Times stay ISO 8601 (UTC) in the file; Phase 5's toCsv guards every text cell against formulas. */
export function recipientCsv(rows: RecipientRow[], channel: 'email' | 'in_app'): string {
  if (channel === 'in_app') return toCsv(['Email', 'Read'], rows.map((r): Cell[] => [r.recipient_email, r.opened_at]))
  return toCsv(['Email', 'Status', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Error'], rows.map((r): Cell[] => [
    r.recipient_email, RECIPIENT_STATUS[r.status] ?? r.status, r.delivered_at, r.opened_at, r.clicked_at, r.bounced_at, r.error,
  ]))
}
