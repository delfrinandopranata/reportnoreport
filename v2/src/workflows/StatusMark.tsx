import { CheckIcon, PencilIcon } from '../ui/icons'
import type { WorkflowStatus } from './api'

export function WorkflowStatusMark({ status }: { status: WorkflowStatus }) {
  return <span className="rnr-status">{status === 'published' ? <CheckIcon size={14} /> : <PencilIcon size={14} />}{status === 'published' ? 'Published' : 'Draft'}</span>
}
