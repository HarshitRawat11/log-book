import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { ExerciseCard } from '../training/ExerciseCard'
import { db } from '../db/db'
import { deleteRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Exercise } from '../db/types'
import { listExercises, setsForWorkout, tonnage } from '../training/queries'
import { addExerciseToSession, removeExerciseFromSession, sessionExerciseIds } from '../training/session'
import { formatKg } from '../training/progression'
import { relativeAge, shortDate } from '../lib/dates'

/**
 * One past session, fully editable.
 *
 * Reuses ExerciseCard, so a session from six weeks ago is corrected through
 * exactly the same code path as today's - there is no second, subtly different
 * editing surface to keep in step.
 */
export function WorkoutDetail() {
  const { workoutId = '' } = useParams()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const workout = useLiveQuery(async () => (await db.workouts.get(workoutId)) ?? null, [workoutId], undefined)
  const sets = useLiveQuery(() => setsForWorkout(workoutId), [workoutId], [])
  const exerciseIds = useLiveQuery(
    async () => (workout ? await sessionExerciseIds(workout) : []),
    [workout?.id, sets?.length],
    [],
  )
  const allExercises = useLiveQuery(() => listExercises(), [], [])

  const byId = new Map((allExercises ?? []).map((e) => [e.id, e]))
  const inSession = (exerciseIds ?? []).map((id) => byId.get(id)).filter(Boolean) as Exercise[]
  const working = (sets ?? []).filter((s) => !s.is_warmup)

  if (workout === undefined) return <Screen title="Session">{null}</Screen>
  if (!workout || workout.deleted_at) {
    return (
      <Screen title="Session" actions={<SyncPill />}>
        <EmptyState
          title="Session not found"
          body="It may have been deleted on this or another device."
          action={
            <Link to="/history" className="flex min-h-12 items-center rounded-xl bg-accent px-4
                                            font-semibold text-accent-text">
              Back to history
            </Link>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen
      title={shortDate(workout.date)}
      subtitle={`${relativeAge(workout.date)}${workout.source === 'import' ? ' · imported' : ''}`}
      actions={<SyncPill />}
    >
      <div className="flex flex-col gap-3 pb-4">
        <Link to="/history" className="min-h-11 px-1 text-sm text-accent underline underline-offset-4">
          ‹ All sessions
        </Link>

        {inSession.map((e) => (
          <ExerciseCard
            key={e.id}
            exercise={e}
            workoutId={workout.id}
            sets={sets ?? []}
            onRemove={() => {
              if ((sets ?? []).some((s) => s.exercise_id === e.id)) return
              void removeExerciseFromSession(workout.id, e.id)
            }}
          />
        ))}

        {inSession.length === 0 && (
          <EmptyState
            title="Nothing logged in this session"
            body="Add an exercise to log against it, or delete the session below."
          />
        )}

        {picking ? (
          <div className="rounded-2xl border border-border bg-surface p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-sm text-text-dim">Add exercise</span>
              <button onClick={() => setPicking(false)} className="size-11 text-text-dim">
                ×
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {(allExercises ?? [])
                .filter((e) => !inSession.some((x) => x.id === e.id))
                .map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={async () => {
                        await addExerciseToSession(workout.id, e.id)
                        setPicking(false)
                      }}
                      className="flex min-h-12 w-full items-center justify-between gap-2 px-2 text-left"
                    >
                      <span>{e.name}</span>
                      <span className="text-xs text-text-dim">{e.muscle_group}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="min-h-14 w-full rounded-xl border border-dashed border-border font-semibold
                       text-text-dim"
          >
            + Add exercise
          </button>
        )}

        {working.length > 0 && (
          <p className="tabular px-1 pt-2 text-xs text-text-dim">
            {working.length} working set{working.length === 1 ? '' : 's'} ·{' '}
            {formatKg(Math.round(tonnage(sets ?? [])))} tonnage
          </p>
        )}

        {confirmDelete ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
            <p className="text-sm">
              Delete this session and all {(sets ?? []).length} of its sets? This syncs to every
              device.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  // Tombstone the sets too. The Postgres cascade would handle it
                  // server-side, but the local store and the outbox would not
                  // know, so the sets would linger on this device.
                  for (const s of sets ?? []) await deleteRow('sets', s.id)
                  await deleteRow('workouts', workout.id)
                  scheduleFlush()
                  navigate('/history', { replace: true })
                }}
                className="min-h-11 flex-1 rounded-lg bg-danger px-3 text-sm font-semibold text-white"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="min-h-11 rounded-lg border border-border px-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-2 min-h-11 text-sm text-danger"
          >
            Delete session
          </button>
        )}
      </div>
    </Screen>
  )
}
