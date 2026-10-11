import { CheckIcon, ClockIcon, StopIcon, XIcon } from '../ui/icons'
import type { RecordStatus } from '../workflows/api'
import { STATUS_WORDS } from './status'

const ICONS = { open: ClockIcon, done: CheckIcon, rejected: XIcon, error: StopIcon }

/** Status is always a grey icon plus a word, never colour alone (design.md status rule). */
export function RecordStatusMark({ status, label }: { status: RecordStatus; label?: string | null }) {
  const Icon = ICONS[status]
  return <span className="rnr-status"><Icon size={16} />{STATUS_WORDS[status]}{label ? ` · ${label}` : ''}</span>
}
