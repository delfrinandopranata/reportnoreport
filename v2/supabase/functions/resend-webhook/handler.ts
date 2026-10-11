import { readTrackingEvent, verifyWebhook, type TrackingEvent } from '../_shared/comms/webhook.ts'
import type { Result } from '../advance/engine.ts'

export type Deps = { secret: Uint8Array<ArrayBuffer>; now(): Date; apply(e: TrackingEvent): Promise<boolean> }
export const MAX_BODY = 64_000 // a Resend event is a few hundred bytes

/** Verifies before reading anything: an unsigned or badly signed request is refused and never stored (spec §10). */
export async function handleWebhook(headers: Headers, body: string, deps: Deps): Promise<Result> {
  if (body.length > MAX_BODY) return { status: 413, body: { error: 'Too large.' } }
  const signedBy = { id: headers.get('svix-id'), timestamp: headers.get('svix-timestamp'), signature: headers.get('svix-signature') }
  if (!(await verifyWebhook(deps.secret, signedBy, body, deps.now()))) return { status: 401, body: { error: 'Not allowed.' } }
  let parsed: unknown = null
  try { parsed = JSON.parse(body) } catch { parsed = null } // a signed body that is not JSON is answered 400 below
  const event = readTrackingEvent(parsed, deps.now())
  if (event === null) return { status: 400, body: { error: 'Not a Resend event.' } }
  if (event === 'ignored') return { status: 200, body: { ignored: true } }
  return { status: 200, body: { matched: await deps.apply(event) } }
}
