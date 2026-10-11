import { CheckIcon, ClockIcon, PencilIcon, RightIcon, XIcon } from '../ui/icons'
import { CAMPAIGN_STATUS, type CampaignStatus } from './api'

const ICONS = { draft: PencilIcon, scheduled: ClockIcon, sending: RightIcon, sent: CheckIcon, failed: XIcon }

/** Status is always a grey icon plus a word, never colour alone and never a chip. */
export function CampaignStatusMark({ status }: { status: CampaignStatus }) {
  const Icon = ICONS[status]
  return <span className="rnr-status"><Icon size={14} />{CAMPAIGN_STATUS[status]}</span>
}
