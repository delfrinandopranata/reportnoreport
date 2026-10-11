import { hmacSha256, sameText } from './campaign.ts'

/** Svix's own tolerance: an older (or future) timestamp is a replay or a broken clock. */
export const TOLERANCE_MS = 5 * 60_000
export type TrackingColumn = 'delivered_at' | 'opened_at' | 'clicked_at' | 'bounced_at' | 'complained_at'
/** An open proves delivery; a click proves the open too, even when the reader blocks images (decision 6). */
export const TRACKING: Record<string, TrackingColumn[]> = {
  'email.delivered': ['delivered_at'],
  'email.opened': ['delivered_at', 'opened_at'],
  'email.clicked': ['delivered_at', 'opened_at', 'clicked_at'],
  'email.bounced': ['bounced_at'],
  'email.complained': ['complained_at'],
}
export type TrackingEvent = { providerId: string; columns: TrackingColumn[]; at: Date; complaint: boolean }
export type SignedHeaders = { id: string | null; timestamp: string | null; signature: string | null }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))

/** `whsec_` + base64, as the Resend webhook page shows it. Read once at boot. */
export function readWebhookSecret(raw: string | undefined): Uint8Array<ArrayBuffer> {
  const m = /^whsec_([A-Za-z0-9+/]{16,}={0,2})$/.exec(raw ?? '')
  if (!m) throw new Error('RESEND_WEBHOOK_SECRET must be the whsec_ signing secret from the Resend webhook page.')
  return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))
}

/** Svix scheme: v1 = base64(HMAC-SHA256(secret, "<id>.<timestamp>.<raw body>")). Also signs the local fixture events. */
export const signWebhook = async (secret: Uint8Array<ArrayBuffer>, id: string, timestamp: string, body: string) =>
  `v1,${b64(await hmacSha256(secret, `${id}.${timestamp}.${body}`))}`

export async function verifyWebhook(secret: Uint8Array<ArrayBuffer>, h: SignedHeaders, body: string, now: Date): Promise<boolean> {
  if (!h.id || !h.timestamp || !h.signature || !/^\d{1,12}$/.test(h.timestamp)) return false
  if (Math.abs(now.getTime() - Number(h.timestamp) * 1000) > TOLERANCE_MS) return false
  const want = await signWebhook(secret, h.id, h.timestamp, body)
  return h.signature.split(' ').some((s) => sameText(s, want)) // several signatures appear while a secret is rotated
}

export type Ignored = { ignored: string }

/**
 * A tracking event, or `{ ignored: reason }` for anything else, malformed included. The caller has already verified the
 * signature, so a bad shape is an event that cannot be used, and a non-2xx answer would only make Resend retry it forever.
 */
export function readTrackingEvent(body: unknown, now: Date): TrackingEvent | Ignored {
  if (!isObj(body) || typeof body.type !== 'string') return { ignored: 'This is not a Resend event.' }
  if (!Object.hasOwn(TRACKING, body.type)) return { ignored: 'This event type is not tracked.' } // domain.*, contact.* and email.sent carry no usable id
  const id = isObj(body.data) ? body.data.email_id : undefined
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return { ignored: 'This event has no usable email id.' }
  const t = typeof body.created_at === 'string' ? Date.parse(body.created_at) : Number.NaN
  const at = Number.isFinite(t) && t <= now.getTime() + TOLERANCE_MS ? new Date(t) : now
  return { providerId: id, columns: TRACKING[body.type], at, complaint: body.type === 'email.complained' }
}
