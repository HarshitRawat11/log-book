import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import {
  listAllExercises,
  listWorkoutSummaries,
  recentSessionSummaries,
  type SessionSummary,
} from '../training/queries'
import { formatKg } from '../training/progression'
import { relativeAge, shortDate, todayIso } from '../lib/dates'
import { createWorkout } from '../training/session'

/**
 * Every session, newest first.
 *
 * A session carrying `source = 'import'` is badged, so a bulk-loaded number is
 * never mistaken for one logged in the app. Nothing writes that value today -
 * the phone-notes ETL was abandoned - but the badge is two lines and the column
 * is still the right shape if a bulk load ever happens.
 */
export function History() {
  const navigate = useNavigate()
  const summaries = useLiveQuery(() => listWorkoutSummaries(), [], [])
  // Names for history come from EVERY exercise, archived and deleted included,
  // or a past session silently lists fewer lifts than it contained.
  const exercises = useLiveQuery(listAllExercises, [], [])
  const byId = new Map((exercises ?? []).map((e) => [e.id, e]))
  const today = todayIso()

  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(() => {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    return todayIso(y)
  })

  // Same shortcut Train offers, because backfilling a fortnight by hand is the
  // case that needs it most: without this, every past session starts empty and
  // its five or six lifts get picked out of the library again by hand.
  const recent = useLiveQuery(
    () => recentSessionSummaries({ limit: 5, excludeDate: date }),
    [date],
    [],
  )

  async function backfill(repeat?: SessionSummary) {
    const w = await createWorkout(date, {
      exerciseIds: repeat?.exercise_ids,
      name: repeat?.name ?? null,
    })
    navigate(`/history/${w.id}`)
  }

  return (
    <Screen title="History" subtitle={`${(summaries ?? []).length} sessions`} actions={<SyncPill />}>
      {/* Backfill. You will forget to log a session eventually, and Train only
          ever shows today - without this there is no way in. */}
      {adding ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <label className="mb-1 block text-xs text-text-dim" htmlFor="backfill-date">
            Date of the session
          </label>
          <input
            id="backfill-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-base
                       outline-none focus:border-accent"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void backfill()}
              disabled={!date || date > today}
              className="min-h-12 flex-1 rounded-lg bg-accent font-semibold text-accent-text
                         disabled:opacity-40"
            >
              Create session
            </button>
            <button
              onClick={() => setAdding(false)}
              className="min-h-12 rounded-lg border border-border px-4"
            >
              Cancel
            </button>
          </div>

          {(recent ?? []).length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-text-dim">
                or repeat — same lifts on that date, nothing pre-logged
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border
                             border-border bg-surface-2">
                {recent!.map((s) => {
                  const names = s.exercise_ids.map((id) => byId.get(id)?.name).filter(Boolean)
                  const shown = names.slice(0, 3).join(', ')
                  const extra = names.length > 3 ? `, +${names.length - 3}` : ''
                  return (
                    <li key={s.workout_id}>
                      <button
                        onClick={() => void backfill(s)}
                        disabled={!date || date > today}
                        className="flex min-h-14 w-full flex-col items-start gap-0.5 px-3 py-2
                                   text-left disabled:opacity-40"
                      >
                        <span className="text-sm font-medium">
                          {s.name ? `${s.name} · ` : ''}
                          {shortDate(s.date)}{' '}
                          <span className="font-normal text-text-dim">
                            · {relativeAge(s.date)} · {s.set_count} sets
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
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 min-h-12 w-full rounded-xl border border-dashed border-border
                     font-medium text-text-dim"
        >
          + Log a session on another date
        </button>
      )}

      {(summaries ?? []).length === 0 ? (
        <EmptyState
          title="No sessions yet"
          body="Logged sessions appear here, newest first. You can open any of them to correct a set after the fact."
          action={
            <Link
              to="/train"
              className="flex min-h-12 items-center rounded-xl bg-accent px-4 font-semibold
                         text-accent-text"
            >
              Go to today
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2 pb-4">
          {summaries!.map(({ workout, exercise_ids, working_sets, tonnage_kg }) => {
            const names = exercise_ids.map((id) => byId.get(id)?.name).filter(Boolean)
            const shown = names.slice(0, 3).join(', ')
            const extra = names.length > 3 ? `, +${names.length - 3}` : ''
            return (
              <li key={workout.id}>
                <Link
                  to={`/history/${workout.id}`}
                  className="flex min-h-16 flex-col justify-center gap-1 rounded-2xl border
                             border-border bg-surface px-4 py-3"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">
                      {workout.name ? `${workout.name} · ` : ''}
                      {shortDate(workout.date)}
                      {workout.date === today && (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs
                                         font-medium text-accent">
                          today
                        </span>
                      )}
                    </span>
                    {/* The badge already says "today"; saying it twice is noise. */}
                    {workout.date !== today && (
                      <span className="text-xs text-text-dim">{relativeAge(workout.date)}</span>
                    )}
                    {workout.source === 'import' && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-text-dim">
                        imported
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-1 text-sm text-text-dim">
                    {shown || 'no exercises logged'}
                    {extra}
                  </span>
                  <span className="tabular text-xs text-text-dim">
                    {working_sets} working set{working_sets === 1 ? '' : 's'}
                    {tonnage_kg > 0 && ` · ${formatKg(Math.round(tonnage_kg))} tonnage`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}
