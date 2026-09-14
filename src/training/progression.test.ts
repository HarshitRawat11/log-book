import { describe, expect, it } from 'vitest'
import { epley1RM, repeatOf, suggestNext, type SessionPerformance } from './progression'
import type { Exercise, WorkoutSet } from '../db/types'

/**
 * These tests exist because this file decides what weight goes on the bar.
 * Every branch of the rule set in the brief (7.2) is pinned here, including the
 * two that only show up with imported history: stale basis dates, and the
 * layoff-versus-stall distinction.
 */

const NOW = new Date(2026, 8, 13) // 13 Sep 2026, local

const bench: Exercise = {
  id: 'e1',
  user_id: 'u1',
  updated_at: '',
  deleted_at: null,
  name: 'Bench press',
  muscle_group: 'chest',
  equipment: 'barbell',
  target_rep_min: 8,
  target_rep_max: 12,
  load_increment_kg: 2.5,
  min_weight_kg: 20,
  machine_setup: null,
  archived: false,
}

let n = 0
function set(weight: number, reps: number, idx = n++): WorkoutSet {
  return {
    id: `s${idx}-${weight}-${reps}`,
    user_id: 'u1',
    updated_at: '',
    deleted_at: null,
    workout_id: 'w',
    exercise_id: 'e1',
    set_index: idx,
    weight_kg: weight,
    reps,
    rir: null,
    is_warmup: false,
    set_type: 'normal',
    source: 'app',
    import_batch_id: null,
  }
}

function session(date: string, sets: [number, number][]): SessionPerformance {
  return {
    workout_id: `w-${date}`,
    date,
    sets: sets.map(([w, r], i) => set(w, r, i)),
  }
}

describe('suggestNext', () => {
  it('rule 1: gives no suggestion without history, rather than a guess', () => {
    expect(suggestNext(bench, [], NOW)).toBeNull()
  })

  it('rule 2: adds the increment when every top set hit max', () => {
    const s = suggestNext(bench, [session('2026-09-11', [[60, 12], [60, 12], [60, 12]])], NOW)!
    expect(s.weight_kg).toBe(62.5)
    expect(s.reps).toBe(8)
    expect(s.stalling).toBe(false)
    expect(s.reason).toContain('top of range')
    expect(s.reason).toContain('+2.5kg')
  })

  it('rule 3: adds one rep to the earliest set below max, same weight', () => {
    const s = suggestNext(bench, [session('2026-09-11', [[60, 12], [60, 10], [60, 10]])], NOW)!
    expect(s.weight_kg).toBe(60)
    expect(s.reps).toBe(11) // set 2 was 10, so 11
    expect(s.reason).toContain('set 2')
    expect(s.reason).toContain('in range')
  })

  it('rule 5: repeats the weight after ONE session below range, no deload', () => {
    const s = suggestNext(bench, [session('2026-09-11', [[60, 7], [60, 7], [60, 6]])], NOW)!
    expect(s.weight_kg).toBe(60)
    expect(s.reps).toBe(8)
    expect(s.stalling).toBe(false)
    expect(s.reason).toContain('Repeat')
  })

  it('rule 4: deloads after two consecutive sessions below range', () => {
    const s = suggestNext(
      bench,
      [session('2026-09-11', [[60, 7]]), session('2026-09-08', [[60, 7]])],
      NOW,
    )!
    expect(s.stalling).toBe(true)
    // 60 * 0.9 = 54, floored to a multiple of 2.5 = 52.5
    expect(s.weight_kg).toBe(52.5)
    expect(s.reps).toBe(8)
    expect(s.reason).toContain('deload')
  })

  it('rule 4: does NOT deload across a layoff - that is a comeback, not a stall', () => {
    const s = suggestNext(
      bench,
      // 40 days apart: both below range, but not consecutive in any real sense
      [session('2026-09-11', [[60, 7]]), session('2026-08-02', [[60, 7]])],
      NOW,
    )!
    expect(s.stalling).toBe(false)
    expect(s.weight_kg).toBe(60)
    expect(s.reason).toContain('layoff')
  })

  it('never suggests a weight below the exercise floor', () => {
    // Empty bar already; 20 * 0.9 = 18, which is not loadable.
    const s = suggestNext(
      bench,
      [session('2026-09-11', [[20, 5]]), session('2026-09-09', [[20, 5]])],
      NOW,
    )!
    expect(s.weight_kg).toBe(20)
    expect(s.stalling).toBe(true)
    expect(s.reason).toContain('lightest')
  })

  it('reasons from the TOP weight when a session ramps', () => {
    const s = suggestNext(bench, [session('2026-09-11', [[50, 12], [60, 12], [60, 12]])], NOW)!
    // top sets are the two at 60, both at max -> add load to 60, not 50
    expect(s.weight_kg).toBe(62.5)
  })

  it('states the date AND the age of the session it reasoned from', () => {
    const s = suggestNext(bench, [session('2026-08-16', [[60, 12], [60, 12]])], NOW)!
    expect(s.basis.date).toBe('2026-08-16')
    expect(s.reason).toContain('16 Aug')
    expect(s.reason).toContain('4 weeks ago')
  })

  it('every branch produces a non-empty reason', () => {
    const cases: SessionPerformance[][] = [
      [session('2026-09-11', [[60, 12]])],
      [session('2026-09-11', [[60, 10]])],
      [session('2026-09-11', [[60, 5]])],
      [session('2026-09-11', [[60, 5]]), session('2026-09-09', [[60, 5]])],
      [session('2026-09-11', [[60, 5]]), session('2026-06-01', [[60, 5]])],
    ]
    for (const history of cases) {
      const s = suggestNext(bench, history, NOW)
      expect(s).not.toBeNull()
      expect(s!.reason.length).toBeGreaterThan(20)
    }
  })

  it('handles bodyweight movements, where load is legitimately zero', () => {
    const bw: Exercise = { ...bench, equipment: 'bodyweight', min_weight_kg: 0, load_increment_kg: 0 }
    const s = suggestNext(bw, [session('2026-09-11', [[0, 10]])], NOW)!
    expect(s.weight_kg).toBe(0)
    expect(s.reason).toContain('bodyweight')
  })
})

describe('repeatOf', () => {
  it('repeats the previous set within the same session', () => {
    const inSession = [set(60, 10, 0), set(60, 9, 1)]
    expect(repeatOf(inSession, undefined)).toEqual({ weight_kg: 60, reps: 9 })
  })

  it('falls back to last session top set for the first set of the day', () => {
    expect(repeatOf([], session('2026-09-11', [[60, 12]]))).toEqual({ weight_kg: 60, reps: 12 })
  })

  it('returns null with nothing to go on, so the UI shows an empty input', () => {
    expect(repeatOf([], undefined)).toBeNull()
  })
})

describe('epley1RM', () => {
  it('matches the published formula', () => {
    // Epley: 1RM = w * (1 + r/30). 100kg x 10 -> 133.3kg
    expect(epley1RM(100, 10)).toBeCloseTo(133.33, 2)
  })

  it('returns the weight itself for a single, not an inflated estimate', () => {
    expect(epley1RM(100, 1)).toBe(100)
  })
})
