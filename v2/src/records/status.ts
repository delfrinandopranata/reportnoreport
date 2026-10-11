import type { RecordStatus } from '../workflows/api'

export const STATUS_WORDS: Record<RecordStatus, string> = { open: 'In progress', done: 'Done', rejected: 'Rejected', error: 'Stopped' }
