import { describe, expect, it } from 'vitest'
import { planCues } from './cues'
import { buildSchedule } from './schedule'

/**
 * Cue placement is the part that has to be right for thirty unattended
 * minutes, with no way to correct it once the gloves are on, so every rule is
 * pinned here rather than trusted.
 */

const T0 = 1_800_000_000_000
const KICK = { work_seconds: 300, break_seconds: 120, rounds: 3 }
const at = (cues: ReturnType<typeof planCues>, kind: string) =>
  cues.filter((c) => c.kind === kind).map((c) => (c.at - T0) / 1000)

describe('planCues', () => {
  const cues = planCues(buildSchedule(KICK, T0))

  it('opens every round with the ascending bell', () => {
    expect(at(cues, 'roundStart')).toEqual([0, 420, 840])
  })

  it('closes every round with the descending bell', () => {
    expect(at(cues, 'roundEnd')).toEqual([300, 720, 1140])
  })

  it('warns 10s before each round ends, and only for rounds', () => {
    expect(at(cues, 'warn10')).toEqual([290, 710, 1130])
  })

  it('ticks three times into each round, from inside the break before it', () => {
    // Breaks run 300-420 and 720-840. Ticks land at -3/-2/-1s of each.
    expect(at(cues, 'tick')).toEqual([417, 418, 419, 837, 838, 839])
  })

  it('finishes once, just after the last bell', () => {
    expect(at(cues, 'finish')).toEqual([1141])
  })

  it('is ordered by time, because it is scheduled in order', () => {
    const times = cues.map((c) => c.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('never places a cue outside the session', () => {
    const end = T0 + 1140_000
    expect(cues.every((c) => c.at >= T0 && c.at <= end + 2000)).toBe(true)
  })
})

describe('planCues guards', () => {
  it('drops the warning when a round is too short to fit one', () => {
    // A 10s round: a 10s warning would land exactly on the opening bell.
    const cues = planCues(buildSchedule({ work_seconds: 10, break_seconds: 30, rounds: 2 }, T0))
    expect(at(cues, 'warn10')).toEqual([])
    expect(at(cues, 'roundStart')).toEqual([0, 40])
  })

  it('drops the ticks when a break is too short to fit them', () => {
    const cues = planCues(buildSchedule({ work_seconds: 60, break_seconds: 3, rounds: 2 }, T0))
    expect(at(cues, 'tick')).toEqual([])
  })

  it('has no ticks at all when there are no breaks', () => {
    const cues = planCues(buildSchedule({ work_seconds: 60, break_seconds: 0, rounds: 3 }, T0))
    expect(at(cues, 'tick')).toEqual([])
    expect(at(cues, 'roundStart')).toEqual([0, 60, 120])
  })

  it('still cues a single-round session correctly', () => {
    const cues = planCues(buildSchedule({ work_seconds: 600, break_seconds: 120, rounds: 1 }, T0))
    expect(at(cues, 'roundStart')).toEqual([0])
    expect(at(cues, 'roundEnd')).toEqual([600])
    expect(at(cues, 'finish')).toEqual([601])
    expect(at(cues, 'tick')).toEqual([])
  })
})

describe('planCues at speed', () => {
  /**
   * Fast-forward must rehearse the SAME cue structure, not a reduced one.
   * If the offsets did not scale, a 15x run would put the 10s warning before
   * the round started and the guards would then drop it - so the one thing
   * the fast run exists to verify would be the thing it skipped.
   */
  it('produces the same cues, with offsets scaled', () => {
    const speed = 20
    const fast = { work_seconds: 300 / speed, break_seconds: 120 / speed, rounds: 3 }
    const cues = planCues(buildSchedule(fast, T0), speed)

    expect(at(cues, 'roundStart')).toEqual([0, 21, 42])
    expect(at(cues, 'roundEnd')).toEqual([15, 36, 57])
    expect(at(cues, 'warn10')).toEqual([14.5, 35.5, 56.5]) // 10s/20 = 0.5s before
    expect(at(cues, 'finish')).toEqual([57.05])
  })

  it('keeps every cue kind that the real-time run has', () => {
    const speed = 20
    const real = new Set(planCues(buildSchedule(KICK, T0)).map((c) => c.kind))
    const fast = new Set(
      planCues(
        buildSchedule(
          { work_seconds: 300 / speed, break_seconds: 120 / speed, rounds: 3 },
          T0,
        ),
        speed,
      ).map((c) => c.kind),
    )
    expect([...fast].sort()).toEqual([...real].sort())
  })
})
