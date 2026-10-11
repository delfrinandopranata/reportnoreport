import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../data/supabase'
import { useOrg } from '../rbac/useOrg'
import { FolderCard } from '../ui/FolderCard'
import { XIcon } from '../ui/icons'
import { useAction } from '../ui/useAction'
import { Wordmark } from '../ui/Wordmark'

export function CreateOrgPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()
  const { setOrgId, orgs } = useOrg()
  const { busy, run } = useAction()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) { setError(null); ref.current?.setCustomValidity('Enter a name'); e.currentTarget.reportValidity(); return }
    return run(async () => {
      setError(null)
      const { data, error } = await supabase.rpc('create_org', { p_name: name.trim() })
      if (error) { setError('Your organisation was not created. Try again.'); return }
      setOrgId(data)
      await qc.invalidateQueries({ queryKey: ['orgs'] })
      location.hash = '#/members'
    })
  }

  return (
    <main className="min-h-screen grid place-items-center p-4 sm:p-6">
      <div className="w-full max-w-[480px] flex flex-col items-center gap-6">
        <Wordmark />
        <FolderCard tab="New organisation" className="w-full">
          <form className="flex flex-col gap-4" aria-busy={busy} onSubmit={submit}>
            <header className="rnr-page-head mb-0" data-align="center">
              <div>
                <h1 className="rnr-page-title text-[40px]">Create your <em>organisation</em></h1>
                <p className="rnr-lede">You will be its first owner. You can invite others afterwards.</p>
              </div>
            </header>
            <label className="rnr-field"><span className="rnr-label">Organisation name</span>
              <span className="rnr-hint">For example, the name of your school or company</span>
              <input ref={ref} className="rnr-input" name="name" required maxLength={120} autoComplete="organization" value={name}
                onChange={(e) => { e.target.setCustomValidity(''); setName(e.target.value) }} />
              <span className="rnr-error-text">Enter a name for your organisation.</span></label>
            {error && <div className="rnr-note" data-tone="down" role="alert"><XIcon size={20} /><div>{error}</div></div>}
            <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={busy}>
              {busy && <span className="rnr-spin" aria-hidden="true" />}{busy ? 'Creating…' : 'Create organisation'}
            </button>
            {orgs.length > 0 && <button className="rnr-btn rnr-btn-secondary" type="button" onClick={() => { location.hash = '#/members' }}>Cancel</button>}
          </form>
        </FolderCard>
      </div>
    </main>
  )
}
