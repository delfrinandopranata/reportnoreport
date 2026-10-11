import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../rbac/useOrg'
import { CheckIcon, StopIcon } from '../ui/icons'
import { FolderCard } from '../ui/FolderCard'
import { Skeleton } from '../ui/Skeleton'
import { useForm, type SubmitResult } from '../forms/api'
import { FormRunner } from '../forms/fill/FormRunner'
import { uploadFile } from '../forms/upload'
import { validateSchema } from '../forms/logic'
import { stoppedBody } from '../records/status'
import { advance, useStartable, type LoadedWorkflow } from '../workflows/api'
import { WorkflowGate } from '../workflows/WorkflowGate'
import type { StartNode } from '../workflows/logic'
import { PageHead } from '../ui/PageHead'

const SETUP = 'This workflow has a setup problem. Ask a workflow manager to fix it.'
type Started = Extract<SubmitResult, { ok: true }>

function Card({ children }: { children: ReactNode }) {
  return <div className="rnr-card gap-3">{children}</div>
}

function Success({ wf, done }: { wf: LoadedWorkflow; done: Started }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, []) // the pressed button was unmounted
  const stopped = done.status === 'error'
  const closed = done.status === 'done' || done.status === 'rejected'
  return (
    <Card>
      {stopped ? <span aria-hidden="true"><StopIcon size={24} /></span> : <span className="rnr-pop" aria-hidden="true"><CheckIcon size={24} /></span>}
      <h2 ref={heading} tabIndex={-1} className="rnr-dialog-title">{stopped ? 'Saved, but the record stopped' : closed ? 'Record started and closed' : 'Record started'}</h2>
      <p className="rnr-muted">
        {stopped ? stoppedBody(done.recordError)
          : closed ? `Your answers were saved and the record is already ${done.status}.`
            : `Your answers were saved and ${wf.name} has moved to its next step.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="rnr-btn rnr-btn-primary" href={`#/records/${done.id}`}>View record</a>
        <a className="rnr-btn rnr-btn-ghost" href="#/inbox">Back to inbox</a>
      </div>
    </Card>
  )
}

function StartForm({ wf, formId }: { wf: LoadedWorkflow; formId: string }) {
  const { orgId, userId } = useOrg()
  const qc = useQueryClient()
  const form = useForm(formId)
  const [done, setDone] = useState<Started | null>(null)

  if (form.isPending) return <Skeleton rows={[{ w: '100%', h: 320 }]} />
  if (form.isError) {
    return (
      <Card>
        <p role="alert">The form did not load. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => form.refetch()}>Try again</button></div>
      </Card>
    )
  }
  if (!form.data || validateSchema(form.data.schema).length) return <Card><p className="rnr-error" role="alert">{SETUP}</p></Card>
  if (done) return <Success wf={wf} done={done} />
  return (
    <FolderCard tab="New record">
      <FormRunner fields={form.data.schema} idPrefix="start" filePrefix={`${wf.org_id}/${userId}/`}
        upload={(blob, name) => uploadFile(wf.org_id, userId, blob, name)}
        submitLabel={{ idle: 'Start record', busy: 'Starting…' }}
        onSubmit={(answers) => advance({ action: 'start', workflowId: wf.id, answers })}
        onDone={(res) => {
          setDone(res)
          qc.invalidateQueries({ queryKey: ['my-tasks', orgId] })
          qc.invalidateQueries({ queryKey: ['records', orgId] })
        }} />
    </FolderCard>
  )
}

function Start({ wf }: { wf: LoadedWorkflow }) {
  const { orgId, can } = useOrg()
  const startable = useStartable(orgId)
  const start = wf.graph.nodes.find((n): n is StartNode => n.type === 'start')
  let body: ReactNode
  if (wf.status !== 'published') {
    body = (
      <Card>
        <p className="rnr-error" role="alert">This workflow is not published yet.</p>
        {can('workflows.manage')
          ? <div><a className="rnr-btn rnr-btn-secondary" href={`#/workflows/${wf.id}/edit`}>Open in editor</a></div>
          : <p className="rnr-muted">Ask a workflow manager to publish it.</p>}
      </Card>
    )
  } else if (!start) body = <Card><p className="rnr-error" role="alert">{SETUP}</p></Card>
  else if (startable.isPending) body = <Skeleton rows={[{ w: '100%', h: 320 }]} />
  else if (startable.isError) {
    body = (
      <Card>
        <p role="alert">Your access could not be checked. Check your connection and try again.</p>
        <div><button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => startable.refetch()}>Try again</button></div>
      </Card>
    )
  } else if (!startable.data.some((w) => w.id === wf.id)) {
    body = (
      <Card>
        <h2 className="rnr-dialog-title">You cannot start this workflow</h2>
        <p className="rnr-muted">Ask a workflow manager to give your role access.</p>
      </Card>
    )
  } else body = <StartForm wf={wf} formId={start.formId} />
  return (
    <section className="rnr-form mx-0 flex flex-col gap-6" aria-labelledby="start-h">
      <PageHead id="start-h" crumb="Work · Start" title={wf.name} accent={false} lede="Fill in this form to start a record." className="mb-0" />
      {body}
    </section>
  )
}

export function StartPage({ id }: { id: string }) {
  return <WorkflowGate id={id} back={{ href: '#/inbox', label: 'Back to inbox' }}>{(wf) => <Start wf={wf} />}</WorkflowGate>
}
