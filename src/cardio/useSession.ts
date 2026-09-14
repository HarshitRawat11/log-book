import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { CardioSession } from '../db/types'
import { createOutput, ensureContext, scheduleCue } from './audio'
import { planCues } from './cues'
import {
  buildSchedule,
  endsAt,
  phaseAt,
  roundsCompletedBy,
  type CardioConfig,
  type Phase,
} from './schedule'
import { todayIso } from '../lib/dates'

/**
 * The running session.
 *
 * Nothing here counts down. The schedule is absolute timestamps computed once,
 * the display is derived from Date.now() on every tick, and every cue for the
 * whole session is handed to the AudioContext clock at the start tap. A frozen
 * main thread therefore cannot make the timer wrong or the bells late - which
 * matters because with gloves on there is no way to nudge it back into life.
 *
 * Verified on the device: with the screen off, all six cues of a 70s run
 * sounded, so no keepalive tone or MediaSession element is needed.
 */

export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished'

/** Enough to rebuild the whole session after the page is killed. */
export type ActiveSession = {
  rowId: string
  config: CardioConfig
  /** Epoch ms of the original start tap. */
  startedAt: number
  /** Total ms spent paused, so the schedule origin can be shifted. */
  pausedMs: number
  pausedAt: number | null
  speed: number
  activity: string
  presetName: string | null
}

const ACTIVE_KEY = 'cardio:active'

/**
 * Local-only, in `meta`. An in-progress session is device state: half a
 * session showing up on another device would be meaningless, and it must not
 * consume outbox entries on every pause.
 */
async function saveActive(a: ActiveSession) {
  await db.meta.put({ key: ACTIVE_KEY, value: a })
}
export async function loadActive(): Promise<ActiveSession | null> {
  return ((await db.meta.get(ACTIVE_KEY))?.value as ActiveSession | undefined) ?? null
}
async function clearActive() {
  await db.meta.delete(ACTIVE_KEY)
}

/** Schedule origin, accounting for time spent paused. */
const originOf = (a: ActiveSession) => a.startedAt + a.pausedMs

/**
 * The config the SCHEDULE runs on, which is not the config the row records.
 *
 * Fast-forward has to compress the schedule itself, not just the cue offsets.
 * The first version scaled only the offsets, so a x5 run took the full four
 * minutes while its warnings fired at a fifth of the right moment - the mode
 * that exists to make a cycle verifiable in under a minute verified nothing
 * and misplaced the cues while doing it.
 *
 * The row keeps the real durations: a rehearsal at x20 must not be logged as
 * fifteen-second rounds.
 */
const scheduleConfigOf = (a: ActiveSession): CardioConfig =>
  a.speed === 1
    ? a.config
    : {
        work_seconds: a.config.work_seconds / a.speed,
        break_seconds: a.config.break_seconds / a.speed,
        rounds: a.config.rounds,
      }

export type SessionView = {
  status: SessionStatus
  /** False for a session restored after a kill: it runs, but is silent until tapped. */
  armed: boolean
  phase: Phase | null
  /** Seconds left in the current phase. */
  remaining: number
  round: number
  totalRounds: number
  roundsCompleted: number
  active: ActiveSession | null
}

