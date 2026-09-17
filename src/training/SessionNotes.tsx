import { patchRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Workout } from '../db/types'
import { NoteField } from './NoteField'

/**
 * Free text against the whole session.
 *
 * `workouts.notes` has existed since the initial schema. This is for the things
 * that are true of the day rather than of any one lift - slept badly, short on
 * time, gym was heaving. Anything attached to a specific exercise belongs in
 * that exercise's own note, which is a separate row and a separate field.
 *
 * All the fiddly parts - debounce, re-seeding, flushing on unmount - live in
 * NoteField, shared with the per-exercise version.
 */
export function SessionNotes({ workout }: { workout: Workout }) {
  return (
    <NoteField
      id="session-notes"
      label="Session note"
      collapsedLabel="+ Note about the whole session"
      placeholder="Anything worth remembering about today."
      value={workout.notes}
      subject={workout.id}
      openClassName="rounded-2xl border border-border bg-surface p-3"
      onSave={async (next) => {
        await patchRow<Workout>('workouts', workout.id, { notes: next.trim() || null })
        scheduleFlush()
      }}
    />
  )
}
