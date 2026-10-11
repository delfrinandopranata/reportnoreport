import type { ReportTemplate, StepFields } from './logic'

/** A layout preview with example text, drawn from the unsaved template. Not a server render. */
export function TemplatePreview({ org, workflow, template, steps }: { org: string; workflow: string; template: ReportTemplate; steps: StepFields[] }) {
  const chosen = steps.map((s) => ({ s, fields: template.fields.filter((f) => f.nodeId === s.nodeId) })).filter((x) => x.fields.length)
  const signoff = steps.filter((s) => template.signoff.includes(s.nodeId))
  const empty = !chosen.length && !signoff.length
  return (
    <section className="rnr-card gap-3 lg:sticky lg:top-4 lg:self-start" aria-labelledby="prev-h">
      <h2 id="prev-h" className="dialog-title">Preview</h2>
      <p className="rnr-caption">The layout with example text. Real PDFs use the record's answers and print black on white.</p>
      <p className="sr-only">Preview: {template.fields.length} {template.fields.length === 1 ? 'answer' : 'answers'} in {chosen.length} {chosen.length === 1 ? 'step' : 'steps'} and {signoff.length} {signoff.length === 1 ? 'sign-off' : 'sign-offs'}.</p>
      <div className="rnr-paper" aria-hidden="true">
        <p className="rnr-caption">{org}</p>
        <p className="dialog-title">Example record title</p>
        {template.header && <p className="rnr-paper-header">{template.header}</p>}
        <p className="rnr-caption">Workflow: {workflow}</p>
        <p className="rnr-caption">Status: In progress</p>
        <p className="rnr-caption">Started 12 Oct 2026, 08:30 UTC by Example person</p>
        {empty && <p className="rnr-caption">Choose answers or a sign-off to see them here.</p>}
        {chosen.map(({ s, fields }) => (
          <div key={s.nodeId} className="grid gap-2">
            <h3 className="label">{s.step}</h3>
            <hr className="rnr-paper-rule" />
            {fields.map((ref) => {
              const f = s.fields.find((x) => x.key === ref.key)
              return (
                <div key={ref.key}>
                  <p className="rnr-paper-label">{f?.label ?? ref.key}</p>
                  {f?.type === 'signature' ? <div className="rnr-paper-sig" />
                    : f?.type === 'group' ? <><p>1. Example answer</p><p>2. Example answer</p></>
                    : <p>{f ? 'Example answer' : 'This question is no longer on the form.'}</p>}
                </div>
              )
            })}
          </div>
        ))}
        {signoff.length > 0 && (
          <div className="grid gap-2">
            <h3 className="label">Sign-off</h3>
            <hr className="rnr-paper-rule" />
            {signoff.map((s) => (
              <div key={s.nodeId}>
                <p className="rnr-paper-label">{s.step}</p>
                <p>Approved by Example person · 12 Oct 2026, 14:05 UTC</p>
              </div>
            ))}
          </div>
        )}
        <p className="rnr-caption">Generated 13 Oct 2026, 09:00 UTC · Page 1 of 1</p>
      </div>
    </section>
  )
}
