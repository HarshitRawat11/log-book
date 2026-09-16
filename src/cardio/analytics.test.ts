import { describe, expect, it } from 'vitest'
import { weeklyCardio, workMinutesOf } from './analytics'
import type { CardioSession } from '../db/types'

const session = (over: Partial<CardioSession>): CardioSession => ({
  id: crypto.randomUUID(),
  user_id: 'u',
  updated_at: '',
  deleted_at: null,
  date: '2026-09-14',
  started_at: '2026-09-14T18:00:00.000Z',
  ended_at: '2026-09-14T18:40:00.000Z',
  activity: 'kickboxing',
  preset_name: 'Kickboxing',
  work_seconds: 300,
  break_seconds: 120,
  rounds_planned: 6,
  rounds_completed: 6,
  completed: true,
  notes: null,
  rpe: null,
  ...over,
})

describe('workMinutesOf', () => {
  it('counts work only, never the breaks', () => {
    // 6 x 5min work = 30, despite the session occupying 40 minutes of clock.
    expect(workMinutesOf(session({}))).toBe(30)
  })

  it('counts what was done, not what was planned', () => {
    expect(workMinutesOf(session({ rounds_completed: 3 }))).toBe(15)
  })

  it('is zero for a session abandoned before the first round ended', () => {
    expect(workMinutesOf(session({ rounds_completed: 0 }))).toBe(0)
  })
})

describe('weeklyCardio', () => {
  it('sums sessions and work-minutes into their ISO week', () => {
    const rows = weeklyCardio([
      session({ date: '2026-09-14' }),
      session({ date: '2026-09-16', rounds_completed: 4 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessions: 2, workMinutes: 50 }) // 30 + 20
  })

  it('separates weeks', () => {
    const rows = weeklyCardio([session({ date: '2026-09-07' }), session({ date: '2026-09-14' })])
    expect(rows.map((r) => r.sessions)).toEqual([1, 1])
    expect(rows[0]!.week < rows[1]!.week).toBe(true)
  })

  it('ignores a session still in progress', () => {
    // No ended_at: counting it would make the week jump the moment it started.
    const rows = weeklyCardio([session({ ended_at: null }), session({})])
    expect(rows[0]).toMatchObject({ sessions: 1, workMinutes: 30 })
  })

  it('ignores tombstoned rows', () => {
    const rows = weeklyCardio([session({ deleted_at: '2026-09-15T00:00:00Z' })])
    expect(rows).toEqual([])
  })

  it('counts a session ended early, honestly', () => {
    const rows = weeklyCardio([session({ rounds_completed: 2, completed: false })])
    expect(rows[0]).toMatchObject({ sessions: 1, workMinutes: 10 })
  })

  it('keeps only the most recent N weeks', () => {
    const many = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'].map((date) =>
      session({ date }),
    )
    expect(weeklyCardio(many, 2)).toHaveLength(2)
  })

  it('returns nothing for no sessions', () => {
    expect(weeklyCardio([])).toEqual([])
  })
})
