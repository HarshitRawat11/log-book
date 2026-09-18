import { humanDuration } from '../cardio/schedule'
import { sessionSeconds, type Workout } from '../db/types'
import { finishWorkout, reopenWorkout } from './session'

/**
 * Close a session, and show how long it took.
 *
 * Shown only once something has been logged: offering to finish a session with
 * nothing in it would be offering to record that you turned up and left.
 *
 * Duration comes from `started_at`, which is stamped when the session is
 * created - so it measures arriving-to-leaving rather than first-set-to-last.
 * That is the number worth having, and it is the only one the data supports
 * without inventing a definition.
 */
export function FinishSession({ workout, hasSets }: { workout: Workout; hasSets: boolean }) {
  const seconds = sessionSeconds(workout)

  if (!hasSets) return null

  if (workout.finished_at) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border
                      bg-surface px-3 py-1.5">
        <span className="text-sm">
          Finished
          {seconds !== null && (
            <span className="tabular text-text-dim"> · {humanDuration(seconds)}</span>
          )}
        </span>
        <button
          onClick={() => void reopenWorkout(workout.id)}
          className="min-h-11 shrink-0 text-sm font-medium text-text-dim"
        >
          Reopen
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => void finishWorkout(workout.id)}
      className="min-h-12 w-full rounded-xl border border-border bg-surface-2 text-sm
                 font-medium text-text-dim"
    >
      Finish session
    </button>
  )
}
