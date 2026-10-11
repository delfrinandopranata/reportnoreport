import { useEffect, useRef, useState } from 'react'
import { useOrg } from '../../rbac/useOrg'
import { FolderCard } from '../../ui/FolderCard'
import { CheckIcon } from '../../ui/icons'
import { validateSchema } from '../logic'
import { submitAnswers, type LoadedForm } from '../api'
import { FormGate } from '../FormGate'
import { uploadFile } from '../upload'
import { FormRunner } from './FormRunner'

function Fill({ form }: { form: LoadedForm }) {
  const { userId, can } = useOrg()
  const manage = can('forms.manage')
  const [done, setDone] = useState(false)
  const [round, setRound] = useState(0)
  const success = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (done) success.current?.focus() }, [done]) // the Submit button that was pressed is unmounted
  const broken = validateSchema(form.schema).length > 0
  const edit = manage && <a className="rnr-btn rnr-btn-secondary" href={`#/forms/${form.id}/edit`}>Edit form</a>
  return (
    <section className="rnr-form" aria-labelledby="fill-h">
      <FolderCard tab={<h1 id="fill-h" tabIndex={-1}>{form.name}</h1>}>
        <div className="grid gap-4">
          {broken && (
            <>
              <p className="rnr-note" data-tone="down" role="alert">{manage ? 'This form has a setup problem. Open the builder to fix it.' : 'This form has a setup problem. Ask a form manager to fix it.'}</p>
              {edit && <div>{edit}</div>}
            </>
          )}
          {!broken && !form.schema.length && (
            <>
              <h2 className="rnr-dialog-title">This form has no fields yet</h2>
              <p className="rnr-muted">{manage ? 'Add some in the builder.' : 'Ask a form manager to add some.'}</p>
              {edit && <div>{edit}</div>}
            </>
          )}
          {!broken && done && (
            <>
              <span className="rnr-pop rnr-kind" aria-hidden="true"><CheckIcon size={24} /></span>
              <h2 ref={success} tabIndex={-1} className="rnr-dialog-title">Form submitted</h2>
              <p className="rnr-muted">Your answers to {form.name} were saved.</p>
              <div className="rnr-page-actions">
                <button type="button" className="rnr-btn rnr-btn-primary" onClick={() => { setDone(false); setRound(round + 1) }}>Fill in again</button>
                <a className="rnr-btn rnr-btn-ghost" href={`#/forms/${form.id}/submissions`}>{manage ? 'View submissions' : 'View your submissions'}</a>
                <a className="rnr-btn rnr-btn-ghost" href="#/forms">Back to forms</a>
              </div>
            </>
          )}
          {!broken && !done && form.schema.length > 0 && (
            <FormRunner key={round} fields={form.schema} idPrefix="fill" filePrefix={`${form.org_id}/${userId}/`}
              upload={(blob, name) => uploadFile(form.org_id, userId, blob, name)}
              onSubmit={(answers) => submitAnswers(form.id, answers)}
              onDone={() => setDone(true)} />
          )}
        </div>
      </FolderCard>
    </section>
  )
}

export function FillPage({ id }: { id: string }) {
  return <FormGate id={id}>{(form) => <Fill form={form} />}</FormGate>
}