export function useCardioSession() {
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [status, setStatus] = useState<SessionStatus>('idle')
  /**
   * Whether audio is unlocked in THIS page lifetime.
   *
   * A session restored after the page was killed is running correctly - the
   * schedule is absolute - but it cannot make a sound until something is
   * tapped, because a context can only be unlocked inside a user gesture. The
   * screen has to know to ask.
   */
  const [armed, setArmed] = useState(false)
  const [, forceTick] = useState(0)

  const audio = useRef<{ ctx: AudioContext; out: GainNode } | null>(null)
  const nodes = useRef<OscillatorNode[]>([])
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const phases = useRef<Phase[]>([])
  const lastRounds = useRef(0)

  /* ------------------------------------------------------------- audio ---- */

  const cancelCues = useCallback(() => {
    for (const n of nodes.current) {
      try {
        n.stop()
      } catch {
        // Already finished. Stopping a stopped node throws; nothing to do.
      }
    }
    nodes.current = []
  }, [])

  /** Convert epoch-time cues onto the audio clock and hand them over. */
  const scheduleFrom = useCallback((a: ActiveSession, ph: Phase[]) => {
    const gear = audio.current
    if (!gear) return
    const nowEpoch = Date.now()
    const fresh: OscillatorNode[] = []
    for (const c of planCues(ph, a.speed)) {
      const dt = (c.at - nowEpoch) / 1000
      // Never replay something genuinely missed: a bell for a round that ended
      // four minutes ago is worse than silence.
      //
      // The quarter-second of slack matters though. Round one's opening bell
      // is due at the start instant, and by the time the row is written and
      // the schedule built it is already a few milliseconds old - so a strict
      // dt < 0 silently dropped the "go" that starts the session.
      if (dt < -0.25) continue
      fresh.push(
        ...scheduleCue(gear.ctx, gear.out, c.kind, gear.ctx.currentTime + Math.max(0, dt)),
      )
    }
    nodes.current = fresh
  }, [])

  /* --------------------------------------------------------- wake lock ---- */

  const acquireWakeLock = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator)) return
      wakeLock.current = await navigator.wakeLock.request('screen')
    } catch {
      // Refused, or the document is not visible. The session is unaffected -
      // the wake lock keeps the screen on, it does not keep time.
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }, [])

  /* ------------------------------------------------------------ control --- */

  /** Must be called from inside the start tap, or the context stays silent. */
  const start = useCallback(
    async (opts: {
      config: CardioConfig
      activity: string
      presetName: string | null
      speed?: number
    }) => {
      const ctx = await ensureContext(audio.current?.ctx)
      if (!audio.current) audio.current = { ctx, out: createOutput(ctx) }

      const startedAt = Date.now()
      const speed = opts.speed ?? 1

      // The row is written NOW, not at the end. A session killed at minute
      // twenty must still exist; losing it because the phone died would be
      // exactly the "twenty minutes that vanished" the brief rules out.
      const row = await putRow(
        'cardio_sessions',
        newRow({
          date: todayIso(),
          started_at: new Date(startedAt).toISOString(),
          ended_at: null,
          activity: opts.activity,
          preset_name: opts.presetName,
          work_seconds: opts.config.work_seconds,
          break_seconds: opts.config.break_seconds,
          rounds_planned: opts.config.rounds,
          rounds_completed: 0,
          completed: false,
          notes: null,
          rpe: null,
        }) as CardioSession,
      )
      scheduleFlush()

      const a: ActiveSession = {
        rowId: row.id,
        config: opts.config,
        startedAt,
        pausedMs: 0,
        pausedAt: null,
        speed,
        activity: opts.activity,
        presetName: opts.presetName,
      }
      phases.current = buildSchedule(scheduleConfigOf(a), originOf(a))
      lastRounds.current = 0
      scheduleFrom(a, phases.current)
      await saveActive(a)
      setActive(a)
      setStatus('running')
      setArmed(true)
      void acquireWakeLock()
    },
    [acquireWakeLock, scheduleFrom],
  )

  /** Resume a session the page was killed during. */
  const restore = useCallback(
    async (a: ActiveSession) => {
      phases.current = buildSchedule(scheduleConfigOf(a), originOf(a))
      lastRounds.current = roundsCompletedBy(phases.current, Date.now())
      setActive(a)
      setStatus(a.pausedAt ? 'paused' : Date.now() >= endsAt(phases.current) ? 'finished' : 'running')
      // Audio needs a gesture, so cues are NOT rescheduled here. The screen
      // asks for a tap, and rearm() does it.
    },
    [],
  )

  /** The tap that re-arms audio after a restore. */
  const rearm = useCallback(async () => {
    if (!active) return
    const ctx = await ensureContext(audio.current?.ctx)
    if (!audio.current) audio.current = { ctx, out: createOutput(ctx) }
    cancelCues()
    scheduleFrom(active, phases.current)
    setArmed(true)
    void acquireWakeLock()
  }, [active, acquireWakeLock, cancelCues, scheduleFrom])

  const pause = useCallback(async () => {
    if (!active || status !== 'running') return
    cancelCues()
    const gear = audio.current
    // Say so out loud: a stray glove that pauses the session has to be
    // audible, because you are not looking at the bench.
    if (gear) scheduleCue(gear.ctx, gear.out, 'pause', gear.ctx.currentTime + 0.02)
    const a = { ...active, pausedAt: Date.now() }
    await saveActive(a)
    setActive(a)
    setStatus('paused')
    releaseWakeLock()
  }, [active, status, cancelCues, releaseWakeLock])

  const resume = useCallback(async () => {
    if (!active || active.pausedAt === null) return
    const a: ActiveSession = {
      ...active,
      pausedMs: active.pausedMs + (Date.now() - active.pausedAt),
      pausedAt: null,
    }
    // Every remaining timestamp shifts by the pause, so the schedule is rebuilt
    // rather than patched.
    phases.current = buildSchedule(scheduleConfigOf(a), originOf(a))
    const gear = await ensureContext(audio.current?.ctx)
    if (!audio.current) audio.current = { ctx: gear, out: createOutput(gear) }
    cancelCues()
    scheduleFrom(a, phases.current)
    await saveActive(a)
    setActive(a)
    setStatus('running')
    setArmed(true)
    void acquireWakeLock()
  }, [active, acquireWakeLock, cancelCues, scheduleFrom])

  /** Finish, whether the session ran out or was ended early. */
  const finish = useCallback(
    async (opts: { completed: boolean }) => {
      if (!active) return null
      cancelCues()
      releaseWakeLock()
      // Count from the frozen instant if paused, not from the wall clock.
      // Ending a paused session used Date.now(), which had carried on past a
      // schedule that had not - so quitting with one second left in round two
      // logged round two as completed. The row has to say what happened.
      const done = roundsCompletedBy(phases.current, active.pausedAt ?? Date.now())
      await patchRow<CardioSession>('cardio_sessions', active.rowId, {
        ended_at: new Date().toISOString(),
        rounds_completed: done,
        completed: opts.completed,
      })
      scheduleFlush()
      await clearActive()
      setStatus('finished')
      return active.rowId
    },
    [active, cancelCues, releaseWakeLock],
  )

  /* ------------------------------------------------------------ effects --- */

  // Pick up a session the page was killed during.
  useEffect(() => {
    void loadActive().then((a) => {
      if (a) void restore(a)
    })
  }, [restore])

  // Derived display. 250ms is plenty for whole seconds, and because nothing is
  // accumulated a throttled tick is simply a late render, never a wrong one.
  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(() => forceTick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [status])

  // Keep rounds_completed roughly current, so a session killed mid-way still
  // reports honestly. One write per round is nothing.
  useEffect(() => {
    if (status !== 'running' || !active) return
    const done = roundsCompletedBy(phases.current, Date.now())
    if (done === lastRounds.current) return
    lastRounds.current = done
    void patchRow<CardioSession>('cardio_sessions', active.rowId, { rounds_completed: done }).then(
      scheduleFlush,
    )
  })

  // Auto-finish once the last round is over.
  useEffect(() => {
    if (status !== 'running' || !active) return
    if (Date.now() < endsAt(phases.current)) return
    void finish({ completed: true })
  })

  // Returning to visibility: re-acquire the lock, resume a suspended context,
  // and let the derived display correct itself. Missed cues stay missed.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (status === 'running') void acquireWakeLock()
      const ctx = audio.current?.ctx
      if (ctx && ctx.state === 'suspended') void ctx.resume()
      forceTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [status, acquireWakeLock])

  useEffect(() => () => releaseWakeLock(), [releaseWakeLock])

  /* -------------------------------------------------------------- view ---- */

  const now = Date.now()
  const frozenAt = active?.pausedAt ?? now
  const phase = phases.current.length ? phaseAt(phases.current, frozenAt) : null

  const view: SessionView = {
    status,
    armed,
    phase,
    remaining: phase ? (phase.endAt - frozenAt) / 1000 : 0,
    round: phase?.round ?? 0,
    totalRounds: active?.config.rounds ?? 0,
    roundsCompleted: phases.current.length ? roundsCompletedBy(phases.current, frozenAt) : 0,
    active,
  }

  return { view, start, pause, resume, finish, rearm }
}
