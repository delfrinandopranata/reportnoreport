import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { friendlyError } from '../ui/errors'
import { Note } from '../ui/Note'
import { PageHead } from '../ui/PageHead'
import { useAction } from '../ui/useAction'
import { AuthFrame } from './AuthFrame'

/** Email form for a password-reset link. The answer is the same whether or not the address has an account. */
export function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack(): void }) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!e.currentTarget.reportValidity()) return
    return run(async () => {
      setError(null)
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/app/?flow=set-password` })
      if (error) { setError(friendlyError(error)); return }
      setSent(true)
    })
  }

  return (
    <AuthFrame>
      <form className="rnr-paper rnr-paper--panel w-full flex flex-col gap-4 p-6 pt-8" aria-busy={busy} onSubmit={submit}>
        {sent ? (
          <>
            <PageHead title="Check your email" align="center" className="mb-0" titleClassName="text-[40px]" />
            <p role="status" className="rnr-lede text-center mx-auto">If {email} has an account, a link to set a new password was sent to it. The link works once.</p>
          </>
        ) : (
          <>
            <PageHead title="Reset password" align="center" className="mb-0" titleClassName="text-[40px]"
              lede="Enter your email and a link to set a new password is sent to it." />
            <label className="rnr-field"><span className="rnr-label">Email</span>
              <input ref={ref} className="rnr-input" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <span className="rnr-error-text">Enter a valid email address.</span></label>
            {error && <Note>{error}</Note>}
            <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={busy}>
              {busy && <span className="rnr-spin" aria-hidden="true" />}{busy ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}
        <button className="rnr-btn rnr-btn-ghost" type="button" onClick={onBack}>Back to sign in</button>
      </form>
    </AuthFrame>
  )
}
