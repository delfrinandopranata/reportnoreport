export type State =
  | { kind: 'checking' } | { kind: 'confirm'; org: string } | { kind: 'already'; org: string } | { kind: 'done'; org: string }
  | { kind: 'invalid' } | { kind: 'gone' } | { kind: 'error' }

export const tokenFrom = (search: string) => new URLSearchParams(search).get('t') || null

/** The `unsubscribe` Edge Function, from the same env the app reads for Supabase. */
export const unsubscribeUrl = (supabaseUrl: string | undefined, token: string) =>
  supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/unsubscribe?t=${encodeURIComponent(token)}` : null

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

/** What the function answered (GET checks the link, POST unsubscribes); anything unexpected reads as an error, never as success. */
export function readReply(method: 'GET' | 'POST', status: number, body: unknown): State {
  if (status === 400) return { kind: 'invalid' }
  if (status === 404) return { kind: 'gone' }
  if (status !== 200 || !isObject(body) || typeof body.org !== 'string') return { kind: 'error' }
  if (method === 'GET' && body.valid === true) return body.already === true ? { kind: 'already', org: body.org } : { kind: 'confirm', org: body.org }
  if (method === 'POST' && body.done === true) return { kind: 'done', org: body.org }
  return { kind: 'error' }
}

const STILL = 'Emails about your own tasks and records still arrive.'
/** Titles repeat the heading so the tab and the screen reader agree; only `org` varies and it is shown as text. */
export function copyFor(s: State): { title: string; body: string; action: string | null } {
  switch (s.kind) {
    case 'checking': return { title: 'Checking your link', body: 'One moment.', action: null }
    case 'confirm': return { title: `Unsubscribe from ${s.org} campaign emails`, body: `Stop receiving campaign emails from ${s.org}? ${STILL}`, action: 'Unsubscribe' }
    case 'already': return { title: 'You are already unsubscribed', body: `You are already unsubscribed from ${s.org} campaign emails.`, action: null }
    case 'done': return {
      title: 'You are unsubscribed',
      body: `You are unsubscribed from ${s.org} campaign emails. ${STILL} If you have a ReportNoReport account, you can turn campaign emails back on in Settings.`, action: null }
    case 'invalid': return { title: 'This link is not valid', body: 'The unsubscribe link is incomplete. Copy the whole link from the email and try again.', action: null }
    case 'gone': return { title: 'This link no longer works', body: 'Ask the person who sent the email to remove you from their list.', action: null }
    case 'error': return { title: 'Try again later', body: 'Your request did not go through. Try the link again in a minute.', action: null }
  }
}
