import { KEY_RE } from '../forms/schema.ts'

export const TEMPLATE_KINDS = ['custom', 'task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'invite'] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]
export const KIND_LABELS: Record<TemplateKind, string> = {
  custom: 'Workflow messages', task_assigned: 'Task assigned', task_overdue: 'Task overdue',
  record_approved: 'Record approved', record_rejected: 'Record rejected', invite: 'Invite to org',
}
/** Types a person may mute email for. Invites always send. */
export const MUTABLE_KINDS = ['task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'custom'] as const
export type MutableKind = (typeof MUTABLE_KINDS)[number]

export type Recipient = { role: string } | { user: string } | { starter: true } | { step: string } | { field: string }
export type SendMessage = { type: 'send_message'; templateId: string; recipients: Recipient[] }
export type RecipientRefs = { templates: ReadonlySet<string>; roles: ReadonlySet<string>; users: ReadonlySet<string>; steps: ReadonlySet<string> }

export const MAX_RECIPIENT_RULES = 20
/** One address, no display name, no list, nothing that could break out of a header. */
export const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/
const STEP_RE = /^[a-z0-9_-]{1,40}$/
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

export function readRecipient(r: unknown): Recipient | null {
  if (!isObj(r) || Object.keys(r).length !== 1) return null
  if (isId(r.role)) return { role: r.role }
  if (isId(r.user)) return { user: r.user }
  if (r.starter === true) return { starter: true }
  if (typeof r.step === 'string' && STEP_RE.test(r.step)) return { step: r.step }
  if (typeof r.field === 'string' && KEY_RE.test(r.field)) return { field: r.field }
  return null
}

export function readSendMessage(a: unknown): SendMessage | null {
  if (!isObj(a) || a.type !== 'send_message' || !isId(a.templateId) || !Array.isArray(a.recipients)) return null
  if (a.recipients.length < 1 || a.recipients.length > MAX_RECIPIENT_RULES) return null
  const recipients = a.recipients.map(readRecipient)
  return recipients.every((r) => r !== null) ? { type: 'send_message', templateId: a.templateId, recipients: recipients as Recipient[] } : null
}

/** Publish-check message for one Send message action, or null when it can run. */
export function sendMessageIssue(a: unknown, refs: RecipientRefs): string | null {
  if (!isObj(a) || !isId(a.templateId)) return 'Choose a message template for "Send message".'
  if (!refs.templates.has(a.templateId)) return 'The message template for "Send message" no longer exists. Choose another.'
  if (!Array.isArray(a.recipients) || a.recipients.length === 0) return 'Add at least one recipient to "Send message".'
  if (a.recipients.length > MAX_RECIPIENT_RULES) return `Keep "Send message" to ${MAX_RECIPIENT_RULES} recipients or fewer.`
  for (const raw of a.recipients) {
    const r = readRecipient(raw)
    if (!r) return 'A recipient of "Send message" is incomplete. Finish it or remove it.'
    if ('role' in r && !refs.roles.has(r.role)) return 'A role that "Send message" sends to no longer exists.'
    if ('user' in r && !refs.users.has(r.user)) return 'A person that "Send message" sends to is no longer a member.'
    if ('step' in r && !refs.steps.has(r.step)) return '"Send message" can only send to the person who completed a Start or Form step.'
  }
  return null
}
