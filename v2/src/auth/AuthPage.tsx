import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { friendlyError } from '../ui/errors'

import { useAction } from '../ui/useAction'
import { AuthFrame } from './AuthFrame'
import { ForgotPassword } from './ForgotPassword'
import { Note } from '../ui/Note.tsx'
import { PageHead } from '../ui/PageHead'

export function AuthPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const { busy, run } = useAction()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const signIn = mode !== 'sign-up'
  useEffect(() => emailRef.current?.focus(), [mode])

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!e.currentTarget.reportValidity()) return
    return run(async () => {
      setError(null)
      const { data, error } = signIn
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/app/` } })
      if (error) { setError(friendlyError(error)); passwordRef.current?.focus(); return }
      if (!signIn && !data.session) setConfirmSent(true)
    })
  }

  if (mode === 'forgot') return <ForgotPassword initialEmail={email} onBack={() => setMode('sign-in')} />
  return (
    <AuthFrame>
        <form className="rnr-paper rnr-paper--panel w-full flex flex-col gap-4 p-6 pt-8" aria-busy={busy} onSubmit={submit} noValidate={false}>
          {confirmSent ? (
            <>
              <PageHead title="Check your email" align="center" className="mb-0" titleClassName="text-[40px]" />
              <p role="status" className="rnr-lede text-center mx-auto">A link was sent to {email}. Open it to finish creating your account.</p>
            </>
          ) : (
            <>
              <PageHead title={signIn ? 'Sign in' : 'Create account'} align="center" className="mb-0" titleClassName="text-[40px]"
                lede={signIn ? 'Welcome back. Sign in to your organisation.' : 'Create an account to set up or join an organisation.'} />
              <label className="rnr-field"><span className="rnr-label">Email</span>
                <input ref={emailRef} className="rnr-input" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <span className="rnr-error-text">Enter a valid email address.</span></label>
              <label className="rnr-field"><span className="rnr-label">Password</span>
                {!signIn && <span className="rnr-hint">At least 8 characters</span>}
                <input ref={passwordRef} className="rnr-input" type="password" name="password" required minLength={8}
                  autoComplete={signIn ? 'current-password' : 'new-password'} value={password}
                  aria-invalid={error ? true : undefined} aria-describedby={error ? 'auth-err' : undefined}
                  onChange={(e) => setPassword(e.target.value)} />
                <span className="rnr-error-text">Enter at least 8 characters.</span></label>
              {signIn && <button className="rnr-btn rnr-btn-ghost self-start" type="button" onClick={() => setMode('forgot')}>Forgot password?</button>}
              {error && <div id="auth-err"><Note>{error}</Note></div>}
              <button className="rnr-btn rnr-btn-primary" type="submit" aria-busy={busy}>
                {busy && <span className="rnr-spin" aria-hidden="true" />}
                {signIn ? (busy ? 'Signing in…' : 'Sign in') : (busy ? 'Creating account…' : 'Create account')}
              </button>
              <button className="rnr-btn rnr-btn-ghost" type="button"
                onClick={() => { setMode(signIn ? 'sign-up' : 'sign-in'); setError(null); setPassword('') }}>
                {signIn ? 'Create an account' : 'Sign in instead'}
              </button>
            </>
          )}
        </form>
    </AuthFrame>
  )
}
