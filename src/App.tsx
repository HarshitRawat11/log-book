import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { AuthCallback } from './auth/AuthCallback'
import { SignIn } from './auth/SignIn'
import { TabBar } from './components/TabBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { Train } from './routes/Train'
import { CardioProvider } from './cardio/SessionProvider'
import { RestProvider, useRest } from './training/RestProvider'
import { RestBar } from './training/RestBar'
import { isConfigured } from './lib/env'

/**
 * Train is eager; everything else is a separate chunk.
 *
 * Two reasons, and the second is the one that actually matters day to day:
 *
 * 1. Cold open lands on Train, so nothing else needs to be parsed first.
 *    Progress alone pulled in Recharts and its d3/redux/decimal dependencies -
 *    around 370kB raw, roughly a third of the bundle - to render a screen you
 *    open once a week.
 * 2. Workbox precaches every chunk and revisions them individually. As one
 *    file, *any* change re-downloaded the whole bundle onto the phone at every
 *    deploy. Split, editing the logging screen re-downloads the logging
 *    screen. Precaching also means these still work offline: the chunk is on
 *    the device before the route is ever visited.
 *
 * Named exports, so each needs unwrapping into the default lazy() expects.
 */
const lazyRoute = <T extends Record<string, React.ComponentType>>(
  load: () => Promise<T>,
  name: keyof T,
) => lazy(() => load().then((m) => ({ default: m[name]! })))

const Food = lazyRoute(() => import('./routes/Food'), 'Food')
const Foods = lazyRoute(() => import('./routes/Foods'), 'Foods')
const Cardio = lazyRoute(() => import('./routes/Cardio'), 'Cardio')
const CardioSession = lazyRoute(() => import('./routes/CardioSession'), 'CardioSession')
const CardioReview = lazyRoute(() => import('./routes/CardioReview'), 'CardioReview')
const Progress = lazyRoute(() => import('./routes/Progress'), 'Progress')
const Settings = lazyRoute(() => import('./routes/Settings'), 'Settings')
const Exercises = lazyRoute(() => import('./routes/Exercises'), 'Exercises')
const History = lazyRoute(() => import('./routes/History'), 'History')
const WorkoutDetail = lazyRoute(() => import('./routes/WorkoutDetail'), 'WorkoutDetail')

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
  const rest = useRest()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* The tab bar stays mounted while a route chunk arrives, so switching
          tabs never flashes the shell away. Blank rather than a spinner, for
          the same reason RequireAuth is blank: off the service worker cache
          this resolves in a frame, and a spinner that flickers reads as
          slowness. */}
      <Suspense fallback={<div className="flex-1 bg-bg" />}>
        <Outlet />
      </Suspense>
      {/* Above the tab bar on EVERY tab, not just Train. Leaving the logging
          screen mid-rest is normal - you check a recipe, or last week's
          numbers - and the countdown has to come with you. */}
      <RestBar timer={rest} />
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

/**
 * The same auth guard with NO shell.
 *
 * The running cardio session must have no tab bar and no navigation on it at
 * all - it is read from across a room with gloves on - so it cannot live under
 * AppShell.
 */
function RequireAuthBare() {
  const { session, loading } = useAuth()
  if (loading) return <div className="min-h-dvh bg-bg" />
  if (!session) return <Navigate to="/signin" replace />
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <Outlet />
    </Suspense>
  )
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
      <Route element={<RequireAuthBare />}>
        <Route path="/cardio/session" element={<CardioSession />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/train" element={<Train />} />
        <Route path="/food" element={<Food />} />
        <Route path="/foods" element={<Foods />} />
        <Route path="/cardio" element={<Cardio />} />
        <Route path="/cardio/review/:id" element={<CardioReview />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:workoutId" element={<WorkoutDetail />} />
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
        {/* Above the routes, so the config screen's Start tap and the running
            screen share one session - and one AudioContext. A second context
            created on the running screen would be born suspended. */}
        <CardioProvider>
          <RestProvider>
            <Router />
          </RestProvider>
        </CardioProvider>
      </BrowserRouter>
      <UpdatePrompt />
    </AuthProvider>
  )
}
