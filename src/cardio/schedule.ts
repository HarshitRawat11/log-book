import type { CardioPreset } from '../db/types'

/**
 * The session schedule.
 *
 * Absolute timestamps, computed once at the start tap, for the whole session.
 * Nothing is ever decremented.
 *
 * That is the entire point. A decrementing counter driven by setInterval
 * accumulates drift even in the foreground, and Chrome throttles background
 * timers hard enough to make it wrong by minutes. Here the display is derived:
 * take Date.now(), find the phase it falls in, subtract. If the main thread is
 * frozen for eight seconds and wakes late, the next render is simply correct,
 * because nothing was counting.
 */

export type CardioConfig = {
  work_seconds: number
  break_seconds: number
  rounds: number
}

export type Phase = {
  /** 1-based round number this phase belongs to. */
  round: number
  kind: 'round' | 'break'
  /** Epoch milliseconds. */
  startAt: number
  endAt: number
}

export const configOf = (p: CardioPreset): CardioConfig => ({
  work_seconds: p.work_seconds,
  break_seconds: p.break_seconds,
  rounds: p.rounds,
})

/**
 * Total wall-clock seconds.
 *
 * `rounds - 1` breaks, not `rounds`: the session ends when the last round ends,
 * not after a break nobody takes. Six 5-minute rounds with 2-minute breaks is
 * 40 minutes, not 42.
 */
export function totalSeconds(c: CardioConfig): number {
  if (c.rounds < 1) return 0
  return c.rounds * c.work_seconds + (c.rounds - 1) * c.break_seconds
}

/** Whole session as absolute timestamps, derived once from the start instant. */
export function buildSchedule(c: CardioConfig, startMs: number): Phase[] {
  const phases: Phase[] = []
  let t = startMs

  for (let r = 1; r <= c.rounds; r++) {
    const workEnd = t + c.work_seconds * 1000
    phases.push({ round: r, kind: 'round', startAt: t, endAt: workEnd })
    t = workEnd

    // No trailing break: the session is over when the last round is.
    if (r < c.rounds && c.break_seconds > 0) {
      const breakEnd = t + c.break_seconds * 1000
      phases.push({ round: r, kind: 'break', startAt: t, endAt: breakEnd })
      t = breakEnd
    }
  }
  return phases
}

/**
 * Which phase a moment falls in, or null once the session is over.
 *
 * A linear scan: a session is a few dozen phases at most, and this runs a few
 * times a second. Anything cleverer would be harder to read for no gain.
 */
export function phaseAt(phases: Phase[], nowMs: number): Phase | null {
  for (const p of phases) if (nowMs >= p.startAt && nowMs < p.endAt) return p
  return null
}

/** Rounds fully finished by `nowMs` - what `rounds_completed` records. */
export function roundsCompletedBy(phases: Phase[], nowMs: number): number {
  return phases.filter((p) => p.kind === 'round' && nowMs >= p.endAt).length
}

export const endsAt = (phases: Phase[]): number =>
  phases.length === 0 ? 0 : phases[phases.length - 1]!.endAt

/** m:ss, for the big numerals. Clamped at zero rather than showing -0:01. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "40 min" / "1 h 04 min", for the pre-session total. */
export function humanDuration(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
