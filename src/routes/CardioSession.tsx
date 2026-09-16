import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../cardio/SessionProvider'
import { mmss } from '../cardio/schedule'

/**
 * The running session. Read from two or three metres away, with gloves on.
 *
 * Full-screen colour carries the state, so a glance says where you are without
 * reading anything. Orange for work, deep navy for rest.
 *
 * The pair was measured, not chosen by eye. Separation between the two
 * backgrounds, including through dichromacy simulation:
 *
 *   normal 4.94:1 · protanopia 4.31:1 · deuteranopia 6.08:1 · tritanopia 4.92:1
 *
 * A first attempt (#d94f04 / #0a3d62) looked obviously different on screen but
 * measured 2.31:1 under protanopia - the two states would have been close to
 * the same brightness for a red-blind reader glancing across a room. The gap is
 * carried by LIGHTNESS as much as hue, which is what makes it survive; a
 * red/green pair would not.
 *
 * Identity is never colour alone regardless: the word WORK or REST is on the
 * screen, at 6.27:1 and 13.7:1 against their own backgrounds.
 *
 * Nothing else is here. No tab bar, no navigation, no stats.
 */

const SKIN = {
  round: { bg: '#ef6c00', fg: '#1a0a00', sub: 'rgba(26,10,0,.72)' },
  break: { bg: '#06283d', fg: '#eaf4ff', sub: 'rgba(234,244,255,.72)' },
  idle: { bg: '#0b0f14', fg: '#e8edf3', sub: '#97a3b3' },
} as const

/** Ending must survive a knocked phone, so it is a deliberate sustained press. */
const HOLD_MS = 2000

export function CardioSession() {
  const navigate = useNavigate()
  const { view, pause, resume, finish, rearm } = useSession()
  const { status, phase, remaining, round, totalRounds, active } = view

  const [holding, setHolding] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Arrived with no session at all - a stale bookmark, or a reload after the
  // session finished. Nothing to show.
  useEffect(() => {
    if (status === 'idle' && !active) navigate('/cardio', { replace: true })
  }, [status, active, navigate])

  // Ran to the end on its own. Straight to notes and RPE rather than a
  // dead-end "Done" that has to be dismissed before anything can be recorded.
  useEffect(() => {
    if (status === 'finished' && active) {
      navigate(`/cardio/review/${active.rowId}`, { replace: true })
    }
  }, [status, active, navigate])

  const skin = status === 'running' && phase ? SKIN[phase.kind] : SKIN.idle

  function startHold() {
    setHolding(true)
    holdTimer.current = setTimeout(async () => {
      setHolding(false)
      const rowId = await finish({ completed: false })
      // A session ended at round three is still twenty minutes of work worth
      // rating, so it gets the same review screen as one that ran out.
      navigate(rowId ? `/cardio/review/${rowId}` : '/cardio', { replace: true })
    }, HOLD_MS)
  }
  function cancelHold() {
    setHolding(false)
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => () => cancelHold(), [])


  return (
    <main
      className="flex min-h-dvh select-none flex-col items-center justify-center p-6"
      style={{ background: skin.bg, color: skin.fg, touchAction: 'manipulation' }}
      // The whole screen is the target, so a gloved palm works.
      onClick={() => {
        if (status === 'running') void pause()
      }}
    >
      {status === 'running' && phase && (
        <>
          <p className="text-2xl font-semibold uppercase tracking-widest" style={{ color: skin.sub }}>
            {phase.kind === 'round' ? 'Work' : 'Rest'}
          </p>
          {/* The dominant element by a wide margin: legible across a room. */}
          <p
            className="tabular font-bold leading-none"
            style={{ fontSize: 'min(42vw, 34vh)' }}
            aria-live="off"
          >
            {mmss(remaining)}
          </p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: skin.sub }}>
            Round {round} of {totalRounds}
          </p>
          {/* Phase progress. At three metres the bar is read before the
              numerals are, and it says the same thing. */}
          <div
            aria-hidden="true"
            className="mt-6 h-2 w-full max-w-md overflow-hidden rounded-full"
            style={{ background: 'rgba(0,0,0,.18)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, (1 - remaining / ((phase.endAt - phase.startAt) / 1000)) * 100))}%`,
                background: skin.fg,
                opacity: 0.55,
              }}
            />
          </div>
          <p className="mt-6 text-sm" style={{ color: skin.sub }}>
            Tap anywhere to pause
          </p>
        </>
      )}

      {status === 'paused' && (
        <div
          className="flex w-full max-w-sm flex-col items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-4xl font-bold">Paused</p>
          <p className="text-lg" style={{ color: SKIN.idle.sub }}>
            {mmss(remaining)} left in round {round} of {totalRounds}
          </p>
          <button
            onClick={() => void resume()}
            className="min-h-20 w-full rounded-2xl bg-accent text-2xl font-bold text-accent-text"
          >
            Resume
          </button>

          {/* Deliberate and sustained: a knocked phone at minute twenty must
              not be able to end the session. */}
          <button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            className="relative min-h-16 w-full overflow-hidden rounded-2xl border border-danger/50
                       text-lg font-semibold text-danger"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-danger/25"
              style={{
                width: holding ? '100%' : '0%',
                transition: holding ? `width ${HOLD_MS}ms linear` : 'none',
              }}
            />
            <span className="relative">{holding ? 'Keep holding…' : 'Hold to end session'}</span>
          </button>
        </div>
      )}

      {/* Restored after the page was killed: the clock is right, but nothing
          can sound until a gesture unlocks audio again. */}
      {status === 'running' && !view.armed && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            void rearm()
          }}
          className="mt-6 min-h-14 rounded-xl bg-accent px-6 font-semibold text-accent-text"
        >
          Tap to re-arm sound
        </button>
      )}
    </main>
  )
}
