import { createContext, useContext, type ReactNode } from 'react'
import { useCardioSession } from './useSession'

/**
 * One session instance, shared by the config screen and the running screen.
 *
 * It has to be shared rather than a hook in each: the AudioContext can only be
 * unlocked from inside a user gesture, and the only gesture available is the
 * Start tap on the config screen. A second context created later on the
 * running screen would be born suspended and stay silent, with no error
 * anywhere to say why.
 */

type Session = ReturnType<typeof useCardioSession>

const Ctx = createContext<Session | null>(null)

export function CardioProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useCardioSession()}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside CardioProvider')
  return s
}
