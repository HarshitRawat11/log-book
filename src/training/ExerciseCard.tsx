import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { setTypeOf, type Exercise, type SetType, type WorkoutSet } from '../db/types'
import { deleteRow, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { NumberField } from '../components/NumberField'
import { NoteField } from './NoteField'
import { formatKg, repeatOf, suggestNext } from './progression'
import { nextSetIndex, recentSessions, saveExerciseNote } from './queries'
import { relativeAge, shortDate } from '../lib/dates'

/**
 * What you are about to log. One exclusive choice rather than a warm-up
 * checkbox plus a type dropdown, because the combinations the two would allow
 * are exactly the ones the database rejects - a warm-up drop set is not a
 * thing. `kind` maps onto (is_warmup, set_type).
 */
type SetKind = 'working' | 'warmup' | 'dropset' | 'myorep'

const KINDS: Array<{ kind: SetKind; label: string; hint: string; continuation: boolean }> = [
  {
    kind: 'working',
    label: 'Working',
    hint: 'A set in its own right. Counts everywhere.',
    continuation: false,
  },
  {
    kind: 'warmup',
    label: 'Warm-up',
    hint: 'Excluded from tonnage, volume and progression.',
    continuation: false,
  },
  {
    kind: 'dropset',
    label: 'Drop',
    hint: 'Part of the set above. Adds tonnage, but not another working set.',
    continuation: true,
  },
  {
    kind: 'myorep',
    label: 'Myorep',
    hint: 'A mini-set off the one above. Adds tonnage, but not another working set.',
    continuation: true,
  },
]

function toKind(s: Pick<WorkoutSet, 'is_warmup' | 'set_type'>): SetKind {
  if (s.is_warmup) return 'warmup'
  const t = setTypeOf(s)
  return t === 'normal' ? 'working' : t
}

const fromKind = (k: SetKind): { is_warmup: boolean; set_type: SetType } => ({
  is_warmup: k === 'warmup',
  set_type: k === 'dropset' || k === 'myorep' ? k : 'normal',
})

/**
 * The marker in the leftmost column of a logged set.
 *
 * Only working sets are numbered, and they are numbered by their position
 * among working sets rather than by row, so the last number in the list always
 * equals the session's working-set total. A continuation gets an arrow, a
 * warm-up a dot.
 */
function setLabel(rows: WorkoutSet[], i: number): string {
  const kind = toKind(rows[i]!)
  if (kind === 'dropset' || kind === 'myorep') return '↳'
  if (kind === 'warmup') return '·'
  return String(rows.slice(0, i + 1).filter((r) => toKind(r) === 'working').length)
}

/**
 * One exercise inside a session.
 *
 * No modals anywhere in this flow (brief 7.1). Editing a set happens in place,
 * because the alternative is a dialog you have to dismiss while holding a
 * dumbbell.
 *
 * Exactly one card in a session is OPEN at a time. With every card showing its
 * own weight/reps/Log block, four exercises in you are scrolling past three
 * live forms to reach the one you are actually on, and the wrong one is always
 * the one nearest your thumb. A closed card still shows its header and every
 * set logged against it - that is the part you re-read between sets - and only
 * the input block is put away.
 */
export function ExerciseCard({
  exercise,
  workoutId,
  sets,
  note,
  lastNote,
  active,
  onActivate,
  onRemove,
  onSetLogged,
  showSuggestion = true,
}: {
  exercise: Exercise
  workoutId: string
  sets: WorkoutSet[]
  /** This exercise's note in this session, already loaded by the parent. */
  note: string | null
  /**
   * The note left against this exercise the LAST time it was trained, dated.
   * The reason the notes are worth writing: it is read standing at the machine,
   * before the first set, not afterwards.
   */
  lastNote: { note: string; date: string } | null
  /** Whether this is the open card. Exactly one card per session is. */
  active: boolean
  onActivate: () => void
  onRemove: () => void
  /**
   * Fired after a set is written, so the screen can start the rest timer.
   * Absent when reviewing a past session - correcting a typo from nine days
   * ago should not start a two-minute countdown.
   */
  onSetLogged?: (info: { warmup: boolean; exerciseName: string }) => void
  /**
   * Off when reviewing a past session. "Next time do 62.5kg" is noise when you
   * have opened a session from nine days ago to correct a typo, and worse than
   * noise if it gets read as advice about that day.
   */
  showSuggestion?: boolean
}) {
  // The load counterweights the lifter, so every comparison runs backwards.
  // Held in one constant because it changes wording in four places and getting
  // one of them wrong is how "less weight is progress" turns into a lie.
  const assisted = exercise.load_is_assistance

  const mine = useMemo(
    () => sets.filter((s) => s.exercise_id === exercise.id).sort((a, b) => a.set_index - b.set_index),
    [sets, exercise.id],
  )

  const history = useLiveQuery(
    () => recentSessions(exercise.id, { limit: 5, excludeWorkoutId: workoutId }),
    [exercise.id, workoutId],
    [],
  )

  const suggestion = useMemo(
    () => (showSuggestion && history && history.length ? suggestNext(exercise, history) : null),
    [exercise, history, showSuggestion],
  )
  const lastSession = history?.[0]

  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [kind, setKind] = useState<SetKind>('working')
  const [editing, setEditing] = useState<string | null>(null)
  const [showWhy, setShowWhy] = useState(false)

  // A drop or a myorep hangs off the set before it, so neither means anything
  // as the first row of an exercise. If the list is emptied while one is
  // selected, fall back rather than leaving an impossible choice armed.
  const canContinue = mine.length > 0
  useEffect(() => {
    if (!canContinue && (kind === 'dropset' || kind === 'myorep')) setKind('working')
  }, [canContinue, kind])

  /**
   * Pre-fill with a REPEAT of what was actually done - the previous set in this
   * session, else last session's top set. This is a record of fact, not advice,
   * which is what lets "log a set" be one tap. The progression suggestion stays
   * opt-in and pre-fills nothing until tapped (brief 7.2).
   *
   * Warm-ups are their own question. The effect used to ignore `kind`, so
   * tapping Warm-up left the WORKING weight sitting in the field and logging
   * without looking recorded a warm-up at your top set. It is excluded from
   * everything that counts, so the damage was cosmetic - but wrong by default
   * is still wrong.
   *
   * A warm-up repeats this session's last warm-up, and otherwise clears, so the
   * number is typed deliberately. There is no last-session fallback on purpose:
   * `recentSessions` filters to working sets, so last week's warm-ups are not
   * loaded, and inventing one from the working weight is the bug again.
   *
   * The dependency is `warmup`, not `kind`. Drop and myorep genuinely do repeat
   * the working weight - you drop FROM it - and keying on `kind` would reset a
   * number you had just typed every time you tapped between those two.
   */
  const warmup = kind === 'warmup'
  useEffect(() => {
    if (warmup) {
      const last = mine.filter((s) => s.is_warmup).sort((a, b) => b.set_index - a.set_index)[0]
      setWeight(last ? String(last.weight_kg) : '')
      setReps(last ? String(last.reps) : '')
      return
    }
    const r = repeatOf(mine, lastSession, assisted)
    setWeight(r ? String(r.weight_kg) : '')
    setReps(r ? String(r.reps) : '')
  }, [mine, lastSession, assisted, warmup])

  const canLog = weight !== '' && reps !== '' && Number(reps) > 0

  async function logSet() {
    if (!canLog) return
    await putRow(
      'sets',
      newRow({
        workout_id: workoutId,
        exercise_id: exercise.id,
        set_index: nextSetIndex(sets, exercise.id),
        weight_kg: Number(weight),
        reps: Number(reps),
        rir: null,
        ...fromKind(kind),
        source: 'app' as const,
        import_batch_id: null,
      }),
    )
    scheduleFlush()
    // Called from inside the tap, which is what unlocks audio: a context
    // created outside a user gesture stays suspended and silent.
    onSetLogged?.({ warmup, exerciseName: exercise.name })
  }

  async function updateSet(id: string, patch: Partial<WorkoutSet>) {
    await patchRow<WorkoutSet>('sets', id, patch)
    scheduleFlush()
  }

  async function removeSet(id: string) {
    await deleteRow('sets', id)
    scheduleFlush()
  }

  // "Last time" quotes the HARDEST set, which on an assisted machine is the
  // lightest one. Quoting the heaviest would report the moment the machine
  // helped you most and call it your best.
  const lastLoad = lastSession
    ? assisted
      ? Math.min(...lastSession.sets.map((s) => s.weight_kg))
      : Math.max(...lastSession.sets.map((s) => s.weight_kg))
    : null

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 px-4 pt-3">
        <button
          onClick={onActivate}
          aria-expanded={active}
          className="min-w-0 flex-1 text-left"
        >
          <h2 className="truncate font-semibold">{exercise.name}</h2>
          <p className="mt-0.5 text-xs text-text-dim">
            {exercise.target_rep_min}–{exercise.target_rep_max} reps
            {lastSession ? (
              <>
                {' · last '}
                {shortDate(lastSession.date)} ({relativeAge(lastSession.date)}){': '}
                <span className="tabular text-text">
                  {lastSession.sets.map((s) => s.reps).join('/')} @ {formatKg(lastLoad!)}
                </span>
              </>
            ) : (
              ' · no history yet'
            )}
          </p>
          {/* The setup numbers, at the top of the card, because the moment they
              are useful is standing in front of the machine before set one. */}
          {exercise.machine_setup && (
            <span className="mt-1 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-xs text-text-dim">
              {exercise.machine_setup}
            </span>
          )}
          {/* Stated on the card, not just in the library. Every number below
              means the opposite of what it normally does, and the one place
              that has to be unambiguous is where you are typing them in. */}
          {assisted && (
            <span className="mt-1 ml-1 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
              assisted · less is progress
            </span>
          )}
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${exercise.name} from this session`}
          className="-mr-1 -mt-1 size-11 shrink-0 text-lg text-text-dim"
        >
          ×
        </button>
      </header>

      {/* What you told yourself last time, before the first set rather than
          after the last one. Shown whether the card is open or closed: it is
          two lines, and putting it behind a tap would defeat the point. */}
      {lastNote && (
        <p className="mx-4 mt-2 rounded-lg border-l-2 border-accent/50 bg-surface-2 py-1.5 pl-2.5
                      pr-2 text-xs leading-relaxed text-text-dim">
          <span className="font-medium text-text">{shortDate(lastNote.date)}</span>
          {' · '}
          {lastNote.note}
        </p>
      )}

      {/* Progression suggestion. Pre-fills nothing until tapped. */}
      {active && suggestion && (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setWeight(String(suggestion.weight_kg))
                setReps(String(suggestion.reps))
              }}
              className={[
                'tabular min-h-9 rounded-full border px-3 text-sm font-medium',
                suggestion.stalling
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-accent/40 bg-accent/10 text-accent',
              ].join(' ')}
            >
              {suggestion.stalling ? '↓ ' : '→ '}
              {formatKg(suggestion.weight_kg)} × {suggestion.reps}
            </button>
            <button
              onClick={() => setShowWhy((v) => !v)}
              aria-expanded={showWhy}
              className="min-h-9 text-sm text-text-dim underline underline-offset-4"
            >
              {showWhy ? 'Hide' : 'Why?'}
            </button>
          </div>
          {showWhy && (
            <p className="mt-2 text-xs leading-relaxed text-text-dim">{suggestion.reason}</p>
          )}
        </div>
      )}

      {/* Logged sets. Shown open or closed - between sets, "how many have I
          done" is the question, and putting it behind a tap would be perverse. */}
      {mine.length > 0 && (
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {mine.map((s, i) => (
            <li key={s.id}>
              {editing === s.id ? (
                <EditSetRow
                  set={s}
                  increment={exercise.load_increment_kg}
                  assisted={assisted}
                  onDone={() => setEditing(null)}
                  onSave={(patch) => updateSet(s.id, patch)}
                  onDelete={() => {
                    setEditing(null)
                    void removeSet(s.id)
                  }}
                />
              ) : (
                <button
                  onClick={() => setEditing(s.id)}
                  aria-label={`Edit set: ${formatKg(s.weight_kg)} for ${s.reps} reps`}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
                >
                  {/* The number column counts working sets and nothing else, so
                      it always agrees with the session total underneath. A
                      continuation gets an arrow because it belongs to the set
                      above; a warm-up gets a dot, because numbering it would
                      claim it was set two of the day when it was not. */}
                  <span className="tabular w-5 text-xs text-text-dim">{setLabel(mine, i)}</span>
                  <span className="tabular flex-1 font-medium">
                    {formatKg(s.weight_kg)} × {s.reps}
                  </span>
                  {toKind(s) !== 'working' && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-text-dim">
                      {KINDS.find((k) => k.kind === toKind(s))!.label.toLowerCase()}
                    </span>
                  )}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {active ? (
        <>
          {/* Log a set. Values are pre-filled, so this is one tap.
              Log sits on its own full-width row rather than beside the fields:
              at 390px, two steppered inputs plus a button left the weight input
              about 56px wide, which truncated "62.5" to "6". It is also a
              bigger target and lands in the lower third, where the thumb is. */}
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-end gap-3">
              <NumberField
                label={assisted ? 'Assistance (kg)' : 'Weight (kg)'}
                value={weight}
                onChange={setWeight}
                step={exercise.load_increment_kg || 1}
              />
              <NumberField label="Reps" value={reps} onChange={setReps} step={1} min={1} />
            </div>
            <button
              onClick={() => void logSet()}
              disabled={!canLog}
              className="min-h-14 w-full rounded-lg bg-accent text-lg font-semibold text-accent-text
                         disabled:opacity-40"
            >
              Log set
            </button>
          </div>

          {/* One exclusive choice rather than a checkbox plus a dropdown: the
              combinations those would allow are the ones the database rejects. */}
          <div className="px-4 pb-3">
            <div role="group" aria-label="Set type" className="grid grid-cols-4 gap-1">
              {KINDS.map((k) => {
                const disabled = k.continuation && !canContinue
                return (
                  <button
                    key={k.kind}
                    onClick={() => setKind(k.kind)}
                    disabled={disabled}
                    aria-pressed={kind === k.kind}
                    title={disabled ? 'Log a set first — this one attaches to it' : k.hint}
                    className={[
                      'min-h-11 rounded-lg border text-xs font-medium',
                      kind === k.kind
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface-2 text-text-dim',
                      disabled ? 'opacity-30' : '',
                    ].join(' ')}
                  >
                    {k.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-text-dim">
              {KINDS.find((k) => k.kind === kind)!.hint}
            </p>
          </div>

          {/* This exercise, this session. Not the session note: "left elbow on
              set 3" belongs to the lift, and finding it next time means having
              it on the lift's card rather than in a paragraph about the day. */}
          <div className="px-4 pb-3">
            <NoteField
              id={`note-${workoutId}-${exercise.id}`}
              label={`Note — ${exercise.name}`}
              collapsedLabel="+ Note on this exercise"
              placeholder="Form, pain, setup, anything worth knowing next time."
              rows={2}
              value={note}
              subject={`${workoutId}:${exercise.id}`}
              onSave={async (next) => {
                await saveExerciseNote(workoutId, exercise.id, next)
                scheduleFlush()
              }}
            />
          </div>
        </>
      ) : (
        <>
          {/* A closed card keeps its note visible. It is two lines, and the
              whole point of writing "seat was one notch low" was to read it
              without hunting for it. */}
          {note && (
            <p className="border-t border-border px-4 py-2 text-xs leading-relaxed text-text-dim">
              {note}
            </p>
          )}
          <button
            onClick={onActivate}
            className="min-h-12 w-full border-t border-border text-sm font-medium text-text-dim"
          >
            {mine.length > 0 ? '+ Log another set' : '+ Log a set'}
          </button>
        </>
      )}
    </section>
  )
}

function EditSetRow({
  set,
  increment,
  assisted,
  onSave,
  onDelete,
  onDone,
}: {
  set: WorkoutSet
  increment: number
  assisted: boolean
  onSave: (patch: Partial<WorkoutSet>) => Promise<void>
  onDelete: () => void
  onDone: () => void
}) {
  const [w, setW] = useState(String(set.weight_kg))
  const [r, setR] = useState(String(set.reps))
  const [k, setK] = useState<SetKind>(toKind(set))

  return (
    <div className="flex flex-col gap-2 bg-surface-2 px-4 py-3">
      <div className="flex items-end gap-3">
        <NumberField
          label={assisted ? 'Assistance (kg)' : 'Weight (kg)'}
          value={w}
          onChange={setW}
          step={increment || 1}
        />
        <NumberField label="Reps" value={r} onChange={setR} step={1} min={1} />
      </div>
      {/* Editable here too - a set tagged wrong in the moment is otherwise
          only fixable by deleting and re-logging it. */}
      <div role="group" aria-label="Set type" className="grid grid-cols-4 gap-1">
        {KINDS.map((x) => (
          <button
            key={x.kind}
            onClick={() => setK(x.kind)}
            aria-pressed={k === x.kind}
            title={x.hint}
            className={[
              'min-h-11 rounded-lg border text-xs font-medium',
              k === x.kind
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-surface text-text-dim',
            ].join(' ')}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            await onSave({ weight_kg: Number(w), reps: Number(r), ...fromKind(k) })
            onDone()
          }}
          className="min-h-11 flex-1 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-text"
        >
          Save
        </button>
        <button onClick={onDone} className="min-h-11 rounded-lg border border-border px-3 text-sm">
          Cancel
        </button>
        <button onClick={onDelete} className="min-h-11 rounded-lg px-3 text-sm text-danger">
          Delete
        </button>
      </div>
    </div>
  )
}
