import { describe, expect, it } from 'vitest'
import {
  assistanceSeries,
  bodyweightSeries,
  e1rmSeries,
  tonnageSeries,
  weeklyWorkingSets,
} from './analytics'
import {
  isWorkingSet,
  sessionSeconds,
  type Bodyweight,
  type Exercise,
  type WorkoutSet,
} from '../db/types'
import type { SessionPerformance } from './progression'

const set = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: crypto.randomUUID(),
  user_id: 'u',
  updated_at: '',
  deleted_at: null,
  workout_id: 'w1',
  exercise_id: 'e1',
  set_index: 0,
  weight_kg: 60,
  reps: 10,
  is_warmup: false,
  set_type: 'normal',
  source: 'app',
  import_batch_id: null,
  ...over,
})

const exercise = (over: Partial<Exercise>): Exercise => ({
  id: 'e1',
  user_id: 'u',
  updated_at: '',
  deleted_at: null,
  name: 'Bench press',
  muscle_group: 'chest',
  load_is_assistance: false,
  equipment: 'barbell',
  target_rep_min: 8,
  target_rep_max: 12,
  load_increment_kg: 2.5,
  min_weight_kg: 20,
  machine_setup: null,
  archived: false,
  ...over,
})

const session = (date: string, sets: Array<[number, number]>): SessionPerformance => ({
  workout_id: `w-${date}`,
  date,
  sets: sets.map(([w, r], i) => set({ weight_kg: w, reps: r, set_index: i })),
})

