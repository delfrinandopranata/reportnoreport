import { TOO_BIG } from './logic.ts'

export const SEND_NAME = 'Enter a name for the campaign.'
export const SEND_TEMPLATE = 'Choose a message template before sending.'
export const SEND_AUDIENCE = 'Choose who receives this campaign before sending.'
const PAST = 'Choose a time in the future.'
const FAR = 'Choose a time within the next year.'
const MINUTE = 60_000
const YEAR = 365 * 24 * 60 * MINUTE

export type SendField = 'name' | 'template' | 'audience' | 'at'
export type SendInput = { name: string; templateId: string; audienceReady: boolean; tooBig: boolean; later: boolean; at: string; now: Date }

/** The first thing wrong with pressing Send now or Schedule, in the order the page shows its controls (null when nothing is). */
export function sendProblem(i: SendInput): { field: SendField; message: string } | null {
  if (!i.name.trim()) return { field: 'name', message: SEND_NAME }
  if (!i.templateId) return { field: 'template', message: SEND_TEMPLATE }
  if (!i.audienceReady) return { field: 'audience', message: SEND_AUDIENCE }
  if (i.tooBig) return { field: 'audience', message: TOO_BIG }
  if (!i.later) return null
  const ms = new Date(i.at).getTime() - i.now.getTime()
  if (!(ms >= MINUTE)) return { field: 'at', message: PAST }
  if (ms > YEAR) return { field: 'at', message: FAR }
  return null
}

export const zoneHint = (zone: string, offset: string) =>
  `Your time zone: ${zone.replaceAll('_', ' ')} (${offset}). Sending can start up to a minute after this time.`
