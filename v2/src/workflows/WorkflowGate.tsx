import type { ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { BackIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useWorkflow, type LoadedWorkflow } from './api'

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rnr-card gap-3 max-w-xl">
      <h1 className="page-title">{title}</h1>
      <p className="rnr-muted">{body}</p>
      {action && <div>{action}</div>}
    </div>
  )
}

/** Loading, error and not-found states for the editor, the Access tab and the start page; adds the way back. */
export function WorkflowGate({ id, back = { href: '#/workflows', label: 'Back to workflows' }, children }:
  { id: string; back?: { href: string; label: string }; children(wf: LoadedWorkflow): ReactNode }) {
  const { orgId } = useOrg()
  const wf = useWorkflow(id)
  const shell = (inner: ReactNode) => (
    <div className="flex flex-col gap-4"><a className="rnr-btn rnr-btn-ghost self-start" href={back.href}><BackIcon />{back.label}</a>{inner}</div>
  )
  if (wf.isPending) return shell(<Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 480 }]} />)
  if (wf.isError) {
    return shell(<Notice title="We could not load this workflow" body="Check your connection and try again."
      action={<button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => wf.refetch()}>Try again</button>} />)
  }
  if (!wf.data || wf.data.org_id !== orgId) {
    return shell(<Notice title="This workflow does not exist" body="It may have been deleted, or it belongs to another organisation." />)
  }
  return shell(children(wf.data))
}
