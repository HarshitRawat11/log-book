import { describe, expect, it } from 'vitest'
import {
  buildSchedule,
  endsAt,
  humanDuration,
  mmss,
  phaseAt,
  roundsCompletedBy,
  totalSeconds,
} from './schedule'

/**
 * The schedule decides when every bell rings for thirty unattended minutes,
 * with no way to correct it mid-session. It is pure arithmetic, so it is
 * pinned here rather than discovered on a gym floor.
 */

const KICKBOXING = { work_seconds: 300, break_seconds: 120, rounds: 6 }
const HIIT = { work_seconds: 20, break_seconds: 10, rounds: 8 }
const T0 = 1_800_000_000_000 // an arbitrary fixed epoch

describe('totalSeconds', () => {
  it('counts one fewer break than rounds', () => {
    // 6x5min work = 1800s, 5 breaks x 2min = 600s. Not 6 breaks.
    expect(totalSeconds(KICKBOXING)).toBe(2400)
    expect(humanDuration(2400)).toBe('40 min')
  })

  it('handles a single round, which has no breaks at all', () => {
    expect(totalSeconds({ work_seconds: 600, break_seconds: 120, rounds: 1 })).toBe(600)
  })

  it('handles a zero-length break as continuous work', () => {
    expect(totalSeconds({ work_seconds: 60, break_seconds: 0, rounds: 5 })).toBe(300)
  })

  it('crosses the hour boundary readably', () => {
    expect(humanDuration(3840)).toBe('1 h 04 min')
  })
})

describe('buildSchedule', () => {
  it('alternates round and break, and does not end on a break', () => {
    const p = buildSchedule(KICKBOXING, T0)
    expect(p.map((x) => x.kind)).toEqual([
      'round', 'break', 'round', 'break', 'round', 'break',
      'round', 'break', 'round', 'break', 'round',
    ])
    expect(p[p.length - 1]!.kind).toBe('round')
  })

  it('is contiguous: every phase starts exactly where the last ended', () => {
    const p = buildSchedule(HIIT, T0)
    for (let i = 1; i < p.length; i++) expect(p[i]!.startAt).toBe(p[i - 1]!.endAt)
  })

  it('ends at exactly start + total, with no accumulated drift', () => {
    const p = buildSchedule(KICKBOXING, T0)
    expect(endsAt(p)).toBe(T0 + totalSeconds(KICKBOXING) * 1000)
  })

  it('emits no break phases when the break is zero', () => {
    const p = buildSchedule({ work_seconds: 60, break_seconds: 0, rounds: 3 }, T0)
    expect(p.every((x) => x.kind === 'round')).toBe(true)
    expect(p).toHaveLength(3)
  })

  it('numbers a break with the round it follows', () => {
    const p = buildSchedule(KICKBOXING, T0)
    expect(p[1]).toMatchObject({ kind: 'break', round: 1 })
    expect(p[2]).toMatchObject({ kind: 'round', round: 2 })
  })
})

describe('phaseAt', () => {
  const p = buildSchedule(KICKBOXING, T0)

  it('finds the round in progress', () => {
    expect(phaseAt(p, T0 + 10_000)).toMatchObject({ kind: 'round', round: 1 })
  })

  it('treats a boundary as belonging to the phase starting, not ending', () => {
    // Exactly 300s in: round 1 is over, the break owns this instant.
    expect(phaseAt(p, T0 + 300_000)).toMatchObject({ kind: 'break', round: 1 })
  })

  it('returns null once the session is over', () => {
    expect(phaseAt(p, endsAt(p))).toBeNull()
    expect(phaseAt(p, endsAt(p) + 60_000)).toBeNull()
  })

  it('returns null before the session starts', () => {
    expect(phaseAt(p, T0 - 1)).toBeNull()
  })
})

describe('roundsCompletedBy', () => {
  const p = buildSchedule(KICKBOXING, T0)

  it('counts nothing during the first round', () => {
    expect(roundsCompletedBy(p, T0 + 1000)).toBe(0)
  })

  it('counts a round the instant it ends', () => {
    expect(roundsCompletedBy(p, T0 + 300_000)).toBe(1)
  })

  it('does not count the break that follows', () => {
    expect(roundsCompletedBy(p, T0 + 400_000)).toBe(1)
  })

  it('counts every round at the end', () => {
    expect(roundsCompletedBy(p, endsAt(p))).toBe(6)
  })

  it('reports honestly for a session abandoned mid-round', () => {
    // Quit 30s into round 4: three rounds are done, the fourth is not.
    const quitAt = T0 + (300 + 120) * 3 * 1000 + 30_000
    expect(roundsCompletedBy(p, quitAt)).toBe(3)
  })
})

describe('mmss', () => {
  it('pads seconds', () => {
    expect(mmss(65)).toBe('1:05')
    expect(mmss(300)).toBe('5:00')
  })

  it('rounds up, so the display reads 5:00 for the whole first second', () => {
    expect(mmss(299.4)).toBe('5:00')
  })

  it('clamps at zero rather than showing a negative', () => {
    expect(mmss(-3)).toBe('0:00')
  })
})
