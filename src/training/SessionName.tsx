import { useEffect, useRef, useState } from 'react'
import { patchRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Workout } from '../db/types'

/**
 * The session's label - "Pull", "Push B", "Legs, short on time".
 *
 * A date identifies a session and does not help you recognise it. This is what
 * you scan for in a list of thirty, and it is also the strongest hint the
 * exercise picker has about which lifts to offer first.
 *
 * Collapsed to a slim pill until there is a name, because the logging screen
 * earns its keep by being one tap from a set, and a permanently-open text
 * input at the top of it is a worse trade than a pill you can ignore.
 */
export function SessionName({ workout }: { workout: Workout }) {
  const workoutId = workout.id
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(workout.name ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-seed on the session itself changing - two sessions in one day, or
  // moving between history entries. Deliberately not keyed on workout.name,
  // for the same reason NoteField is not: saving would feed back and fight
  // what is being typed.
  useEffect(() => {
    setText(workout.name ?? '')
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commit(next: string) {
    const clean = next.trim() || null
    setEditing(false)
    if (clean === (workout.name ?? null)) return
    await patchRow<Workout>('workouts', workoutId, { name: clean })
    scheduleFlush()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Saved on blur as well as on Enter: on a phone the keyboard's
          // dismiss button is a blur and nothing else, and losing the name to
          // that would be maddening.
          onBlur={() => void commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit(text)
            if (e.key === 'Escape') {
              setText(workout.name ?? '')
              setEditing(false)
            }
          }}
          maxLength={60}
          placeholder="Pull"
          aria-label="Session name"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3
                     text-base outline-none focus:border-accent"
        />
        <button
          onMouseDown={(e) => e.preventDefault()} // let blur commit, not cancel
          onClick={() => void commit(text)}
          className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm"
        >
          Done
        </button>
      </div>
    )
  }

  if (!workout.name) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="min-h-11 w-fit rounded-full border border-dashed border-border px-3 text-sm
                   font-medium text-text-dim"
      >
        + Name this session
      </button>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      aria-label={`Session name: ${workout.name}. Tap to rename.`}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border
                 bg-surface px-3 text-left"
    >
      <span className="min-w-0 flex-1 truncate font-semibold">{workout.name}</span>
    </button>
  )
}
