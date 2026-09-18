import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { ExerciseCard } from '../training/ExerciseCard'
import { ExercisePicker } from '../training/ExercisePicker'
import { RestBar } from '../training/RestBar'
import { ReorderList } from '../training/ReorderList'
import { SessionName } from '../training/SessionName'
import { SessionNotes } from '../training/SessionNotes'
import { deleteRow, patchRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { assistedIds, type Exercise, type Workout } from '../db/types'
import {
  isWorkingSet,
  listAllExercises,
  listExercises,
  notesForWorkout,
  previousExerciseNotes,
  recentSessionSummaries,
  setsForWorkout,
  tonnage,
  type SessionSummary,
} from '../training/queries'
import { sessionFocus } from '../training/focus'
import { formatKg } from '../training/progression'
import {
  addExerciseToSession,
  createWorkout,
  defaultActiveExercise,
  getDefaultRest,
  removeExerciseFromSession,
  reorderSessionExercises,
  sessionExerciseIds,
  workoutsOnDate,
} from '../training/session'
import { useRestTimer } from '../training/useRestTimer'
import { relativeAge, shortDate, todayIso } from '../lib/dates'

/**
 * Today's session - the screen that matters most (brief 7.1).
 *
 * Cold open lands here, and the exercise cards render with their inputs already
 * filled from your last set, so logging is one tap on "Log".
 *
 * The per-session exercise ORDER lives in the local-only `meta` table rather
 * than in a synced table. It is presentation state: if it were lost, you would
 * re-add an exercise, never lose a set. Sets are what sync.
 */

export function Train() {
  const date = todayIso()
  const [picking, setPicking] = useState(false)

  // Every session today, not just the first. Nothing forbids two in a day, and
  // picking [0] made a second one invisible.
  const todays = useLiveQuery(() => workoutsOnDate(date), [date], undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const workout =
    todays === undefined
      ? undefined
      : (todays.find((w) => w.id === selectedId) ?? todays[todays.length - 1] ?? null)
  const sets = useLiveQuery(
    async () => (workout ? await setsForWorkout(workout.id) : []),
    [workout?.id],
    [],
  )
  const exerciseIds = useLiveQuery(
    async () => (workout ? await sessionExerciseIds(workout) : []),
    [workout?.id, sets?.length],
    [],
  )
  const allExercises = useLiveQuery(() => listExercises(), [], [])
  // Resolved from EVERY exercise, not the offerable ones: a session that
  // included a lift since archived must still show that lift and its sets.
  const everyExercise = useLiveQuery(listAllExercises, [], [])
  // One read for the whole session rather than a live query per card, which
  // would re-run all six on every set logged.
  const notes = useLiveQuery(
    async () => (workout ? await notesForWorkout(workout.id) : new Map()),
    [workout?.id],
    new Map(),
  )
  // What was written against these lifts last time they were trained. One read
  // for the screen, not one per card.
  const lastNotes = useLiveQuery(
    async () => (workout ? await previousExerciseNotes(workout.id, workout.date) : new Map()),
    [workout?.id, workout?.date],
    new Map(),
  )
  // Excludes THIS session, not the whole day. With two sessions in a day,
  // copying the morning's into the evening's is the case you actually want,
  // and excluding by date hid it.
  const recent = useLiveQuery(
    () => recentSessionSummaries({ limit: 6, excludeWorkoutId: workout?.id }),
    [date, workout?.id],
    [],
  )
  const byId = new Map((everyExercise ?? []).map((e) => [e.id, e]))
  const inSession = (exerciseIds ?? []).map((id) => byId.get(id)).filter(Boolean) as Exercise[]

  /**
   * Which card is open, in three states rather than two:
   *
   *   undefined  no choice made - derive it (the last lift logged against)
   *   null       everything collapsed, chosen deliberately
   *   string     that card
   *
   * The null state is what the × on the log block sets. Without it, collapsing
   * a card would fall straight back to the derived default and reopen it.
   */
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined)
  const active =
    activeId === undefined
      ? defaultActiveExercise(inSession.map((e) => e.id), sets ?? [])
      : activeId && inSession.some((e) => e.id === activeId)
        ? activeId
        : null

  const [reordering, setReordering] = useState(false)

  const focus = sessionFocus(workout?.name, inSession)

  const pretty = new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  async function startSession(opts: { repeat?: SessionSummary } = {}) {
    // Repeating seeds the exercise list and the name only - no sets are copied.
    // It means "put the same lifts in front of me", not "pretend I already did
    // them".
    const created = await createWorkout(date, {
      exerciseIds: opts.repeat?.exercise_ids,
      name: opts.repeat?.name ?? null,
    })
    setSelectedId(created.id)
    setActiveId(undefined)
  }

  /**
   * Pull a previous session's lifts into THIS one.
   *
   * The exercise list only - no sets are copied. Pre-logged sets are
   * indistinguishable from performed ones the moment they are written, and a
   * session you forgot to correct becomes a permanent lie in the history the
   * progression engine reads from.
   */
  async function copyInto(summary: SessionSummary) {
    if (!workout) return
    for (const id of summary.exercise_ids) await addExerciseToSession(workout.id, id)
    if (!workout.name && summary.name) {
      await patchRow<Workout>('workouts', workout.id, { name: summary.name })
      scheduleFlush()
    }
    setActiveId(summary.exercise_ids[0] ?? undefined)
  }

  async function addExercise(id: string) {
    if (!workout) return
    await addExerciseToSession(workout.id, id)
    // Open what was just added. Adding a lift and then having to tap it to
    // start logging would be a step for nothing.
    setActiveId(id)
    setPicking(false)
  }

  /**
   * Remove an exercise from the session, tombstoning its sets with it.
   *
   * This used to return silently whenever the exercise had any sets, which
   * meant the × did nothing on precisely the cards you would want to use it
   * on, with no message - it simply read as broken. The card is derived FROM
   * the sets, so keeping them and dropping the card is not a state that
   * exists; the card asks for confirmation and names the count first.
   */
  async function removeExercise(id: string) {
    if (!workout) return
    for (const s of (sets ?? []).filter((x) => x.exercise_id === id)) {
      await deleteRow('sets', s.id)
    }
    await removeExerciseFromSession(workout.id, id)
    scheduleFlush()
  }

  const working = (sets ?? []).filter(isWorkingSet)
  const assisted = assistedIds(everyExercise ?? [])

  /**
   * The rest between sets.
   *
   * Started from inside the tap that logs the set, which is what unlocks audio
   * on Android. Warm-ups do not start one - two minutes after a warm-up is not
   * a rest, it is a delay - and everything else does, including a drop. Logging
   * again simply restarts it, which is correct: the rest begins after the last
   * thing you actually did.
   */
  const rest = useRestTimer()
  const restSeconds = useLiveQuery(getDefaultRest, [], null)

  function onSetLogged({ warmup, exerciseName }: { warmup: boolean; exerciseName: string }) {
    if (warmup || !restSeconds) return
    rest.start(restSeconds, exerciseName)
  }

  return (
    <Screen
      title="Train"
      subtitle={pretty}
      actions={
        <div className="flex items-center gap-2">
          {/* Styled as a button to match the sync pill beside it, but still an
              anchor - it navigates, so the element should say so. */}
          <Link
            to="/history"
            className="flex min-h-9 items-center rounded-full border border-border bg-surface-2
                       px-3 text-xs font-medium text-text-dim active:bg-border"
          >
            History
          </Link>
          <SyncPill />
        </div>
      }
    >
      {workout === undefined ? null : !workout ? (
        <div className="flex flex-col gap-4">
          {(allExercises ?? []).length === 0 ? (
            <EmptyState
              title="No exercises yet"
              body="Add a few lifts to your library first — name, muscle group, rep range and load increment. Progression suggestions need the rep range."
              action={
                <Link
                  to="/exercises"
                  className="flex min-h-12 items-center rounded-xl bg-accent px-4 font-semibold
                             text-accent-text"
                >
                  Build exercise library
                </Link>
              }
            />
          ) : (
            <>
              <button
                onClick={() => void startSession()}
                className="min-h-14 w-full rounded-xl bg-accent px-4 text-lg font-semibold
                           text-accent-text"
              >
                Start session
              </button>

              {(recent ?? []).length > 0 && (
                <div>
                  <p className="mb-2 px-1 text-xs text-text-dim">
                    or repeat — same lifts, nothing pre-logged
                  </p>
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl border
                                 border-border bg-surface">
                    {recent!.map((s) => {
                      const names = s.exercise_ids.map((id) => byId.get(id)?.name).filter(Boolean)
                      const shown = names.slice(0, 3).join(', ')
                      const extra = names.length > 3 ? `, +${names.length - 3}` : ''
                      return (
                        <li key={s.workout_id}>
                          <button
                            onClick={() => void startSession({ repeat: s })}
                            className="flex min-h-14 w-full flex-col items-start gap-0.5 px-4 py-2
                                       text-left"
                          >
                            <span className="text-sm font-medium">
                              {s.name ? `${s.name} · ` : ''}
                              {shortDate(s.date)}{' '}
                              <span className="font-normal text-text-dim">
                                · {relativeAge(s.date)} · {s.set_count} set{s.set_count === 1 ? '' : 's'}
                              </span>
                            </span>
                            <span className="line-clamp-1 text-xs text-text-dim">
                              {shown || 'no exercises'}
                              {extra}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          {(todays?.length ?? 0) > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-dim">Sessions today</span>
              {todays!.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelectedId(w.id)
                    setActiveId(undefined)
                  }}
                  className={[
                    // 44px, not 36: these carry session NAMES now rather than
                    // a digit, so they are read and tapped rather than glanced
                    // at, and 36 was under the minimum target anyway.
                    'min-h-11 rounded-full border px-3 text-sm font-medium',
                    w.id === workout.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-text-dim',
                  ].join(' ')}
                >
                  {/* The index stays even once there is a name. Two Pull
                      sessions in a day are common and identical pills are
                      worse than bare numbers were. */}
                  {w.name ? `${i + 1} · ${w.name}` : i + 1}
                </button>
              ))}
            </div>
          )}

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
                onSetLogged={onSetLogged}
                active={e.id === active}
                onActivate={() => setActiveId(e.id)}
                onCollapse={() => setActiveId(null)}
                onRemove={() => void removeExercise(e.id)}
              />
            ))
          )}

          {/* Two lifts is the point at which an order exists to be wrong. */}
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
            <>
              <EmptyState
                title="Session started"
                body="Add the first exercise and its inputs will be pre-filled from last time, so logging a set is one tap."
              />

              {/* The session exists but is empty, which is the moment copying a
                  previous one is worth most. Lifts only - see copyInto. */}
              {(recent ?? []).length > 0 && (
                <div>
                  <p className="mb-2 px-1 text-xs text-text-dim">
                    or copy a previous session — its lifts, nothing pre-logged
                  </p>
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl border
                                 border-border bg-surface">
                    {recent!.map((sum) => {
                      const names = sum.exercise_ids.map((id) => byId.get(id)?.name).filter(Boolean)
                      const shown = names.slice(0, 3).join(', ')
                      const extra = names.length > 3 ? `, +${names.length - 3}` : ''
                      return (
                        <li key={sum.workout_id}>
                          <button
                            onClick={() => void copyInto(sum)}
                            className="flex min-h-14 w-full flex-col items-start gap-0.5 px-4 py-2
                                       text-left"
                          >
                            <span className="text-sm font-medium">
                              {sum.name ? `${sum.name} · ` : ''}
                              {shortDate(sum.date)}{' '}
                              <span className="font-normal text-text-dim">
                                · {relativeAge(sum.date)} · {sum.set_count} set{sum.set_count === 1 ? '' : 's'}
                              </span>
                            </span>
                            <span className="line-clamp-1 text-xs text-text-dim">
                              {shown || 'no exercises'}
                              {extra}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {reordering ? null : picking ? (
            <ExercisePicker
              options={(allExercises ?? []).filter((e) => !inSession.some((x) => x.id === e.id))}
              focus={focus}
              onPick={(id) => void addExercise(id)}
              onClose={() => setPicking(false)}
            />
          ) : (
            <button
              onClick={() => setPicking(true)}
              className="min-h-14 w-full rounded-xl border border-dashed border-border
                         font-semibold text-text-dim"
            >
              + Add exercise
            </button>
          )}

          <SessionNotes workout={workout} />

          {working.length > 0 && (
            <p className="tabular px-1 pt-2 text-xs text-text-dim">
              {working.length} working set{working.length === 1 ? '' : 's'} ·{' '}
              {formatKg(Math.round(tonnage(sets ?? [], assisted)))} tonnage
            </p>
          )}

          {working.length > 0 && (
            <button
              onClick={() => void startSession()}
              className="min-h-12 w-full rounded-xl border border-dashed border-border text-sm
                         font-medium text-text-dim"
            >
              + Start another session today
            </button>
          )}

          <button
            onClick={async () => {
              if (working.length === 0) {
                await deleteRow('workouts', workout.id)
                scheduleFlush()
              }
            }}
            className={working.length === 0 ? 'min-h-11 text-sm text-danger' : 'hidden'}
          >
            Discard empty session
          </button>

          {/* Room for the floating bar, so the last control is still reachable
              while a rest is running. */}
          {rest.remaining !== null && <div aria-hidden="true" className="h-16" />}
        </div>
      )}

      <RestBar timer={rest} />
    </Screen>
  )
}
