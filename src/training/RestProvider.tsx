import { createContext, useContext, type ReactNode } from 'react'
import { useRestTimer, type RestTimer } from './useRestTimer'

/**
 * One rest timer for the whole app.
 *
 * It used to live inside the Train route, which meant switching tabs unmounted
 * it: the hook's cleanup cancelled the scheduled cues and the countdown simply
 * ended. Measured at 1:52, tapping Food and coming back left no bar and no
 * bell. Between sets you *do* glance at Progress or look up a recipe, and a
 * rest that silently stops when you do is worse than no rest timer, because you
 * are waiting for a sound that is never coming.
 *
 * Above the router for the same reason CardioProvider is: the tap that starts
 * it has to own the AudioContext, and a context created anywhere else would be
 * born suspended.
 */

const RestContext = createContext<RestTimer | null>(null)

export function RestProvider({ children }: { children: ReactNode }) {
  const timer = useRestTimer()
  return <RestContext.Provider value={timer}>{children}</RestContext.Provider>
}

export function useRest(): RestTimer {
  const ctx = useContext(RestContext)
  if (!ctx) throw new Error('useRest must be used inside RestProvider')
  return ctx
}