describe('e1rmSeries', () => {
  it('uses the BEST set of each session, not the heaviest', () => {
    // 60x10 -> 80.0 ; 80x3 -> 88.0. The heavy triple is the better estimate.
    const [p] = e1rmSeries([session('2026-09-01', [[60, 10], [80, 3]])])
    expect(p!.value).toBeCloseTo(88, 1)
  })

  it('is ordered oldest first, for a left-to-right chart', () => {
    const pts = e1rmSeries([
      session('2026-09-10', [[70, 5]]),
      session('2026-09-01', [[60, 5]]),
      session('2026-09-05', [[65, 5]]),
    ])
    expect(pts.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-05', '2026-09-10'])
  })

  it('drops sessions with no usable sets rather than plotting zero', () => {
    expect(e1rmSeries([{ workout_id: 'w', date: '2026-09-01', sets: [] }])).toEqual([])
  })
})

describe('tonnageSeries', () => {
  it('sums weight x reps and excludes warm-ups', () => {
    const workouts = [{ id: 'w1', date: '2026-09-01' }]
    const sets = [
      set({ workout_id: 'w1', weight_kg: 60, reps: 10 }), // 600
      set({ workout_id: 'w1', weight_kg: 60, reps: 10 }), // 600
      set({ workout_id: 'w1', weight_kg: 20, reps: 10, is_warmup: true }), // excluded
    ]
    expect(tonnageSeries(workouts, sets)).toEqual([{ date: '2026-09-01', value: 1200 }])
  })

  it('includes myorep matches, which are whole sets', () => {
    const workouts = [{ id: 'w1', date: '2026-09-01' }]
    const sets = [
      set({ workout_id: 'w1', weight_kg: 15, reps: 8 }),
      set({ workout_id: 'w1', weight_kg: 15, reps: 8, set_type: 'myorep_match' }),
      set({ workout_id: 'w1', weight_kg: 15, reps: 8, set_type: 'myorep_match' }),
    ]
    expect(tonnageSeries(workouts, sets)).toEqual([{ date: '2026-09-01', value: 360 }])
  })

  it('omits sessions that were only warm-ups', () => {
    const workouts = [{ id: 'w1', date: '2026-09-01' }]
    const sets = [set({ workout_id: 'w1', is_warmup: true })]
    expect(tonnageSeries(workouts, sets)).toEqual([])
  })

  /**
   * An assisted machine's weight is what the stack contributed. Counting it
   * would credit you with work you did not do - and credit you MORE on the
   * sessions where you needed the most help, so the chart would rise as the
   * training went backwards.
   */
  it('leaves assisted machines out entirely', () => {
    const workouts = [{ id: 'w1', date: '2026-09-01' }]
    const sets = [
      set({ workout_id: 'w1', exercise_id: 'bench', weight_kg: 60, reps: 10 }), // 600
      set({ workout_id: 'w1', exercise_id: 'assisted', weight_kg: 30, reps: 10 }),
    ]
    expect(tonnageSeries(workouts, sets, new Set(['assisted']))).toEqual([
      { date: '2026-09-01', value: 600 },
    ])
  })

  it('omits a session that was nothing but assisted work, rather than plotting zero', () => {
    const workouts = [{ id: 'w1', date: '2026-09-01' }]
    const sets = [set({ workout_id: 'w1', exercise_id: 'assisted', weight_kg: 30, reps: 10 })]
    expect(tonnageSeries(workouts, sets, new Set(['assisted']))).toEqual([])
  })
})

/**
 * The assisted machine's replacement for the 1RM chart.
 *
 * Deliberately formula-free. Epley on an assisted pull-up would need bodyweight
 * minus the stack; fed the stack alone it produces a line that RISES as you get
 * weaker, which is the one shape a progress chart must never have.
 */
describe('assistanceSeries', () => {
  it('plots the least assistance used in each session', () => {
    const series = assistanceSeries([
      { workout_id: 'w1', date: '2026-09-01', sets: [set({ weight_kg: 30 }), set({ weight_kg: 25 })] },
      { workout_id: 'w2', date: '2026-09-08', sets: [set({ weight_kg: 20 })] },
    ])
    expect(series).toEqual([
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-08', value: 20 },
    ])
  })

  it('keeps a zero, because no assistance at all is the goal and not missing data', () => {
    const series = assistanceSeries([
      { workout_id: 'w1', date: '2026-09-01', sets: [set({ weight_kg: 0 })] },
    ])
    expect(series).toEqual([{ date: '2026-09-01', value: 0 }])
  })

  it('drops sessions with no sets rather than plotting Infinity', () => {
    expect(assistanceSeries([{ workout_id: 'w', date: '2026-09-01', sets: [] }])).toEqual([])
  })

  it('sorts oldest first, whatever order the sessions arrive in', () => {
    const series = assistanceSeries([
      { workout_id: 'w2', date: '2026-09-08', sets: [set({ weight_kg: 20 })] },
      { workout_id: 'w1', date: '2026-09-01', sets: [set({ weight_kg: 25 })] },
    ])
    expect(series.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-08'])
  })
})

describe('weeklyWorkingSets', () => {
  it('groups by ISO week and muscle group, excluding warm-ups', () => {
    // 7 and 9 Sept 2026 are Mon and Wed of the same ISO week.
    const workouts = [
      { id: 'w1', date: '2026-09-07' },
      { id: 'w2', date: '2026-09-09' },
    ]
    const exercises = [exercise({ id: 'e1' }), exercise({ id: 'e2', muscle_group: 'back' })]
    const sets = [
      set({ workout_id: 'w1', exercise_id: 'e1' }),
      set({ workout_id: 'w1', exercise_id: 'e1' }),
      set({ workout_id: 'w2', exercise_id: 'e2' }),
      set({ workout_id: 'w2', exercise_id: 'e1', is_warmup: true }),
    ]
    const rows = weeklyWorkingSets(workouts, sets, exercises)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.chest).toBe(2)
    expect(rows[0]!.back).toBe(1)
    expect(rows[0]!.total).toBe(3)
  })

  it('splits across ISO week boundaries', () => {
    // 13 Sept 2026 is a Sunday; 14 Sept is the Monday of the next ISO week.
    const workouts = [
      { id: 'w1', date: '2026-09-13' },
      { id: 'w2', date: '2026-09-14' },
    ]
    const exercises = [exercise({ id: 'e1' })]
    const sets = [set({ workout_id: 'w1' }), set({ workout_id: 'w2' })]
    expect(weeklyWorkingSets(workouts, sets, exercises)).toHaveLength(2)
  })
})

const bw = (date: string, kg: number): Bodyweight => ({
  id: crypto.randomUUID(),
  user_id: 'u',
  updated_at: '',
  deleted_at: null,
  date,
  weight_kg: kg,
})

describe('bodyweightSeries', () => {
  it('averages over a 7-DAY window, not the last 7 readings', () => {
    // Two readings 30 days apart must not be averaged together - that would
    // imply a trend across a month-long gap.
    const pts = bodyweightSeries([bw('2026-08-01', 80), bw('2026-09-01', 78)])
    expect(pts[1]!.ma7).toBeNull()
  })

  it('averages readings that do fall inside the window', () => {
    const pts = bodyweightSeries([
      bw('2026-09-10', 80),
      bw('2026-09-11', 81),
      bw('2026-09-12', 79),
    ])
    expect(pts[2]!.ma7).toBeCloseTo(80, 2)
  })

  it('shows no average for a single reading', () => {
    expect(bodyweightSeries([bw('2026-09-10', 80)])[0]!.ma7).toBeNull()
  })

  it('sorts oldest first regardless of input order', () => {
    const pts = bodyweightSeries([bw('2026-09-12', 79), bw('2026-09-10', 80)])
    expect(pts.map((p) => p.date)).toEqual(['2026-09-10', '2026-09-12'])
  })
})

/**
 * Set types.
 *
 * A drop or a myorep mini-set is a CONTINUATION of the set before it, not a set
 * of its own. That distinction is the whole point of the column, and it pulls
 * in two directions at once - out of set counts, but into tonnage - so both
 * directions are pinned here.
 */
describe('isWorkingSet', () => {
  it('counts a plain working set', () => {
    expect(isWorkingSet(set({}))).toBe(true)
  })

  it('does not count a warm-up', () => {
    expect(isWorkingSet(set({ is_warmup: true }))).toBe(false)
  })

  it('does not count a drop or a myorep', () => {
    expect(isWorkingSet(set({ set_type: 'dropset' }))).toBe(false)
    expect(isWorkingSet(set({ set_type: 'myorep' }))).toBe(false)
  })

  /**
   * The distinction the two names hide. A myorep is a mini-set hanging off the
   * activation set; a myorep MATCH is a whole set at the same weight taken to
   * the same rep count. Three matched sets of 15kg x 8 is three working sets,
   * and counting it beside `myorep` would report it as one and quietly lose two
   * thirds of the week's volume for that lift.
   */
  it('DOES count a myorep match, unlike a myorep', () => {
    expect(isWorkingSet(set({ set_type: 'myorep_match' }))).toBe(true)
  })

  it('still refuses a warm-up whatever type it carries', () => {
    expect(isWorkingSet(set({ is_warmup: true, set_type: 'myorep_match' }))).toBe(false)
  })

  it('treats a row written before the column existed as a working set', () => {
    // Local rows created before the migration have no set_type at all. They
    // were working sets when they were logged and must stay that way, or every
    // historical weekly count silently drops to zero.
    const legacy = set({})
    delete (legacy as Partial<WorkoutSet>).set_type
    expect(isWorkingSet(legacy)).toBe(true)
  })
})

describe('weeklyWorkingSets with continuations', () => {
  const workouts = [{ id: 'w1', date: '2026-09-14' }]
  const chest = [exercise({ id: 'e1', muscle_group: 'chest' })]

  it('counts a top set with three drops as one set, not four', () => {
    const sets = [
      set({ weight_kg: 40, reps: 10, set_index: 0 }),
      set({ weight_kg: 30, reps: 6, set_index: 1, set_type: 'dropset' }),
      set({ weight_kg: 20, reps: 6, set_index: 2, set_type: 'dropset' }),
      set({ weight_kg: 10, reps: 8, set_index: 3, set_type: 'dropset' }),
    ]
    const rows = weeklyWorkingSets(workouts, sets, chest)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.chest).toBe(1)
    expect(rows[0]!.total).toBe(1)
  })

  it('counts myorep mini-sets the same way', () => {
    const sets = [
      set({ set_index: 0 }),
      set({ set_index: 1, set_type: 'myorep' }),
      set({ set_index: 2, set_type: 'myorep' }),
    ]
    expect(weeklyWorkingSets(workouts, sets, chest)[0]!.chest).toBe(1)
  })

  it('still counts genuinely separate working sets separately', () => {
    const sets = [set({ set_index: 0 }), set({ set_index: 1 }), set({ set_index: 2 })]
    expect(weeklyWorkingSets(workouts, sets, chest)[0]!.chest).toBe(3)
  })
})

