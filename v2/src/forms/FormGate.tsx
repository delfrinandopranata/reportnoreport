import type { ReactNode } from 'react'
import { useOrg } from '../rbac/useOrg'
import { BackIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { useForm, type LoadedForm } from './api'

const Back = () => <a className="rnr-btn rnr-btn-ghost self-start" href="#/forms"><BackIcon />Back to forms</a>

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rnr-card gap-3 max-w-xl">
      <h1 className="page-title">{title}</h1>
      <p className="rnr-muted">{body}</p>
      {action && <div>{action}</div>}
    </div>
  )
}

/** Loading, error and not-found states shared by the builder, fill and submissions pages; adds the way back. */
export function FormGate({ id, children }: { id: string; children(form: LoadedForm): ReactNode }) {
  const { orgId } = useOrg()
  const form = useForm(id)
  const shell = (inner: ReactNode) => <div className="flex flex-col gap-4"><Back />{inner}</div>
  if (form.isPending) return shell(<Skeleton rows={[{ w: '240px', h: 32 }, { w: '100%', h: 320 }]} />)
  if (form.isError) {
    return shell(<Notice title="This form did not load" body="Check your connection and try again."
      action={<button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => form.refetch()}>Try again</button>} />)
  }
  if (!form.data || form.data.org_id !== orgId) {
    return shell(<Notice title="This form does not exist" body="It may have been deleted, or it belongs to another organisation." />)
  }
  return shell(children(form.data))
}
