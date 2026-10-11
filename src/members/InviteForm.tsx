import { useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { friendlyError } from '../ui/errors'
import { CheckIcon } from '../ui/icons'
import { useAction } from '../ui/useAction'
import { toggle } from './toggle'

export type Role = { id: string; name: string; is_owner: boolean }

export function InviteForm({ orgId, roles, onDone, onNotice }: {
  orgId: string; roles: Role[] | undefined; onDone(): void; onNotice(m: string): void
}) {
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const { busy, saved, run } = useAction()

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!e.currentTarget.reportValidity()) return
    return run(async () => {
      setError(null)
      const { data, error } = await supabase.functions.invoke('invite-member', { body: { orgId, email, roleIds: picked } })
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
        setError(friendlyError({ message: body?.error }))
        return
      }
      onNotice(data.status === 'existing' ? `${email} is already in this organisation.` : `Invite sent to ${email}.`)
      setEmail(''); setPicked([]); onDone()
    }, true)
  }

  return (
    <form className="rnr-card gap-3" aria-busy={busy} onSubmit={submit}>
      <h2 className="dialog-title">Invite someone</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="rnr-field"><span className="rnr-label">Email</span>
          <input className="rnr-input" type="email" name="email" required placeholder="name@school.edu" autoComplete="off"
            value={email} aria-invalid={error ? true : undefined} aria-describedby={error ? 'invite-err' : undefined}
            onChange={(e) => setEmail(e.target.value)} />
          <span className="rnr-error-text">Enter a valid email address.</span></label>
        <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={busy}>
          {busy && <span className="rnr-spin" aria-hidden="true" />}
          {saved && <CheckIcon />}{busy ? 'Sending…' : saved ? 'Sent' : 'Send invite'}
        </button>
      </div>
      <fieldset className="grid gap-2">
        <legend className="rnr-fieldset-label">Roles</legend>
        {roles ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {roles.filter((r) => !r.is_owner).map((r) => (
              <label key={r.id} className="rnr-check">
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => setPicked(toggle(picked, r.id))} />{r.name}
              </label>
            ))}
          </div>
        ) : <div className="rnr-skeleton" style={{ height: 20, width: 240 }} />}
        <span className="rnr-caption">Choose none to add them with no permissions.</span>
      </fieldset>
      {error && <p id="invite-err" className="rnr-error" role="alert">{error}</p>}
    </form>
  )
}
