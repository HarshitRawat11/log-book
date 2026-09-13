import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { AuthCallback } from './auth/AuthCallback'
import { SignIn } from './auth/SignIn'
import { TabBar } from './components/TabBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { Train } from './routes/Train'
import { Food } from './routes/Food'
import { Progress } from './routes/Progress'
import { Settings } from './routes/Settings'
import { Exercises } from './routes/Exercises'
import { isConfigured } from './lib/env'

function NotConfigured() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Not configured</h1>
      <p className="text-sm leading-relaxed text-text-dim">
        Copy <code className="text-text">.env.local.example</code> to{' '}
        <code className="text-text">.env.local</code> and fill in your Supabase project URL and
        anon key, then restart the dev server.
      </p>
    </main>
  )
}

/** Tabbed shell. Only reachable with a session. */
function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Outlet />
      <TabBar />
    </div>
  )
}

function RequireAuth() {
  const { session, loading } = useAuth()

  // Held deliberately blank rather than showing a spinner: getSession() reads
  // localStorage and settles in a frame or two, and a spinner that flashes on
  // every cold open reads as slowness.
  if (loading) return <div className="min-h-dvh bg-bg" />
  if (!session) return <Navigate to="/signin" replace />
  return <AppShell />
}

function Router() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/signin"
        element={loading ? <div className="min-h-dvh bg-bg" /> : session ? <Navigate to="/train" replace /> : <SignIn />}
      />
      <Route element={<RequireAuth />}>
        <Route path="/train" element={<Train />} />
        <Route path="/food" element={<Food />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      {/* Train is the landing route: cold open lands on the logging screen. */}
      <Route path="*" element={<Navigate to="/train" replace />} />
    </Routes>
  )
}

export function App() {
  // UpdatePrompt owns the useRegisterSW() call, so it has to mount in EVERY
  // state - including signed out and not-configured. Rendering it only inside
  // the authenticated shell meant the service worker never registered until
  // you signed in, which in turn meant the app was not installable until you
  // signed in. Dev hid this: devOptions injects its own registration, so it
  // only reproduced in a production build.
  if (!isConfigured)
    return (
      <>
        <NotConfigured />
        <UpdatePrompt />
      </>
    )

  return (
    <AuthProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
      <UpdatePrompt />
    </AuthProvider>
  )
}
