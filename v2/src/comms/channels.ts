import type { TemplateRow } from './api'

/** Every active-member recipient gets an in-app notice whatever the channel, so "Email" alone would be untrue. */
export const CHANNEL_WORDS: Record<TemplateRow['channel'], string> = { email: 'Email and in-app', in_app: 'In-app only' }

/** Invitees have no user row, so an invite is only ever emailed whatever its channel says. */
export const channelLabel = (kind: TemplateRow['kind'], channel: TemplateRow['channel']) => (kind === 'invite' ? 'Email' : CHANNEL_WORDS[channel])

export const DELETE_TEMPLATE_BODY = (name: string) =>
  `${name} will be deleted and cannot be recovered. Workflows that send it stop their records with an error until you choose another template.`
