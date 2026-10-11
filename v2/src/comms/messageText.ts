import type { MessageFilter, QueueRow } from './api'

export function attemptsText(m: Pick<QueueRow, 'status' | 'attempts'>): string | null {
  if (m.attempts < 1 || (m.status === 'sent' && m.attempts === 1)) return null
  return m.attempts === 1 ? 'Tried once' : `Tried ${m.attempts} times`
}

export function problemHint(m: Pick<QueueRow, 'status' | 'error'>): string | null {
  if (!m.error) return null
  return m.status === 'failed' ? 'Fix the cause, then press Retry.' : m.status === 'queued' ? 'Will try again automatically.' : null
}

export function resultText(filter: MessageFilter, n: number): string {
  const word = filter === 'all' ? '' : `${filter} `
  return n === 0 ? `No ${word}messages.` : `Showing ${n} ${word}${n === 1 ? 'message' : 'messages'}.`
}
