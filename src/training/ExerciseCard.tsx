import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Exercise, WorkoutSet } from '../db/types'
import { deleteRow, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { NumberField } from '../components/NumberField'
import { formatKg, repeatOf, suggestNext } from './progression'
import { nextSetIndex, recentSessions } from './queries'
import { relativeAge, shortDate } from '../lib/dates'

/**
 * One exercise inside today's session.
 *
 * No modals anywhere in this flow (brief 7.1). Editing a set happens in place,
 * because the alternative is a dialog you have to dismiss while holding a
 * dumbbell.
 */
export function ExerciseCard({
  exercise,
  workoutId,
  sets,
  onRemove,
  showSuggestion = true,
}: {
  exercise: Exercise
  workoutId: string
  sets: WorkoutSet[]
  onRemove: () => void
  /**
   * Off when reviewing a past session. "Next time do 62.5kg" is noise when you
   * have opened a session from nine days ago to correct a typo, and worse than
   * noise if it gets read as advice about that day.
   */
  showSuggestion?: boolean
}) {
  const mine = useMemo(
    () => sets.filter((s) => s.exercise_id === exercise.id).sort((a, b) => a.set_index - b.set_index),
    [sets, exercise.id],
  )

  const history = useLiveQuery(
    () => recentSessions(exercise.id, { limit: 5, excludeWorkoutId: workoutId }),
    [exercise.id, workoutId],
    [],
  )

  const suggestion = useMemo(
    () => (showSuggestion && history && history.length ? suggestNext(exercise, history) : null),
    [exercise, history, showSuggestion],
  )
  const lastSession = history?.[0]

  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [warmup, setWarmup] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [showWhy, setShowWhy] = useState(false)

  // Pre-fill with a REPEAT of what was actually done - the previous set in this
  // session, else last session's top set. This is a record of fact, not advice,
  // which is what lets "log a set" be one tap. The progression suggestion stays
  // opt-in and pre-fills nothing until tapped (brief 7.2).
  useEffect(() => {
    const r = repeatOf(mine, lastSession)
    setWeight(r ? String(r.weight_kg) : '')
    setReps(r ? String(r.reps) : '')
  }, [mine, lastSession])

  const canLog = weight !== '' && reps !== '' && Number(reps) > 0

  async function logSet() {
    if (!canLog) return
    await putRow(
      'sets',
      newRow({
        workout_id: workoutId,
        exercise_id: exercise.id,
        set_index: nextSetIndex(sets, exercise.id),
        weight_kg: Number(weight),
        reps: Number(reps),
        rir: null,
        is_warmup: warmup,
        source: 'app' as const,
        import_batch_id: null,
      }),
    )
    scheduleFlush()
  }

  async function updateSet(id: string, patch: Partial<WorkoutSet>) {
    await patchRow<WorkoutSet>('sets', id, patch)
    scheduleFlush()
  }

  async function removeSet(id: string) {
    await deleteRow('sets', id)
    scheduleFlush()
  }

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{exercise.name}</h2>
          <p className="mt-0.5 text-xs text-text-dim">
            {exercise.target_rep_min}–{exercise.target_rep_max} reps
            {lastSession ? (
              <>
                {' · last '}
                {shortDate(lastSession.date)} ({relativeAge(lastSession.date)}){': '}
                <span className="tabular text-text">
                  {lastSession.sets.map((s) => s.reps).join('/')} @{' '}
                  {formatKg(Math.max(...lastSession.sets.map((s) => s.weight_kg)))}
                </span>
              </>
            ) : (
              ' · no history yet'
            )}
          </p>
        </div>
        <button
          onClick={onRemove}
          aria-label={`Remove ${exercise.name} from this session`}
          className="-mr-1 -mt-1 size-11 shrink-0 text-lg text-text-dim"
        >
          ×
        </button>
      </header>

      {/* Progression suggestion. Pre-fills nothing until tapped. */}
      {suggestion && (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setWeight(String(suggestion.weight_kg))
                setReps(String(suggestion.reps))
              }}
              className={[
                'tabular min-h-9 rounded-full border px-3 text-sm font-medium',
                suggestion.stalling
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-accent/40 bg-accent/10 text-accent',
              ].join(' ')}
            >
              {suggestion.stalling ? '↓ ' : '→ '}
              {formatKg(suggestion.weight_kg)} × {suggestion.reps}
            </button>
            <button
              onClick={() => setShowWhy((v) => !v)}
              aria-expanded={showWhy}
              className="min-h-9 text-sm text-text-dim underline underline-offset-4"
            >
              {showWhy ? 'Hide' : 'Why?'}
            </button>
          </div>
          {showWhy && (
            <p className="mt-2 text-xs leading-relaxed text-text-dim">{suggestion.reason}</p>
          )}
        </div>
      )}

      {/* Logged sets */}
      {mine.length > 0 && (
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {mine.map((s, i) => (
            <li key={s.id}>
              {editing === s.id ? (
                <EditSetRow
                  set={s}
                  increment={exercise.load_increment_kg}
                  onDone={() => setEditing(null)}
                  onSave={(patch) => updateSet(s.id, patch)}
                  onDelete={() => {
                    setEditing(null)
                    void removeSet(s.id)
                  }}
                />
              ) : (
                <button
                  onClick={() => setEditing(s.id)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
                >
                  <span className="tabular w-5 text-xs text-text-dim">{i + 1}</span>
                  <span className="tabular flex-1 font-medium">
                    {formatKg(s.weight_kg)} × {s.reps}
                  </span>
                  {s.is_warmup && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-text-dim">
                      warm-up
                    </span>
                  )}
                  <span aria-hidden="true" className="text-xs text-text-dim">
                    edit
                  </span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Log a set. Values are pre-filled, so this is one tap.
          Log sits on its own full-width row rather than beside the fields: at
          390px, two steppered inputs plus a button left the weight input about
          56px wide, which truncated "62.5" to "6". It is also a bigger target
          and lands in the lower third, where the thumb already is. */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-end gap-3">
          <NumberField
            label="Weight (kg)"
            value={weight}
            onChange={setWeight}
            step={exercise.load_increment_kg || 1}
          />
          <NumberField label="Reps" value={reps} onChange={setReps} step={1} min={1} />
        </div>
        <button
          onClick={() => void logSet()}
          disabled={!canLog}
          className="min-h-14 w-full rounded-lg bg-accent text-lg font-semibold text-accent-text
                     disabled:opacity-40"
        >
          Log set
        </button>
      </div>

      <div className="px-4 pb-3">
        <label className="flex items-center gap-2 text-xs text-text-dim">
          <input
            type="checkbox"
            checked={warmup}
            onChange={(e) => setWarmup(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Log as warm-up (excluded from tonnage and progression)
        </label>
      </div>
    </section>
  )
}

function EditSetRow({
  set,
  increment,
  onSave,
  onDelete,
  onDone,
}: {
  set: WorkoutSet
  increment: number
  onSave: (patch: Partial<WorkoutSet>) => Promise<void>
  onDelete: () => void
  onDone: () => void
}) {
  const [w, setW] = useState(String(set.weight_kg))
  const [r, setR] = useState(String(set.reps))

  return (
    <div className="flex flex-col gap-2 bg-surface-2 px-4 py-3">
      <div className="flex items-end gap-3">
        <NumberField label="Weight (kg)" value={w} onChange={setW} step={increment || 1} />
        <NumberField label="Reps" value={r} onChange={setR} step={1} min={1} />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            await onSave({ weight_kg: Number(w), reps: Number(r) })
            onDone()
          }}
          className="min-h-11 flex-1 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-text"
        >
          Save
        </button>
        <button onClick={onDone} className="min-h-11 rounded-lg border border-border px-3 text-sm">
          Cancel
        </button>
        <button onClick={onDelete} className="min-h-11 rounded-lg px-3 text-sm text-danger">
          Delete
        </button>
      </div>
    </div>
  )
}
