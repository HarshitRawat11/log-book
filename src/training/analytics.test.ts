import { describe, expect, it } from 'vitest'
import { bodyweightSeries, e1rmSeries, tonnageSeries, weeklyWorkingSets } from './analytics'
import type { Bodyweight, Exercise, WorkoutSet } from '../db/types'
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
  rir: null,
  is_warmup: false,
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
  equipment: 'barbell',
  target_rep_min: 8,
  target_rep_max: 12,
  load_increment_kg: 2.5,
  min_weight_kg: 20,
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

  it('omits sessions that were only warm-ups', () => {
    const workouts = [{ id: 'w1', date: '2026-09-01' }]
    const sets = [set({ workout_id: 'w1', is_warmup: true })]
    expect(tonnageSeries(workouts, sets)).toEqual([])
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
