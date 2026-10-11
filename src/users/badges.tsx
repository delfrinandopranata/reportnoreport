import { Icon } from '../ui'
import { ROLE_LABEL, type Role, type Status } from './rules'

const STATUS_VIEW: Record<Status, { icon: 'check' | 'clock' | 'x'; tone: 'ok' | 'warn' | 'down' }> = {
  active: { icon: 'check', tone: 'ok' },
  invited: { icon: 'clock', tone: 'warn' },
  suspended: { icon: 'x', tone: 'down' },
}
export const STATUS_LABEL: Record<Status, string> = { active: 'Active', invited: 'Invited', suspended: 'Suspended' }

/** A role is a mark, not a status: a neutral chip (the Owner chip takes the accent tint). */
export const RoleBadge = ({ role }: { role: Role }) => <span className="rnr-chip" data-tone={role === 'owner' ? 'accent' : undefined}>{ROLE_LABEL[role]}</span>
/** Status keeps its icon and its word; the tone is an addition. */
export const StatusBadge = ({ status }: { status: Status }) => (
  <span className="rnr-status" data-tone={STATUS_VIEW[status].tone}><Icon name={STATUS_VIEW[status].icon} />{STATUS_LABEL[status]}</span>
)
