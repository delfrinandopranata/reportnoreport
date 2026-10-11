import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { friendlyError } from '../ui/errors'
import { Note } from '../ui/Note'
import { PageHead } from '../ui/PageHead'
import { useAction } from '../ui/useAction'
import { AuthFrame } from './AuthFrame'
import { validateNewPassword } from './password'

/** Opened from the reset email (?flow=set-password), which has already signed the person in. Saving the password carries on into the app. */
export function SetPassword({ hasSession, onDone }: { hasSession: boolean; onDone(): void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()
  const first = useRef<HTMLInputElement>(null)
  const second = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [hasSession])

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = validateNewPassword(password, confirm)
    if (problem) { setError(problem); (password.length < 8 ? first : second).current?.focus(); return }
    return run(async () => {
      setError(null)
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setError(friendlyError(error)); first.current?.focus(); return }
      onDone()
    })
  }

  if (!hasSession) {
    return (
      <AuthFrame>
        <div className="rnr-paper rnr-paper--panel w-full flex flex-col gap-4 p-6 pt-8">
          <PageHead title="This link has expired" align="center" className="mb-0" titleClassName="text-[40px]"
            lede="Reset links work once and stop working after an hour. Ask for a new one." />
          <button className="rnr-btn rnr-btn-primary" type="button" onClick={onDone}>Back to sign in</button>
        </div>
      </AuthFrame>
    )
  }
  return (
    <AuthFrame>
      <form className="rnr-paper rnr-paper--panel w-full flex flex-col gap-4 p-6 pt-8" aria-busy={busy} onSubmit={submit} noValidate>
        <PageHead title="Set a new password" align="center" className="mb-0" titleClassName="text-[40px]"
          lede="Choose a password to sign in with from now on." />
        <label className="rnr-field"><span className="rnr-label">New password</span>
          <span className="rnr-hint">At least 8 characters</span>
          <input ref={first} className="rnr-input" type="password" name="password" autoComplete="new-password" value={password}
            aria-invalid={error && password.length < 8 ? true : undefined} aria-describedby={error ? 'sp-err' : undefined} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="rnr-field"><span className="rnr-label">Confirm password</span>
          <input ref={second} className="rnr-input" type="password" name="confirm" autoComplete="new-password" value={confirm}
            aria-invalid={error && password.length >= 8 && password !== confirm ? true : undefined} aria-describedby={error ? 'sp-err' : undefined} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <div id="sp-err"><Note>{error}</Note></div>}
        <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={busy}>
          {busy && <span className="rnr-spin" aria-hidden="true" />}{busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthFrame>
  )
}
