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
      return d.type === 'send_message' ? 'Message not sent yet. Available when Communication ships.' : 'PDF not made yet. Available when Reports ship.'
    case 'error': return `Stopped: ${String(d.message)}`
    case 'closed': return d.status === 'rejected' ? 'Closed as rejected' : 'Closed as done'
    default: return 'The workflow recorded a step'
  }
}

export type EventIcon = 'clock' | 'stop' | 'check' | 'x' | null
/** A grey icon beside the events that are waiting, stopped, closed or not carried out yet; none for the rest. */
export function eventIcon(e: Ev): EventIcon {
  switch (e.kind) {
    case 'waiting': case 'task': return 'clock'
    case 'action': return e.detail?.type === 'send_message' || e.detail?.type === 'generate_pdf' ? 'clock' : null
    case 'error': return 'stop'
    case 'closed': return e.detail?.status === 'rejected' ? 'x' : 'check'
    default: return null
  }
}