describe('tonnageSeries with continuations', () => {
  const workouts = [{ id: 'w1', date: '2026-09-14' }]

  it('includes drops, because the reps were actually performed', () => {
    const sets = [
      set({ weight_kg: 40, reps: 10, set_index: 0 }), // 400
      set({ weight_kg: 30, reps: 6, set_index: 1, set_type: 'dropset' }), // 180
      set({ weight_kg: 20, reps: 5, set_index: 2, set_type: 'dropset' }), // 100
    ]
    expect(tonnageSeries(workouts, sets)[0]!.value).toBe(680)
  })

  it('still excludes warm-ups', () => {
    const sets = [
      set({ weight_kg: 40, reps: 10, set_index: 0 }), // 400
      set({ weight_kg: 20, reps: 10, set_index: 1, is_warmup: true }), // excluded
    ]
    expect(tonnageSeries(workouts, sets)[0]!.value).toBe(400)
  })
})

/**
 * Session duration.
 *
 * `finished_at` existed from the initial schema and nothing ever wrote to it,
 * so every session in the database claimed to still be running. Now that
 * "Finish session" sets it, the arithmetic is worth pinning - particularly the
 * guards, because a negative or nonsense duration renders as text rather than
 * as an error and would simply look wrong forever.
 */
describe('sessionSeconds', () => {
  const at = (h: number, m = 0) => `2026-09-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`

  it('measures start to finish', () => {
    expect(sessionSeconds({ started_at: at(17), finished_at: at(18, 12) })).toBe(72 * 60)
  })

  it('is null while the session is still open', () => {
    expect(sessionSeconds({ started_at: at(17), finished_at: null })).toBeNull()
  })

  it('is null when there is no start to measure from', () => {
    expect(sessionSeconds({ started_at: null, finished_at: at(18) })).toBeNull()
  })

  /**
   * A clock change, or a row edited by hand. Returning a negative number would
   * render as "-38 min" and look like a bug in the duration rather than in the
   * data; null renders as nothing at all, which is honest.
   */
  it('refuses a finish that lands before its start', () => {
    expect(sessionSeconds({ started_at: at(18), finished_at: at(17) })).toBeNull()
    expect(sessionSeconds({ started_at: at(18), finished_at: at(18) })).toBeNull()
  })

  it('refuses an unparseable timestamp rather than returning NaN', () => {
    expect(sessionSeconds({ started_at: 'not a date', finished_at: at(18) })).toBeNull()
  })
})
