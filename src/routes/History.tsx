import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { listExercises, listWorkoutSummaries } from '../training/queries'
import { formatKg } from '../training/progression'
import { relativeAge, shortDate, todayIso } from '../lib/dates'

/**
 * Every session, newest first.
 *
 * Imported sessions are marked, so a number that came out of the phone-notes
 * ETL is never mistaken for one logged in the app.
 */
export function History() {
  const summaries = useLiveQuery(() => listWorkoutSummaries(), [], [])
  const exercises = useLiveQuery(() => listExercises(true), [], [])
  const byId = new Map((exercises ?? []).map((e) => [e.id, e]))
  const today = todayIso()

  return (
    <Screen title="History" subtitle={`${(summaries ?? []).length} sessions`} actions={<SyncPill />}>
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
                      {shortDate(workout.date)}
                      {workout.date === today && (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs
                                         font-medium text-accent">
                          today
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-text-dim">{relativeAge(workout.date)}</span>
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
