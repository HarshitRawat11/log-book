import { useCallback, useEffect, useRef, useState } from 'react'
import { createOutput, ensureContext, scheduleCue } from '../cardio/audio'

/**
 * The rest between sets.
 *
 * Built on the same principle as the cardio timer and reusing its cue
 * synthesis outright: the display counts down from `Date.now()` against an
 * ABSOLUTE end timestamp, and the audio is scheduled on the AudioContext clock
 * the moment the timer starts. That split is the whole design. A throttled or
 * frozen main thread can make the number on screen stutter; it cannot make the
 * cue late, because the cue was handed to the audio thread up front.
 *
 * Deliberately much smaller than `cardio/useSession`:
 *
 *  - no rounds, so no schedule to build and nothing to reconcile
 *  - no persistence. A rest timer that survived a reload would be resuming a
 *    rest you stopped taking four hours ago. It dies with the page, on purpose.
 *  - no wake lock. This is ninety seconds with the phone in your hand, not
 *    thirty unattended minutes with gloves on.
 *
 * Audio unlocks because `start` is only ever called from inside the tap that
 * logs a set. A context created outside a user gesture stays `suspended` and
 * silent with no error anywhere - the trap the cardio spike already found.
 */

export type RestTimer = {
  /** Seconds left, or null when nothing is running. */
  remaining: number | null
  /** What this rest was started for, so the bar can name it. */
  label: string | null
  /** The length of the rest currently running, for the progress bar. */
  total: number | null
  start: (seconds: number, label: string) => void
  /** Lengthen or shorten the rest in flight. Re-schedules the cues. */
  adjust: (deltaSeconds: number) => void
  stop: () => void
}

/** The cue fires this long before the end, as a "get set up" warning. */
const WARN_AT = 10

/** How long the bar stays at zero, so the finish is seen and not just heard. */
const LINGER_MS = 2000

export function useRestTimer(): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  const ctx = useRef<AudioContext | null>(null)
  const out = useRef<GainNode | null>(null)
  const scheduled = useRef<OscillatorNode[]>([])
  // Read by `adjust`, which must not do its work inside a state updater: React
  // may call an updater twice, and scheduling cues twice would double every
  // blip.
  const endsAtRef = useRef<number | null>(null)
  endsAtRef.current = endsAt
  /** Stops the linger timeout being re-armed on all eight ticks after zero. */
  const finishing = useRef(false)

  /** Cancel anything the audio thread is still holding. */
  const clearCues = useCallback(() => {
    for (const osc of scheduled.current) {
      try {
        osc.stop()
      } catch {
        // Already stopped, or never started. Nothing to do either way.
      }
    }
    scheduled.current = []
  }, [])

  /**
   * Hand the audio thread both cues at once.
   *
   * Scheduled from `ctx.currentTime` rather than from wall-clock arithmetic,
   * because those two clocks drift and only one of them is the one the sound
   * actually plays on.
   */
  const scheduleFor = useCallback(
    (secondsFromNow: number) => {
      const c = ctx.current
      const o = out.current
      if (!c || !o) return
      clearCues()
      if (secondsFromNow <= 0) return

      const end = c.currentTime + secondsFromNow
      if (secondsFromNow > WARN_AT) {
        scheduled.current.push(...scheduleCue(c, o, 'warn10', end - WARN_AT))
      }
      scheduled.current.push(...scheduleCue(c, o, 'roundEnd', end))
    },
    [clearCues],
  )

  const stop = useCallback(() => {
    clearCues()
    finishing.current = false
    setEndsAt(null)
    setTotal(null)
    setLabel(null)
    setRemaining(null)
  }, [clearCues])

  const start = useCallback(
    (seconds: number, forLabel: string) => {
      if (seconds <= 0) return
      const end = Date.now() + seconds * 1000

      finishing.current = false
      setEndsAt(end)
      setTotal(seconds)
      setLabel(forLabel)
      setRemaining(seconds)

      // Not awaited: the caller is the tap that logs a set, and making it wait
      // on the audio hardware would put a stall between the tap and the row
      // appearing. Resuming still happens inside the gesture, which is what
      // actually unlocks audio.
      void ensureContext(ctx.current).then((c) => {
        ctx.current = c
        out.current ??= createOutput(c)
        // Re-derived from the end timestamp rather than reusing `seconds`:
        // resuming a suspended context takes a moment on Android, and
        // scheduling as though no time had passed fires both cues late by
        // exactly that much.
        scheduleFor((end - Date.now()) / 1000)
      })
    },
    [scheduleFor],
  )

  const adjust = useCallback(
    (delta: number) => {
      const current = endsAtRef.current
      if (current === null) return

      const next = current + delta * 1000
      const left = (next - Date.now()) / 1000

      // Shortening past the end finishes it rather than leaving a negative
      // countdown and a cue scheduled in the past.
      if (left <= 0) {
        clearCues()
        setEndsAt(Date.now())
        return
      }
      scheduleFor(left)
      setEndsAt(next)
      setTotal((t) => (t === null ? t : Math.max(1, Math.round(t + delta))))
    },
    [clearCues, scheduleFor],
  )

  /**
   * Tick the DISPLAY only. The cues are already with the audio thread, so this
   * interval being throttled in the background costs nothing but a stale
   * number, which corrects itself the moment the tab is visible again.
   */
  useEffect(() => {
    if (endsAt === null) return

    const tick = () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000)
      setRemaining(Math.max(0, left))
      if (left > 0 || finishing.current) return
      finishing.current = true
      window.setTimeout(stop, LINGER_MS)
    }

    tick()
    const id = window.setInterval(tick, 250)
    // Coming back from the background: correct the number immediately rather
    // than waiting up to 250ms, and catch a rest that ended while away.
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [endsAt, stop])

  // Nothing scheduled may outlive the screen. Navigating away mid-rest must
  // not leave a bell queued to fire over whatever comes next.
  useEffect(() => clearCues, [clearCues])

  return { remaining, label, total, start, adjust, stop }
}
