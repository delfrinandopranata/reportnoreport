import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PERMISSION_GROUPS } from '../rbac/permissions'
import { useOrg } from '../rbac/useOrg'
import { CheckIcon } from '../ui/icons'
import { useAction } from '../ui/useAction'

export type RoleDraft = { id: string | null; name: string; permissions: string[]; is_owner: boolean }

type Props = { role: RoleDraft; onSave(r: RoleDraft): Promise<string | null>; onClose(): void }

export function RoleEditor({ role, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(role)
  const [error, setError] = useState<string | null>(null)
  const { can } = useOrg()
  const { busy, saved, run } = useAction()
  const nameRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ block: 'nearest' })
    if (role.is_owner) sectionRef.current?.querySelector<HTMLElement>('h2')?.focus()
    else nameRef.current?.focus()
  }, [role.is_owner])

  const toggle = (k: string) => setDraft({
    ...draft,
    permissions: draft.permissions.includes(k) ? draft.permissions.filter((p) => p !== k) : [...draft.permissions, k],
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!e.currentTarget.reportValidity()) return
    return run(async () => {
      setError(null)
      const msg = await onSave({ ...draft, name: draft.name.trim() })
      if (msg) setError(msg)
    }, true)
  }

  const title = draft.is_owner ? 'Owner role' : draft.id ? `Edit ${role.name}` : 'New role'
  return (
    <section ref={sectionRef} className="rnr-card gap-4" aria-labelledby="re-h">
      <h2 id="re-h" tabIndex={-1} className="dialog-title">{title}</h2>
      <form className="flex flex-col gap-4" aria-busy={busy} onSubmit={submit}>
        <label className="rnr-field"><span className="rnr-label">Role name</span>
          <input ref={nameRef} className="rnr-input" required maxLength={60} style={{ maxWidth: 320 }}
            readOnly={draft.is_owner} value={draft.name} aria-invalid={error ? true : undefined}
            aria-describedby={error ? 're-err' : undefined} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <span className="rnr-error-text">Enter a name for this role.</span></label>
        <div className="grid gap-4 md:grid-cols-2">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.group} className="grid gap-2 content-start">
              <legend className="rnr-label">{g.group}</legend>
              {g.items.map((i) => {
                const lacking = !draft.is_owner && !can(i.key)
                return (
                  <div key={i.key} className="grid gap-1">
                    <label className="flex items-start gap-2 text-ink-label">
                      <input type="checkbox" className="accent-brand mt-1" checked={draft.is_owner || draft.permissions.includes(i.key)}
                        disabled={draft.is_owner || lacking} onChange={() => toggle(i.key)} />{i.label}
                    </label>
                    {lacking && <span className="rnr-hint">You do not hold this permission, so you cannot grant it.</span>}
                  </div>
                )
              })}
            </fieldset>
          ))}
        </div>
        {draft.is_owner && <p className="rnr-muted">The Owner role always has every permission and cannot be changed.</p>}
        {error && <p id="re-err" className="rnr-error" role="alert">{error}</p>}
        <div className="flex gap-2">
          {draft.is_owner
            ? <button className="rnr-btn rnr-btn-secondary" type="button" onClick={onClose}>Close</button>
            : <>
              <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={busy}>
                {busy && <span className="rnr-spin" aria-hidden="true" />}
                {saved && <CheckIcon />}{busy ? 'Saving…' : saved ? 'Saved' : 'Save role'}
              </button>
              <button className="rnr-btn rnr-btn-ghost" type="button" onClick={onClose}>Cancel</button>
            </>}
        </div>
      </form>
    </section>
  )
}
