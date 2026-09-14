import { useEffect, useRef, useState } from 'react'
import { patchRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Workout } from '../db/types'

/**
 * Free text against the session.
 *
 * `workouts.notes` has existed since the initial schema; this is the first UI
 * for it, so there is no migration.
 *
 * Deliberately unstructured. It is the place for the things worth remembering
 * that no field will ever have - the machine was taken, slept badly, elbow
 * complained on the second set - and the moment it grows a taxonomy it stops
 * being somewhere you can type in eight seconds between sets.
 */
export function SessionNotes({ workout }: { workout: Workout }) {
  const workoutId = workout.id
  const [text, setText] = useState(workout.notes ?? '')
  const [open, setOpen] = useState(Boolean(workout.notes))
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle')

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read by the unmount cleanup, which must not re-run on every keystroke.
  const latest = useRef(text)
  latest.current = text

  /**
   * Re-seed only when the session itself changes - two sessions in one day, or
   * moving between history entries.
   *
   * Deliberately NOT keyed on workout.notes. Saving updates the row, the live
   * query re-renders with the new value, and if that fed back into state it
   * would overwrite anything typed in the meantime with the value from 600ms
   * ago. It also means a background sync cannot yank text out from under you
   * mid-sentence, which is the right call for a field only one device edits.
   */
  useEffect(() => {
    const row = workout.notes ?? ''
    setText(row)
    setOpen(Boolean(row))
    setStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  function save(next: string) {
    return patchRow<Workout>('workouts', workoutId, { notes: next.trim() || null }).then(() => {
      scheduleFlush()
    })
  }

  /**
   * Debounced: every keystroke is otherwise a Dexie write plus an outbox row to
   * flush. 600ms coalesces a sentence and still saves if the phone goes down
   * mid-word.
   */
  function edit(next: string) {
    setText(next)
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void save(next).then(() => setStatus('saved'))
    }, 600)
  }

  // Flush a pending debounce on unmount, or the last few characters typed
  // before navigating away are lost.
  useEffect(() => {
    return () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = null
      void save(latest.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-xl border border-dashed border-border text-sm
                   font-medium text-text-dim"
      >
        + Note
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor="session-notes" className="text-xs font-medium text-text-dim">
          Session note
        </label>
        <span aria-live="polite" className="text-xs text-text-dim">
          {status === 'pending' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        id="session-notes"
        value={text}
        onChange={(e) => edit(e.target.value)}
        rows={3}
        placeholder="Anything worth remembering about today."
        className="w-full resize-y rounded-lg border border-border bg-surface-2 p-2 text-base
                   leading-relaxed outline-none focus:border-accent"
      />
    </section>
  )
}
