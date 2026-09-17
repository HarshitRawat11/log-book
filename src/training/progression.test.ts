import { describe, expect, it } from 'vitest'
import {
  epley1RM,
  formatKg,
  repeatOf,
  suggestNext,
  type SessionPerformance,
} from './progression'
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
  load_is_assistance: false,
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
    expect(s.reason).toContain(`+${formatKg(2.5)}`)
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
    expect(repeatOf(inSession, undefined, false)).toEqual({ weight_kg: 60, reps: 9 })
  })

  it('falls back to last session top set for the first set of the day', () => {
    expect(repeatOf([], session('2026-09-11', [[60, 12]]), false)).toEqual({ weight_kg: 60, reps: 12 })
  })

  it('returns null with nothing to go on, so the UI shows an empty input', () => {
    expect(repeatOf([], undefined, false)).toBeNull()
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

/**
 * Pre-fill after a drop set.
 *
 * repeatOf took the highest set_index outright, so the row after a drop to
 * 20kg pre-filled at 20kg - the drop is a continuation, and the weight being
 * worked at was still 36. Every set following a drop would have needed
 * correcting by hand.
 */
describe('repeatOf with continuations', () => {
  const working = (w: number, r: number, idx: number): WorkoutSet => ({
    ...set(w, r, idx),
    set_type: 'normal',
  })
  const drop = (w: number, r: number, idx: number): WorkoutSet => ({
    ...set(w, r, idx),
    set_type: 'dropset',
  })

  it('repeats the working weight, not the drop hanging off it', () => {
    expect(repeatOf([working(36, 10, 0), drop(20, 8, 1)], undefined, false)).toEqual({
      weight_kg: 36,
      reps: 10,
    })
  })

  it('ignores a myorep mini-set the same way', () => {
    const mini = { ...set(36, 4, 1), set_type: 'myorep' as const }
    expect(repeatOf([working(36, 10, 0), mini], undefined, false)).toEqual({ weight_kg: 36, reps: 10 })
  })

  it('still takes the most recent working set when several exist', () => {
    expect(
      repeatOf([working(36, 10, 0), drop(20, 8, 1), working(36, 9, 2)], undefined, false),
    ).toEqual({ weight_kg: 36, reps: 9 })
  })

  it('ignores warm-ups too', () => {
    const warm = { ...set(20, 12, 0), is_warmup: true }
    expect(repeatOf([warm, working(36, 10, 1)], undefined, false)).toEqual({ weight_kg: 36, reps: 10 })
  })

  it('falls back to last session when this one has only continuations', () => {
    // Nothing working logged yet today, so there is nothing to repeat from it.
    const lastSession = { workout_id: 'w', date: '2026-09-10', sets: [working(40, 8, 0)] }
    expect(repeatOf([], lastSession, false)).toEqual({ weight_kg: 40, reps: 8 })
  })
})

/**
 * Assisted machines.
 *
 * The whole load axis runs backwards, and every one of these would pass just as
 * happily if the engine had got the direction wrong in only some branches -
 * which is exactly the bug worth guarding, because the symptom is a suggestion
 * that quietly makes the lift easier every week.
 */
describe('suggestNext on an assisted machine', () => {
  const assistedPullup: Exercise = {
    ...bench,
    name: 'Assisted pull-up',
    muscle_group: 'back',
    equipment: 'machine',
    target_rep_min: 6,
    target_rep_max: 10,
    load_increment_kg: 5,
    min_weight_kg: 0,
    load_is_assistance: true,
  }

  it('rule 2: TAKES weight off at the top of the range', () => {
    const s = suggestNext(assistedPullup, [session('2026-09-11', [[30, 10], [30, 10]])], NOW)!
    expect(s.weight_kg).toBe(25)
    expect(s.reps).toBe(6)
    expect(s.stalling).toBe(false)
    expect(s.reason).toContain('assistance')
  })

  it('treats the LIGHTEST set of a session as the top set', () => {
    // 25 was the hard one. Reading 30 as the top set would call a 10-rep set at
    // 25 "below range" and deload a lift that just progressed.
    const s = suggestNext(assistedPullup, [session('2026-09-11', [[30, 10], [25, 10]])], NOW)!
    expect(s.weight_kg).toBe(20)
  })

  it('never proposes less assistance than the stack offers', () => {
    const light: Exercise = { ...assistedPullup, min_weight_kg: 0, load_increment_kg: 5 }
    const s = suggestNext(light, [session('2026-09-11', [[3, 10]])], NOW)!
    expect(s.weight_kg).toBe(0) // not -2
  })

  it('says so rather than inventing a number once the help has run out', () => {
    const s = suggestNext(assistedPullup, [session('2026-09-11', [[0, 10]])], NOW)!
    expect(s.weight_kg).toBe(0)
    expect(s.reps).toBe(10) // hold at the top of the range, not reset to 6
    expect(s.reason).toContain('Nothing left to take off')
  })

  it('rule 3: adds a rep inside the range, same assistance', () => {
    const s = suggestNext(assistedPullup, [session('2026-09-11', [[30, 7]])], NOW)!
    expect(s.weight_kg).toBe(30)
    expect(s.reps).toBe(8)
    expect(s.reason).toContain('same assistance')
  })

  it('rule 4: deloads by ADDING assistance after two sessions below range', () => {
    const s = suggestNext(
      assistedPullup,
      [session('2026-09-11', [[30, 4]]), session('2026-09-08', [[30, 5]])],
      NOW,
    )!
    expect(s.weight_kg).toBe(35) // 30 x 1.1 = 33, rounded UP to the 5kg stack
    expect(s.stalling).toBe(true)
    expect(s.reason).toContain('add assistance back')
  })

  it('still has somewhere to go when 1.1x rounds back onto the same weight', () => {
    // Zero assistance is the case that breaks a pure multiplier: 0 x 1.1 is 0,
    // so a deload would have proposed no change and called it one.
    const s = suggestNext(
      assistedPullup,
      [session('2026-09-11', [[0, 4]]), session('2026-09-08', [[0, 5]])],
      NOW,
    )!
    expect(s.weight_kg).toBe(5)
    expect(s.stalling).toBe(true)
  })

  it('rule 5: repeats once before adding assistance back', () => {
    const s = suggestNext(assistedPullup, [session('2026-09-11', [[30, 4]])], NOW)!
    expect(s.weight_kg).toBe(30)
    expect(s.stalling).toBe(false)
    expect(s.reason).toContain('before adding assistance back')
  })

  it('pre-fills from the lightest working set, not the heaviest', () => {
    const last = session('2026-09-11', [[30, 8], [25, 6]])
    expect(repeatOf([], last, true)).toEqual({ weight_kg: 25, reps: 6 })
    // Same data read the normal way round gives the opposite answer, which is
    // the point: the flag is load-bearing, not decorative.
    expect(repeatOf([], last, false)).toEqual({ weight_kg: 30, reps: 8 })
  })
})

describe('formatKg', () => {
  it('puts a space between the number and the unit', () => {
    expect(formatKg(20)).toBe('20 kg')
    expect(formatKg(62.5)).toBe('62.5 kg')
  })

  /**
   * Non-breaking, deliberately. These land mid-sentence in suggestion text,
   * and "deload 60 kg to 55 kg" breaking after the 60 on a 390px screen reads
   * as a typo rather than as wrapping.
   */
  it('uses a non-breaking space, so a weight never wraps away from its unit', () => {
    expect(formatKg(20)).not.toContain(' ')
  })

  it('drops floating-point dust', () => {
    expect(formatKg(52.500000000000004)).toBe('52.5 kg')
  })
})
