import type { Exercise, MuscleGroup } from '../db/types'
import { rankForSession } from './focus'

/**
 * The "add exercise" list, ordered by what the session appears to be about.
 *
 * Shared by today's session and the history editor so the ordering cannot
 * drift between the two.
 *
 * It orders, it never filters. The day you want to do something off-plan is
 * exactly the day a filter would be infuriating, so everything in the library
 * is always one scroll away - the plausible lifts are simply at the top
 * instead of wherever the alphabet put them.
 */
export function ExercisePicker({
  options,
  focus,
  onPick,
  onClose,
}: {
  /** Already excludes what is in the session. Alphabetical. */
  options: Exercise[]
  focus: Set<MuscleGroup> | null
  onPick: (id: string) => void
  onClose: () => void
}) {
  const { relevant, rest } = rankForSession(options, focus)

  return (
    <div className="rounded-2xl border border-border bg-surface p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-sm text-text-dim">Add exercise</span>
        <button onClick={onClose} aria-label="Close the exercise list" className="size-11 text-text-dim">
          ×
        </button>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {relevant.length > 0 && (
          <>
            <li className="px-2 pb-1 pt-2 text-xs font-medium text-text-dim">Fits this session</li>
            {relevant.map((e) => (
              <Row key={e.id} exercise={e} onPick={onPick} />
            ))}
            <li className="border-t border-border px-2 pb-1 pt-3 text-xs font-medium text-text-dim">
              Everything else
            </li>
          </>
        )}
        {rest.map((e) => (
          <Row key={e.id} exercise={e} onPick={onPick} />
        ))}
        {options.length === 0 && (
          <li className="px-2 py-3 text-sm text-text-dim">
            Every exercise in the library is already in this session.
          </li>
        )}
      </ul>
    </div>
  )
}

function Row({ exercise, onPick }: { exercise: Exercise; onPick: (id: string) => void }) {
  return (
    <li>
      <button
        onClick={() => onPick(exercise.id)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-2 text-left"
      >
        <span className="min-w-0 truncate">{exercise.name}</span>
        <span className="shrink-0 text-xs text-text-dim">{exercise.muscle_group}</span>
      </button>
    </li>
  )
}
