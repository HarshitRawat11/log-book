import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { db } from '../db/db'
import { patchRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { CardioSession } from '../db/types'
import { workMinutesOf } from '../cardio/analytics'
import { mmss } from '../cardio/schedule'
import { shortDate } from '../lib/dates'

/**
 * Notes and RPE, after the fact.
 *
 * Gloves are off by now, so ordinary controls are fine. Both fields are
 * genuinely optional: the session is already logged and complete without them,
 * and this screen only ever adds to it. Skipping is a button, not an escape -
 * the Cardio tab will ask again later.
 */
export function CardioReview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useLiveQuery(
    async () => (id ? await db.cardio_sessions.get(id) : undefined),
    [id],
    undefined,
  )

  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [seeded, setSeeded] = useState(false)

  // Seed once, so a live-query refresh cannot overwrite what is being typed.
  useEffect(() => {
    if (!session || seeded) return
    setRpe(session.rpe)
    setNotes(session.notes ?? '')
    setSeeded(true)
  }, [session, seeded])

  if (session === undefined) return <Screen title="Session">{null}</Screen>
  if (!session) {
    return (
      <Screen title="Session">
        <p className="text-sm text-text-dim">That session no longer exists.</p>
      </Screen>
    )
  }

  async function save() {
    await patchRow<CardioSession>('cardio_sessions', session!.id, {
      rpe,
      notes: notes.trim() || null,
    })
    scheduleFlush()
    navigate('/cardio', { replace: true })
  }

  const planned = session.rounds_planned
  const done = session.rounds_completed

  return (
    <Screen title={session.completed ? 'Session complete' : 'Session ended early'}>
      <div className="flex flex-col gap-4 pb-4">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <p className="tabular text-3xl font-semibold">
            {done} <span className="text-lg font-normal text-text-dim">of {planned} rounds</span>
          </p>
          <p className="tabular mt-1 text-sm text-text-dim">
            {workMinutesOf(session)} min of work · {mmss(session.work_seconds)} rounds
            {session.break_seconds > 0 && `, ${mmss(session.break_seconds)} breaks`} ·{' '}
            {shortDate(session.date)}
          </p>
          <p className="mt-0.5 text-xs text-text-dim">
            {session.activity}
            {session.preset_name && ` · ${session.preset_name}`}
          </p>
        </section>

        <div>
          <p className="mb-2 px-1 text-sm font-medium">How hard was it?</p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setRpe(rpe === n ? null : n)}
                aria-pressed={rpe === n}
                className={[
                  'tabular min-h-12 rounded-lg border text-base font-semibold',
                  rpe === n
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface text-text-dim',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-xs text-text-dim">
            1 is barely worth changing for, 10 is nothing left. Tap again to clear.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="px-1 text-sm font-medium">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="How it went, what to change next time."
            className="w-full resize-y rounded-xl border border-border bg-surface p-3 text-base
                       leading-relaxed outline-none focus:border-accent"
          />
        </label>

        <button
          onClick={() => void save()}
          className="min-h-14 w-full rounded-xl bg-accent text-lg font-semibold text-accent-text"
        >
          Save
        </button>
        <button
          onClick={() => navigate('/cardio', { replace: true })}
          className="min-h-12 w-full rounded-xl border border-border bg-surface font-medium
                     text-text-dim"
        >
          Skip for now
        </button>
        <p className="px-1 text-center text-xs text-text-dim">
          The session is already logged. Skipping only leaves these two fields empty, and Cardio
          will offer them again.
        </p>
      </div>
    </Screen>
  )
}
