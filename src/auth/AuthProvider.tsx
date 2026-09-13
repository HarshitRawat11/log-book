import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { setCurrentUserId } from '../db/mutate'
import { clearLocal, requestPersistentStorage } from '../db/db'
import { resumeAfterAuth, startSync, stopSync } from '../db/sync'

type AuthState = {
  session: Session | null
  /** True until the initial session lookup settles. */
  loading: boolean
  /**
   * Signs out. Refuses if there are unflushed writes, unless forced - signing
   * out wipes the local store, and the outbox is the only copy of anything
   * that has not reached the server yet.
   */
  signOut: (opts?: { force?: boolean }) => Promise<{ ok: true } | { ok: false; pending: number }>
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => ({ ok: true }),
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    const apply = (next: Session | null) => {
      setSession(next)
      // Must happen before any component can issue a write: mutate() refuses to
      // build a row without a user_id.
      setCurrentUserId(next?.user.id ?? null)
      if (next) {
        startSync()
        resumeAfterAuth()
        // Ask once we know the app is actually in use - Chrome weighs
        // engagement and installation when deciding whether to grant it.
        void requestPersistentStorage()
      }
    }

    // Reads the persisted session from localStorage, so this resolves offline.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      apply(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      apply(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut: AuthState['signOut'] = async (opts = {}) => {
    const cleared = await clearLocal({ force: opts.force })
    if (!cleared.cleared) return { ok: false, pending: cleared.pending }
    stopSync()
    setCurrentUserId(null)
    await supabase?.auth.signOut()
    return { ok: true }
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
