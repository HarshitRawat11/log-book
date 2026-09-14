import { isWorkingSet, type Bodyweight, type Exercise, type WorkoutSet } from '../db/types'
import { isoWeek } from '../lib/dates'
import { epley1RM } from './progression'
import type { SessionPerformance } from './progression'

/**
 * Analytics. Pure functions over already-loaded rows, so they are testable
 * without a database and cheap to re-run on every render.
 *
 * Formulas are exactly the three the brief specifies (7.3) and no others.
 */

export type Point = { date: string; value: number }

/**
 * Best estimated 1RM per session, for one exercise.
 *
 * Takes the BEST set of each session rather than the top-weight set: a heavy
 * single and a lighter set of ten can imply very different maxima, and the
 * higher estimate is the one that reflects what you were actually capable of
 * that day.
 *
 * Epley degrades materially above ~10-12 reps, which is why the UI labels this
 * an estimate and says so in a tooltip.
 */
export function e1rmSeries(sessions: SessionPerformance[]): Point[] {
  return sessions
    .map((s) => ({
      date: s.date,
      value: Math.max(...s.sets.map((set) => epley1RM(set.weight_kg, set.reps))),
    }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ ...p, value: Math.round(p.value * 10) / 10 }))
}

/**
 * Session tonnage: sum of weight x reps across every non-warm-up set.
 *
 * Drops and myorep mini-sets are included here even though they do not count
 * as separate sets elsewhere - the reps happened, so the volume is real.
 */
export function tonnageSeries(
  workouts: Array<{ id: string; date: string }>,
  sets: WorkoutSet[],
): Point[] {
  const byWorkout = new Map<string, number>()
  for (const s of sets) {
    if (s.is_warmup) continue
    byWorkout.set(s.workout_id, (byWorkout.get(s.workout_id) ?? 0) + s.weight_kg * s.reps)
  }
  return workouts
    .map((w) => ({ date: w.date, value: Math.round(byWorkout.get(w.id) ?? 0) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export type WeeklySets = { week: string; total: number } & Record<string, string | number>

/**
 * Working sets per muscle group, per ISO week.
 *
 * The brief calls these "hard sets" but defines them as any non-warm-up set.
 * In the literature a hard set means one taken near failure; RIR is optional
 * here so that cannot be filtered on reliably. The UI says "working sets" to
 * avoid claiming precision the data does not have.
 *
 * Each exercise counts towards ONE muscle group, so compound lifts undercount
 * their secondary movers - bench adds nothing to triceps. Known limitation,
 * accepted at the Phase 0 gate.
 *
 * Counts working sets, so a top set with three drops hanging off it adds one
 * to the bar and not four. Counting the drops separately would show a volume
 * spike on a week the training did not actually change.
 */
export function weeklyWorkingSets(
  workouts: Array<{ id: string; date: string }>,
  sets: WorkoutSet[],
  exercises: Exercise[],
  weeks = 12,
): WeeklySets[] {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]))
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscle_group as string]))

  const byWeek = new Map<string, Map<string, number>>()
  for (const s of sets) {
    if (!isWorkingSet(s)) continue
    const date = dateOf.get(s.workout_id)
    const group = groupOf.get(s.exercise_id)
    if (!date || !group) continue
    const wk = isoWeek(date)
    const inner = byWeek.get(wk) ?? new Map<string, number>()
    inner.set(group, (inner.get(group) ?? 0) + 1)
    byWeek.set(wk, inner)
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-weeks)
    .map(([week, groups]) => {
      const row: WeeklySets = { week, total: 0 }
      for (const [g, n] of groups) {
        row[g] = n
        row.total += n
      }
      return row
    })
}

export type BodyweightPoint = { date: string; value: number; ma7: number | null }

/**
 * Bodyweight with a 7-day moving average.
 *
 * The average is what you read; the daily points swing several hundred grams on
 * water and food alone. It is computed over a 7-DAY WINDOW rather than the last
 * 7 readings, so a gap in weighing widens the window rather than silently
 * averaging across three weeks.
 */
export function bodyweightSeries(rows: Bodyweight[]): BodyweightPoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

  return sorted.map((row, i) => {
    const end = new Date(`${row.date}T00:00:00`)
    const start = new Date(end)
    start.setDate(start.getDate() - 6)

    const window = sorted
      .slice(0, i + 1)
      .filter((r) => new Date(`${r.date}T00:00:00`) >= start)

    return {
      date: row.date,
      value: row.weight_kg,
      // One reading is not an average, and drawing it as one implies a trend
      // that does not exist yet.
      ma7:
        window.length >= 2
          ? Math.round((window.reduce((t, r) => t + r.weight_kg, 0) / window.length) * 100) / 100
          : null,
    }
  })
}
