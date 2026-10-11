import type { RecordStatus } from '../workflows/api.ts'

export const STATUS_WORDS: Record<RecordStatus, string> = { open: 'In progress', done: 'Done', rejected: 'Rejected', error: 'Stopped' }

/** The reason is already a full sentence from the server; add a full stop only when it lacks one. */
export function stoppedBody(reason: string | null | undefined): string {
  const r = reason?.trim() || 'a step could not run'
  return `Your answers were saved, but the workflow stopped at a later step: ${/[.!?]$/.test(r) ? r : `${r}.`} Ask a workflow manager to fix it, then start a new record.`
}
