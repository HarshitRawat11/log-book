import { db } from '../db/db'
import { isWorkingSet, setTypeOf, SYNC_TABLES } from '../db/types'
import { todayIso } from './dates'

/**
 * Data export.
 *
 * "I can export all my data to a file without asking you to write a script"
 * is an acceptance criterion (brief 10), so this exports EVERYTHING - every
 * synced table, tombstones included - not a curated subset.
 *
 * It reads the local store rather than the server, which means it also works
 * offline and captures rows that have not synced yet.
 */

function download(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function exportJson(): Promise<void> {
  const data: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) data[t] = await db.table(t).toArray()

  download(
    `log-book-${todayIso()}.json`,
    'application/json',
    JSON.stringify({ exported_at: new Date().toISOString(), schema: 1, data }, null, 2),
  )
}

/** RFC 4180: quote everything, double any embedded quotes. */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v: unknown) =>
    v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

/**
 * Training sets, flattened with their workout date and exercise name.
 *
 * A raw `sets` dump is useless in a spreadsheet - every row would be three
 * UUIDs and a number. This is the shape you would actually pivot.
 */
export async function exportSetsCsv(): Promise<void> {
  const [sets, workouts, exercises] = await Promise.all([
    db.sets.toArray(),
    db.workouts.toArray(),
    db.exercises.toArray(),
  ])
  const workoutById = new Map(workouts.map((w) => [w.id, w]))
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))

  const rows = sets
    .filter((s) => !s.deleted_at)
    .map((s) => {
      const w = workoutById.get(s.workout_id)
      const e = exerciseById.get(s.exercise_id)
      return {
        date: w?.date ?? '',
        exercise: e?.name ?? '',
        muscle_group: e?.muscle_group ?? '',
        machine_setup: e?.machine_setup ?? '',
        set_index: s.set_index + 1,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rir: s.rir,
        is_warmup: s.is_warmup,
        // normal | dropset | myorep. A drop or myorep row is a continuation of
        // the set above it, so counting rows here overstates the set count -
        // filter to `normal` to reproduce what the app reports.
        set_type: setTypeOf(s),
        counts_as_working_set: isWorkingSet(s),
        volume_kg: Math.round(s.weight_kg * s.reps * 100) / 100,
        source: s.source,
        session_note: w?.notes ?? '',
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.exercise.localeCompare(b.exercise))

  download(`log-book-sets-${todayIso()}.csv`, 'text/csv', toCsv(rows))
}

/** Food log, using the SNAPSHOT columns - what you actually logged. */
export async function exportFoodCsv(): Promise<void> {
  const rows = (await db.food_log.toArray())
    .filter((e) => !e.deleted_at)
    .map((e) => ({
      date: e.date,
      meal: e.meal_slot,
      item: e.name_snapshot,
      grams: e.grams,
      kcal: e.kcal,
      protein_g: e.protein_g,
      carbs_g: e.carbs_g,
      fat_g: e.fat_g,
      fibre_g: e.fibre_g,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.meal.localeCompare(b.meal))

  download(`log-book-food-${todayIso()}.csv`, 'text/csv', toCsv(rows))
}

export async function exportBodyweightCsv(): Promise<void> {
  const rows = (await db.bodyweight.toArray())
    .filter((r) => !r.deleted_at)
    .map((r) => ({ date: r.date, weight_kg: r.weight_kg }))
    .sort((a, b) => a.date.localeCompare(b.date))

  download(`log-book-bodyweight-${todayIso()}.csv`, 'text/csv', toCsv(rows))
}

/** Cardio sessions, with the configuration each one actually ran. */
export async function exportCardioCsv(): Promise<void> {
  const rows = (await db.cardio_sessions.toArray())
    .filter((s) => !s.deleted_at)
    .map((s) => ({
      date: s.date,
      activity: s.activity,
      preset: s.preset_name ?? '',
      started_at: s.started_at,
      ended_at: s.ended_at ?? '',
      work_seconds: s.work_seconds,
      break_seconds: s.break_seconds,
      rounds_planned: s.rounds_planned,
      rounds_completed: s.rounds_completed,
      // Work only. The session occupies longer than this on the clock, and
      // counting the breaks would flatter every total.
      work_minutes: Math.round((s.rounds_completed * s.work_seconds) / 60),
      completed: s.completed,
      rpe: s.rpe ?? '',
      notes: s.notes ?? '',
    }))
    .sort((a, b) => a.started_at.localeCompare(b.started_at))

  download(`log-book-cardio-${todayIso()}.csv`, 'text/csv', toCsv(rows))
}
