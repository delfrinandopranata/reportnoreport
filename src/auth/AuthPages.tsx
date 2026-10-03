import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'
import { btn, Field, input } from '../ui'
import { takeReturnTo } from './route'

type Mode = 'signin' | 'forgot' | 'set-password'
const modeFromHash = (): Mode => (location.hash.startsWith('#forgot') ? 'forgot' : location.hash.startsWith('#set-password') || location.hash.includes('type=invite') || location.hash.includes('type=recovery') ? 'set-password' : 'signin')

export function AuthPages({ forceSetPassword = false, onPasswordSet }: { forceSetPassword?: boolean; onPasswordSet?: () => void } = {}) {
  const [mode, setMode] = useState<Mode>(forceSetPassword ? 'set-password' : modeFromHash)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (forceSetPassword) return
    const onHash = () => setMode(modeFromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [forceSetPassword])

  const run = async (e: FormEvent<HTMLFormElement>, fn: (data: FormData) => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try { await fn(new FormData(e.currentTarget)) } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.') } finally { setBusy(false) }
  }

  const signIn = (data: FormData) => supabase.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) })
    .then(({ error }) => { if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message); location.hash = takeReturnTo() })
  const forgot = (data: FormData) => supabase.auth.resetPasswordForEmail(String(data.get('email')), { redirectTo: `${location.origin}/app?flow=set-password` })
    .then(({ error }) => { if (error) throw error; setNotice('If that email has an account, a reset link is on its way.') })
  const setPassword = async (data: FormData) => {
    const password = String(data.get('password'))
    if (password.length < 8) throw new Error('Use at least 8 characters.')
    if (password !== String(data.get('confirm'))) throw new Error('The passwords don’t match.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    const url = new URL(location.href)
    url.searchParams.delete('flow')
    history.replaceState(null, '', url)
    onPasswordSet?.()
    location.hash = takeReturnTo()
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold">{mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Reset your password' : 'Set your password'}</h1>
        <p className="mb-5 text-sm text-zinc-500">{mode === 'signin' ? 'Client accounts for your firm.' : mode === 'forgot' ? 'We’ll email you a reset link.' : 'Choose a password to finish setting up your account.'}</p>
        <form className="grid gap-4" noValidate onSubmit={(e) => run(e, mode === 'signin' ? signIn : mode === 'forgot' ? forgot : setPassword)}>
          {mode !== 'set-password' && <Field label="Email"><input name="email" type="email" autoComplete="email" required className={input} /></Field>}
          {mode !== 'forgot' && <Field label="Password"><input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required className={input} /></Field>}
          {mode === 'set-password' && <Field label="Confirm password"><input name="confirm" type="password" autoComplete="new-password" required className={input} /></Field>}
          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          {notice && <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{notice}</p>}
          <button className={btn.primary} disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Save password'}</button>
        </form>
        {!forceSetPassword && <p className="mt-4 text-sm">
          {mode === 'signin' ? <a href="#forgot" className="text-zinc-500 underline">Forgot password?</a> : <a href="#signin" className="text-zinc-500 underline">Back to sign in</a>}
        </p>}
      </div>
    </div>
  )
}
