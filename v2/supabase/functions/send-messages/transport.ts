export type Mail = { id: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean; error: string; rateLimited?: true }
export type Transport = { send(m: Mail): Promise<SendResult> }

const RESEND_KEY = /^re_[A-Za-z0-9_]{16,}$/
const FROM = /^(?:([^<>\r\n"]{1,80}) )?<?([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>?$/
const reason = (body: unknown, status: number) =>
  body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : `HTTP ${status}`

function splitFrom(from: string) {
  const m = FROM.exec(from)
  if (!m) throw new Error('EMAIL_FROM must be an address such as "ReportNoReport <noreply@reportnoreport.com>".')
  return { name: m[1] ?? '', email: m[2] }
}

export function resendTransport(key: string, from: string, f: typeof fetch = fetch): Transport {
  return {
    async send(m) {
      const res = await f('https://api.resend.com/emails', {
        method: 'POST',
        // The message id makes a resend after a crash a no-op on Resend's side.
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.id },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) return { ok: true, providerId: typeof body?.id === 'string' ? body.id : null }
      const error = `The email service refused this message: ${reason(body, res.status)}`
      if (res.status === 429) return { ok: false, retry: true, rateLimited: true, error }
      return { ok: false, retry: res.status >= 500, error }
    },
  }
}

export function mailpitTransport(base: string, from: string, f: typeof fetch = fetch): Transport {
  const sender = splitFrom(from)
  return {
    async send(m) {
      const res = await f(`${base.replace(/\/+$/, '')}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: { Email: sender.email, Name: sender.name }, To: [{ Email: m.to }], Subject: m.subject, HTML: m.html, Text: m.text, Headers: m.headers }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) return { ok: true, providerId: typeof body?.ID === 'string' ? body.ID : null }
      return { ok: false, retry: res.status >= 500, error: `Mailpit refused this message: ${reason(body, res.status)}` }
    },
  }
}

/** Read once when the function boots: a missing or malformed setting throws before any message is touched. */
export function transportFromEnv(env: (k: string) => string | undefined, f: typeof fetch = fetch): Transport {
  const from = env('EMAIL_FROM') ?? ''
  splitFrom(from)
  const kind = env('EMAIL_TRANSPORT')
  if (kind === 'resend') {
    const key = env('RESEND_API_KEY') ?? ''
    if (!RESEND_KEY.test(key)) throw new Error('RESEND_API_KEY is missing or malformed.')
    return resendTransport(key, from, f)
  }
  if (kind === 'mailpit') return mailpitTransport(env('MAILPIT_URL') ?? 'http://host.docker.internal:54324', from, f)
  throw new Error('EMAIL_TRANSPORT must be "resend" or "mailpit".')
}
