import type { CueKind } from './audio'
import type { Phase } from './schedule'

/**
 * Where every cue falls, as absolute epoch milliseconds.
 *
 * Pure, and separated from anything that makes a sound, because cue placement
 * is the part that has to be right for thirty unattended minutes and is the
 * part a test can actually pin down.
 *
 * The rules:
 *   - every round opens with the ascending bell
 *   - a 10-second warning before a round ends, ROUNDS ONLY
 *   - every round closes with the descending bell
 *   - three ticks lead into a round, in the last three seconds of the break
 *     before it - the countdown, as ticks rather than speech
 *   - the session closes with the finish flourish, just after the last bell
 *
 * Breaks get no warning of their own: the ticks already say a round is coming,
 * and a fourth distinct sound in a two-minute break is noise, not information.
 */

export type PlannedCue = { kind: CueKind; at: number }

/**
 * Cue offsets scale with `speed` alongside everything else.
 *
 * At speed 20 a five-minute round lasts fifteen seconds and its warning lands
 * half a second before the bell. That keeps the fast-forward mode a real
 * rehearsal of the cue structure rather than a different one - if the warning
 * stayed a literal ten seconds it would fire before the round began, and the
 * one thing worth testing would be the thing not tested.
 */
const WARN_BEFORE_MS = 10_000
/** Below this a warning would land on top of the opening bell. */
const WARN_MIN_ROUND_MS = 15_000
const TICKS_BEFORE_MS = [3000, 2000, 1000]
/** Below this the three ticks would not fit inside the break. */
const TICK_MIN_BREAK_MS = 4000
const FINISH_AFTER_MS = 1000

export function planCues(phases: Phase[], speed = 1): PlannedCue[] {
  const scale = (ms: number) => ms / speed
  const cues: PlannedCue[] = []
  const rounds = phases.filter((p) => p.kind === 'round')
  const lastRound = rounds[rounds.length - 1]

  for (const p of phases) {
    const duration = p.endAt - p.startAt

    if (p.kind === 'round') {
      cues.push({ kind: 'roundStart', at: p.startAt })

      if (duration > scale(WARN_MIN_ROUND_MS)) {
        cues.push({ kind: 'warn10', at: p.endAt - scale(WARN_BEFORE_MS) })
      }

      cues.push({ kind: 'roundEnd', at: p.endAt })

      if (p === lastRound) {
        cues.push({ kind: 'finish', at: p.endAt + scale(FINISH_AFTER_MS) })
      }
      continue
    }

    // Break: tick down into the round that follows.
    if (duration >= scale(TICK_MIN_BREAK_MS)) {
      for (const before of TICKS_BEFORE_MS) {
        cues.push({ kind: 'tick', at: p.endAt - scale(before) })
      }
    }
  }

  return cues.sort((a, b) => a.at - b.at)
}
