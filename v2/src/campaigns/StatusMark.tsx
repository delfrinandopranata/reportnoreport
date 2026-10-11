import { CheckIcon, ClockIcon, PencilIcon, RightIcon, XIcon } from '../ui/icons'
import { CAMPAIGN_STATUS, type CampaignStatus } from './api'

const ICONS = { draft: PencilIcon, scheduled: ClockIcon, sending: RightIcon, sent: CheckIcon, failed: XIcon }

const TONES = { draft: undefined, scheduled: 'info', sending: 'info', sent: 'ok', failed: 'down' } as const

/** Status is always an icon plus a word, never colour alone and never a chip. */
export function CampaignStatusMark({ status }: { status: CampaignStatus }) {
  const Icon = ICONS[status]
  return <span className="rnr-status" data-tone={TONES[status]}><Icon size={14} />{CAMPAIGN_STATUS[status]}</span>
}
