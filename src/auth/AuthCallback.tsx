import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/**
 * Landing route for the magic link.
 *
 * The Supabase client is configured with detectSessionInUrl, so it exchanges
 * the ?code= for a session on load and AuthProvider picks it up through
 * onAuthStateChange. This route only has to wait for that, and say something
 * useful if it never arrives.
 *
 * On Android an installed PWA shares its storage partition with Chrome for the
 * same origin, so a link opened in the browser signs the installed app in too.
 * (This is the part that is genuinely awkward on iOS.)
 */
export function AuthCallback() {
  const { session, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10_000)
    return () => clearTimeout(t)
  }, [])

  if (session) return <Navigate to="/train" replace />

  const url = new URL(window.location.href)
  const errorDescription = url.searchParams.get('error_description')

  if (errorDescription || (timedOut && !loading)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-semibold">Could not sign you in</h1>
        <p className="text-sm text-text-dim">
          {errorDescription ??
            'The link may have expired or already been used. Magic links are single-use.'}
        </p>
        <a
          href="/"
          className="mt-2 flex min-h-14 items-center justify-center rounded-xl bg-accent
                     px-4 font-semibold text-accent-text"
        >
          Try again
        </a>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="text-text-dim">Signing you in…</p>
    </main>
  )
}
