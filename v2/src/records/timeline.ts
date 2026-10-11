import { nodeById, nodeName, type Graph } from '../workflows/logic.ts'

type Ev = { kind: string; node_id: string | null; detail: Record<string, unknown> }

const when = (iso: unknown) => (typeof iso === 'string'
  ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : 'later')

/** One plain sentence per timeline event; `who` is "You", an email or "Former member", null for the workflow itself. */
export function eventText(e: Ev, graph: Graph, who: string | null): string {
  const step = nodeName(e.node_id ? nodeById(graph, e.node_id) : undefined)
  const actor = who ?? 'Someone'
  const d = e.detail ?? {}
  switch (e.kind) {
    case 'started': return `${actor} started the record`
    case 'submitted': return `${actor} ${d.outcome === 'approved' ? 'approved' : d.outcome === 'rejected' ? 'rejected' : 'submitted'} ${step}`
    case 'claimed': return `${actor} claimed ${step}`
    case 'task': return `Waiting for ${step}`
    case 'condition': return `Checked “${step}”: ${d.outcome === 'yes' ? 'Yes' : 'No'}`
    case 'waiting': return `Waiting until ${when(d.runAt)}`
    case 'resumed': return `Finished waiting at ${step}`
    case 'skipped': return `A timer on ${step} was skipped because the record had moved on`
    case 'action':
      if (d.type === 'set_status') return `Status set to “${String(d.label)}”`
      if (d.type === 'send_message') return d.status === 'pending' ? 'Message not sent: recorded before messages were available.' : sentText(d)
      if (d.type === 'generate_pdf') return d.status === 'done' ? 'PDF made' : d.status === 'queued' ? 'PDF requested' : 'PDF not made: recorded before reports were available.'
      return 'The workflow recorded a step'
    case 'error': return d.type === 'generate_pdf' ? `PDF not made: ${String(d.message)}` : `Stopped: ${String(d.message)}` // on a closed record "Stopped" would be false
    case 'closed': return d.status === 'rejected' ? 'Closed as rejected' : 'Closed as done'
    default: return 'The workflow recorded a step'
  }
}

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)
function sentText(d: Record<string, unknown>): string {
  const people = count(d.people)
  const skipped = count(d.skipped)
  const main = `Sent “${String(d.template ?? 'a message')}” to ${people} ${people === 1 ? 'person' : 'people'}`
  return skipped ? `${main}. ${skipped} ${skipped === 1 ? 'recipient was' : 'recipients were'} skipped: no longer a member, or no valid email.` : main
}

/** Second line under a sent message: emails are only queued here, so say that and not "delivered". */
export function eventNote(e: Ev): string | null {
  if (e.kind !== 'action' || e.detail?.type !== 'send_message' || e.detail?.status === 'pending') return null
  const emails = count(e.detail?.emails)
  return emails ? `${emails} ${emails === 1 ? 'email' : 'emails'} queued for delivery.` : null
}

export type EventIcon = 'clock' | 'stop' | 'check' | 'x' | null
/** A grey icon beside the events that are waiting, stopped, closed or not carried out yet; none for the rest. */
export function eventIcon(e: Ev): EventIcon {
  switch (e.kind) {
    case 'waiting': case 'task': return 'clock'
    case 'action':
      if (e.detail?.type === 'generate_pdf') return e.detail.status === 'done' ? 'check' : e.detail.status === 'queued' ? 'clock' : 'x' // a pending one will never be made
      return e.detail?.type === 'send_message' && e.detail?.status === 'pending' ? 'x' : null // a pending message will never send
    case 'error': return e.detail?.type === 'generate_pdf' ? 'x' : 'stop'
    case 'closed': return e.detail?.status === 'rejected' ? 'x' : 'check'
    default: return null
  }
}
