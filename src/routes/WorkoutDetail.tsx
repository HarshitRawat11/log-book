import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { ExerciseCard } from '../training/ExerciseCard'
import { ExercisePicker } from '../training/ExercisePicker'
import { ReorderList } from '../training/ReorderList'
import { FinishSession } from '../training/FinishSession'
import { SessionName } from '../training/SessionName'
import { SessionNotes } from '../training/SessionNotes'
import { db } from '../db/db'
import { deleteRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { assistedIds, type Exercise } from '../db/types'
import {
  isWorkingSet,
  listAllExercises,
  listExercises,
  notesForWorkout,
  previousExerciseNotes,
  setsForWorkout,
  tonnage,
} from '../training/queries'
import { sessionFocus } from '../training/focus'
import {
  addExerciseToSession,
  defaultActiveExercise,
  removeExerciseFromSession,
  reorderSessionExercises,
  sessionExerciseIds,
} from '../training/session'
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

  const workout = useLiveQuery(async () => (await db.workouts.get(workoutId)) ?? null, [workoutId], undefined)
  const sets = useLiveQuery(() => setsForWorkout(workoutId), [workoutId], [])
  const exerciseIds = useLiveQuery(
    async () => (workout ? await sessionExerciseIds(workout) : []),
    [workout?.id, sets?.length],
    [],
  )
  const allExercises = useLiveQuery(() => listExercises(), [], [])
  // Resolved from EVERY exercise, not the offerable ones: a session that
  // included a lift since archived must still show that lift and its sets.
  const everyExercise = useLiveQuery(listAllExercises, [], [])
  const notes = useLiveQuery(() => notesForWorkout(workoutId), [workoutId], new Map())
  // Dated on or before this session, so opening one from six weeks ago shows
  // what was true then rather than what has been written since.
  const lastNotes = useLiveQuery(
    async () => (workout ? await previousExerciseNotes(workout.id, workout.date) : new Map()),
    [workout?.id, workout?.date],
    new Map(),
  )

  const byId = new Map((everyExercise ?? []).map((e) => [e.id, e]))
  const inSession = (exerciseIds ?? []).map((id) => byId.get(id)).filter(Boolean) as Exercise[]
  const working = (sets ?? []).filter(isWorkingSet)
  const assisted = assistedIds(everyExercise ?? [])

  // Tri-state, as on Train: undefined derives, null is "collapsed on purpose".
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined)
  const active =
    activeId === undefined
      ? defaultActiveExercise(inSession.map((e) => e.id), sets ?? [])
      : activeId && inSession.some((e) => e.id === activeId)
        ? activeId
        : null

  const [reordering, setReordering] = useState(false)

  const focus = sessionFocus(workout?.name, inSession)

  /**
   * Tombstones the sets with it; the card confirms and names the count first.
   * This used to return silently whenever there were any, so the × read as
   * broken on exactly the cards you would use it on.
   */
  async function removeExercise(id: string) {
    if (!workout) return
    for (const s of (sets ?? []).filter((x) => x.exercise_id === id)) {
      await deleteRow('sets', s.id)
    }
    await removeExerciseFromSession(workout.id, id)
    scheduleFlush()
  }

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
      // The header stays the date, and the name lives in the pill below it -
      // the same arrangement as Train. Putting the name up here as well read
      // as a bug: the same four words twice inside 300px.
      title={shortDate(workout.date)}
      subtitle={`${relativeAge(workout.date)}${workout.source === 'import' ? ' · imported' : ''}`}
      actions={<SyncPill />}
    >
      <div className="flex flex-col gap-3 pb-4">
        <Link
          to="/history"
          className="flex min-h-11 w-fit items-center rounded-full border border-border
                     bg-surface-2 px-3 text-sm font-medium text-text-dim active:bg-border"
        >
          ‹ All sessions
        </Link>

        <SessionName workout={workout} />

        {reordering ? (
          <ReorderList
            items={inSession.map((e) => ({
              id: e.id,
              name: e.name,
              sets: (sets ?? []).filter((x) => x.exercise_id === e.id).length,
            }))}
            onDone={async (ids) => {
              await reorderSessionExercises(workout.id, ids)
              setReordering(false)
            }}
            onCancel={() => setReordering(false)}
          />
        ) : (
          inSession.map((e) => (
            <ExerciseCard
              key={e.id}
              exercise={e}
              workoutId={workout.id}
              sets={sets ?? []}
              note={notes?.get(e.id)?.note ?? null}
              lastNote={lastNotes?.get(e.id) ?? null}
              active={e.id === active}
              onActivate={() => setActiveId(e.id)}
              onCollapse={() => setActiveId(null)}
              showSuggestion={false}
              onRemove={() => void removeExercise(e.id)}
            />
          ))
        )}

        {!reordering && inSession.length > 1 && (
          <button
            onClick={() => setReordering(true)}
            className="min-h-11 w-fit rounded-full border border-border bg-surface-2 px-3
                       text-sm font-medium text-text-dim"
          >
            ≡ Reorder
          </button>
        )}

        {inSession.length === 0 && (
          <EmptyState
            title="Nothing logged in this session"
            body="Add an exercise to log against it, or delete the session below."
          />
        )}

        {reordering ? null : picking ? (
          <ExercisePicker
            options={(allExercises ?? []).filter((e) => !inSession.some((x) => x.id === e.id))}
            focus={focus}
            onPick={async (id) => {
              await addExerciseToSession(workout.id, id)
              setActiveId(id)
              setPicking(false)
            }}
            onClose={() => setPicking(false)}
          />
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
            {formatKg(Math.round(tonnage(sets ?? [], assisted)))} tonnage
          </p>
        )}

        <FinishSession workout={workout} hasSets={(sets ?? []).length > 0} />

        <div className="mb-4">
          <SessionNotes workout={workout} />
        </div>

        <ConfirmDelete
          label="Delete session"
          warning={
            <>
              Delete this session and all {(sets ?? []).length} of its sets? This syncs to every
              device.
            </>
          }
          onConfirm={async () => {
            // Tombstone the sets and notes too. The Postgres cascade would
            // handle it server-side, but the local store and the outbox would
            // not know, so both would linger on this device.
            for (const s of sets ?? []) await deleteRow('sets', s.id)
            for (const n of notes?.values() ?? []) await deleteRow('workout_exercise_notes', n.id)
            await deleteRow('workouts', workout.id)
            scheduleFlush()
            navigate('/history', { replace: true })
          }}
        />

      </div>
    </Screen>
  )
}
