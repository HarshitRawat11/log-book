import { useState, type FormEvent } from 'react'
import { authRedirectTo, supabase } from '../lib/supabase'

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string }

/**
 * Supabase's raw errors are written for developers, not for someone standing in
 * a gym. The signup one in particular ("Signups not allowed for otp") is what
 * you get from a simple typo, which is the likeliest way to hit this at all.
 */
function friendlyError(message: string): string {
  if (/signups? not allowed/i.test(message)) {
    return 'No account for that address. Check the spelling — this app is for one account only.'
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many requests. Wait a minute and try again.'
  }
  return message
}

export function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !email.trim()) return

    setStatus({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: authRedirectTo(),
        // Single account, and the account already exists. A stranger who finds
        // this URL must not be able to create one by typing an address into
        // this box. Belt and braces with the project's own signup setting: if
        // that ever gets flipped back on, this still refuses.
        shouldCreateUser: false,
      },
    })

    setStatus(error ? { kind: 'error', message: friendlyError(error.message) } : { kind: 'sent' })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">log-book</h1>
        <p className="mt-2 text-text-dim">Sign in with a magic link. No password.</p>
      </header>

      {status.kind === 'sent' ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-medium text-ok">Check your email</p>
          <p className="mt-2 text-sm text-text-dim">
            A sign-in link is on its way to <span className="text-text">{email}</span>. Open it on
            this device.
          </p>
          <button
            type="button"
            onClick={() => setStatus({ kind: 'idle' })}
            className="mt-4 min-h-11 text-sm text-accent underline underline-offset-4"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label htmlFor="email" className="text-sm text-text-dim">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-h-14 rounded-xl border border-border bg-surface px-4 text-lg
                       outline-none placeholder:text-text-dim focus:border-accent"
          />

          {status.kind === 'error' && (
            <p role="alert" className="text-sm text-danger">
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={status.kind === 'sending'}
            className="min-h-14 rounded-xl bg-accent px-4 text-lg font-semibold
                       text-accent-text disabled:opacity-60"
          >
            {status.kind === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}
    </main>
  )
}
