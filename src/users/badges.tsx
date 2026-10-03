import { ROLE_LABEL, type Role, type Status } from './rules'

const ROLE_TONE: Record<Role, string> = {
  owner: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  admin: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  accountant: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  viewer: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300',
}
const STATUS_TONE: Record<Status, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  invited: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}
export const STATUS_LABEL: Record<Status, string> = { active: 'Active', invited: 'Invited', suspended: 'Suspended' }

const pill = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10'

export const RoleBadge = ({ role }: { role: Role }) => <span className={`${pill} ${ROLE_TONE[role]}`}>{ROLE_LABEL[role]}</span>
export const StatusBadge = ({ status }: { status: Status }) => <span className={`${pill} ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
