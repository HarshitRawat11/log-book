import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  isWorkingSet,
  setTypeOf,
  type Exercise,
  type SetType,
  type WorkoutSet,
} from '../db/types'
import { deleteRow, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { NumberField } from '../components/NumberField'
import { NoteField } from './NoteField'
import { formatKg, formatKgList, repeatOf, suggestNext } from './progression'
import { nextSetIndex, recentSessions, saveExerciseNote } from './queries'
import { relativeAge, shortDate } from '../lib/dates'

/**
 * What you are about to log. One exclusive choice rather than a warm-up
 * checkbox plus a type dropdown, because the combinations the two would allow
 * are exactly the ones the database rejects - a warm-up drop set is not a
 * thing. `kind` maps onto (is_warmup, set_type).
 */
type SetKind = 'working' | 'warmup' | 'dropset' | 'myorep' | 'myorep_match'

type KindSpec = {
  kind: SetKind
  label: string
  /** The badge on a logged row, where there is room for one word. */
  short: string
  hint: string
  continuation: boolean
}

const KINDS: KindSpec[] = [
  {
    kind: 'working',
    label: 'Working',
    short: 'working',
    hint: 'A set in its own right. Counts everywhere.',
    continuation: false,
  },
  {
    kind: 'warmup',
    label: 'Warm-up',
    short: 'warm-up',
    hint: 'Excluded from tonnage, volume and progression.',
    continuation: false,
  },
  {
    kind: 'dropset',
    label: 'Drop',
    short: 'drop',
    hint: 'Part of the set above. Adds tonnage, but not another working set.',
    continuation: true,
  },
  {
    kind: 'myorep',
    label: 'Myorep',
    short: 'myorep',
    hint: 'A mini-set off the one above, a few breaths apart. Adds tonnage, but not another working set.',
    continuation: true,
  },
  {
    // A whole set, which is what separates it from the myorep above and
    // why it needed its own type rather than a flag on that one.
    kind: 'myorep_match',
    label: 'Match',
    short: 'match',
    hint: 'A full set matching the first set\u2019s weight and reps, resting inside the set to get there. Counts as its own working set.',
    continuation: false,
  },
]

function toKind(s: Pick<WorkoutSet, 'is_warmup' | 'set_type'>): SetKind {
  if (s.is_warmup) return 'warmup'
  const t = setTypeOf(s)
  return t === 'normal' ? 'working' : t
}

const fromKind = (k: SetKind): { is_warmup: boolean; set_type: SetType } => ({
  is_warmup: k === 'warmup',
  set_type: k === 'working' || k === 'warmup' ? 'normal' : k,
})

/**
 * The marker in the leftmost column of a logged set.
 *
 * Working sets are numbered by their position among working sets rather than
 * by row, so the last number in the list always equals the session's
 * working-set total. A continuation gets an arrow, a warm-up a dot.
 *
 * A myorep match is numbered like any other working set, because that is what
 * it is. Read through `isWorkingSet` rather than re-listing the types here:
 * two copies of that rule is how the column and the total stop agreeing.
 */
function setLabel(rows: WorkoutSet[], i: number): string {
  const row = rows[i]!
  if (row.is_warmup) return '·'
  if (!isWorkingSet(row)) return '↳'
  return String(rows.slice(0, i + 1).filter(isWorkingSet).length)
}

/**
 * One exercise inside a session.
 *
 * No modals anywhere in this flow (brief 7.1). Editing a set happens in place,
 * because the alternative is a dialog you have to dismiss while holding a
 * dumbbell.
 *
 * At most one card in a session is OPEN at a time, and it is legitimate for
 * none to be. With every card showing its own weight/reps/Log block, four
 * exercises in you are scrolling past three live forms to reach the one you
 * are actually on, and the wrong one is always the one nearest your thumb. A
 * closed card still shows its header, every set logged against it and its
 * note - that is the part you re-read between sets - and only the input block
 * is put away.
 */
export function ExerciseCard({
  exercise,
  workoutId,
  sets,
  note,
  lastNote,
  active,
  onActivate,
  onCollapse,
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
  /** Whether this is the open card. At most one card per session is. */
  active: boolean
  onActivate: () => void
  /** Put the input block away without opening another card. */
  onCollapse: () => void
  /**
   * Remove this exercise from the session, tombstoning its sets with it. The
   * card owns the confirmation, because it is the thing that knows how many
   * sets are about to go.
   */
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
  const [confirmRemove, setConfirmRemove] = useState(false)
  /**
   * The set just deleted, offered back for a few seconds.
   *
   * Delete sat next to Cancel in the edit row and fired immediately - the only
   * destructive action in the app with neither a confirmation nor a way back.
   * Undo rather than a confirmation on purpose: a dialog in the middle of a
   * session costs a tap every time to guard against the once you mis-tap,
   * whereas this costs nothing until you need it.
   *
   * A delete is a tombstone, so undoing is just clearing `deleted_at` - the
   * row never went anywhere, and the reversal replicates like any other write.
   */
  /**
   * Bring a card into view when you open it.
   *
   * The log block is the bottom half of the card, so opening the fourth or
   * fifth lift put the fields below the fold: you tapped, then scrolled, every
   * time. `block: 'nearest'` moves the minimum needed and does nothing when the
   * card is already visible; `scroll-mt-20` on the section keeps it clear of
   * the sticky header, which scrollIntoView knows nothing about.
   *
   * Three choices here, each of which was got wrong first:
   *
   *  - The TAP arms it, not `active` changing. Watching the prop meant carrying
   *    a "was it already active" ref so the derived default card would not yank
   *    the page on every cold open. A tap is unambiguous - it is the user
   *    asking for this card, and nothing else can trigger it.
   *  - useLayoutEffect, not requestAnimationFrame. The scroll has to happen
   *    after layout, because opening one card closes another and content ABOVE
   *    this one changes height in the same commit - but rAF does not fire at
   *    all on a hidden page, so the scroll silently never happened there.
   *    useLayoutEffect runs after the DOM is updated and before paint, always.
   *  - `auto`, not `smooth`. Nothing else in this app animates: cards open, the
   *    picker appears and the rest bar arrives instantly. A single 300ms pan
   *    would be the odd one out, and mid-session the jump is the faster read.
   */
  const cardRef = useRef<HTMLElement>(null)
  const armed = useRef(false)

  function activate() {
    armed.current = true
    onActivate()
  }

  useLayoutEffect(() => {
    if (!armed.current || !active) return
    armed.current = false
    cardRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
  }, [active])

  const [undoable, setUndoable] = useState<{ id: string; label: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  // A drop or a myorep hangs off the set before it, so neither means anything
  // as the first row of an exercise. If the list is emptied while one is
  // selected, fall back rather than leaving an impossible choice armed.
  const canContinue = mine.length > 0
  useEffect(() => {
    if (!canContinue && (kind === 'dropset' || kind === 'myorep')) setKind('working')
  }, [canContinue, kind])

  /** The set a myorep match is chasing: this session's first working set. */
  const activationSet = useMemo(() => mine.filter(isWorkingSet)[0], [mine])

  /**
   * Pre-fill with a REPEAT of what was actually done - the previous set in this
   * session, else last session's top set. This is a record of fact, not advice,
   * which is what lets "log a set" be one tap. The progression suggestion stays
   * opt-in and pre-fills nothing until tapped (brief 7.2).
   *
   * Two kinds read differently:
   *
   *  - A WARM-UP repeats this session's last warm-up and otherwise clears. The
   *    effect used to ignore the selector, so tapping Warm-up left the working
   *    weight in the field and logging without looking recorded a warm-up at
   *    your top set. There is deliberately no last-session fallback:
   *    `recentSessions` filters to working sets, so last week's warm-ups are
   *    not loaded, and inventing one from the working weight is the bug again.
   *
   *  - A MYOREP MATCH pre-fills from this session's FIRST working set, because
   *    matching that set's weight and reps is the literal definition of the
   *    thing. Taking it from the previous set instead would defeat the point
   *    the moment one match came up short.
   *
   * The dependency is `fill`, not `kind`: drop and myorep genuinely do repeat
   * the working weight - you drop FROM it - and keying on `kind` would reset a
   * number you had just typed every time you tapped between those two.
   */
  const fill = kind === 'warmup' ? 'warmup' : kind === 'myorep_match' ? 'match' : 'working'
  useEffect(() => {
    if (fill === 'warmup') {
      const last = mine.filter((s) => s.is_warmup).sort((a, b) => b.set_index - a.set_index)[0]
      setWeight(last ? String(last.weight_kg) : '')
      setReps(last ? String(last.reps) : '')
      return
    }
    if (fill === 'match' && activationSet) {
      setWeight(String(activationSet.weight_kg))
      setReps(String(activationSet.reps))
      return
    }
    const r = repeatOf(mine, lastSession, assisted)
    setWeight(r ? String(r.weight_kg) : '')
    setReps(r ? String(r.reps) : '')
  }, [mine, lastSession, assisted, fill, activationSet])

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
        ...fromKind(kind),
        source: 'app' as const,
        import_batch_id: null,
      }),
    )
    scheduleFlush()
    // Called from inside the tap, which is what unlocks audio: a context
    // created outside a user gesture stays suspended and silent.
    onSetLogged?.({ warmup: kind === 'warmup', exerciseName: exercise.name })
  }

  async function updateSet(id: string, patch: Partial<WorkoutSet>) {
    await patchRow<WorkoutSet>('sets', id, patch)
    scheduleFlush()
  }

  async function removeSet(id: string) {
    const row = mine.find((s) => s.id === id)
    await deleteRow('sets', id)
    scheduleFlush()
    if (!row) return

    setUndoable({ id, label: `${formatKg(row.weight_kg)} × ${row.reps}` })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    // Long enough to notice and reach, short enough that it is not still
    // sitting there two sets later claiming something is undoable.
    undoTimer.current = setTimeout(() => setUndoable(null), 8000)
  }

  async function undoRemove() {
    if (!undoable) return
    await patchRow<WorkoutSet>('sets', undoable.id, { deleted_at: null })
    scheduleFlush()
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoable(null)
  }

  /**
   * The × in the header.
   *
   * It used to call a handler that silently returned whenever the exercise had
   * any logged sets - so on the one card you would actually want to remove, it
   * did nothing at all and read as broken. The card is derived FROM the sets,
   * so there is no version of this that drops the card and keeps them. The
   * honest options are to say what will be lost or to refuse and explain why;
   * this says what will be lost.
   */
  if (confirmRemove) {
    return (
      <section className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
        <p className="text-sm">
          Remove <strong>{exercise.name}</strong> from this session? Its{' '}
          <strong>
            {mine.length} logged set{mine.length === 1 ? '' : 's'}
          </strong>{' '}
          {mine.length === 1 ? 'goes' : 'go'} with it, on every device. What this lift did in
          other sessions is untouched.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setConfirmRemove(false)
              onRemove()
            }}
            className="min-h-11 flex-1 rounded-lg bg-danger px-3 text-sm font-semibold text-white"
          >
            Remove
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="min-h-11 rounded-lg border border-border px-3 text-sm"
          >
            Cancel
          </button>
        </div>
      </section>
    )
  }

  return (
    <section ref={cardRef} className="scroll-mt-20 rounded-2xl border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 px-4 pt-3">
        {/* min-h-11 is a floor, not a height: the content is usually taller
            than 44px once there is a machine setting or an assisted badge.
            Without it, a bare title plus its meta line came to 42 - two short
            of the minimum, on the control that opens the card. */}
        <button
          onClick={activate}
          aria-expanded={active}
          className="min-h-11 min-w-0 flex-1 text-left"
        >
          <h2 className="truncate font-semibold">{exercise.name}</h2>
          {/* 16px, not 12: this is what you re-read between sets, so gate 7c
              counts it as primary content rather than metadata. */}
          <p className="mt-0.5 text-base text-text-dim">
            {exercise.target_rep_min}–{exercise.target_rep_max} reps
            {lastSession ? (
              <>
                {' · last '}
                {shortDate(lastSession.date)} ({relativeAge(lastSession.date)}){': '}
                {/* Both sides are lists or neither is. This used to pair every
                    set's reps with the session's heaviest load alone, which
                    read as "8/6/5 @ 40 kg" for a session where only the first
                    set was at 40 - the app telling you that you lifted
                    something you did not. */}
                <span className="tabular text-text">
                  {lastSession.sets.map((s) => s.reps).join('/')}{' @ '}
                  {formatKgList(lastSession.sets.map((s) => s.weight_kg))}
                </span>
              </>
            ) : (
              ' · no history yet'
            )}
          </p>
          {/* The setup numbers, at the top of the card, because the moment they
              are useful is standing in front of the machine before set one. */}
          {exercise.machine_setup && (
            <span className="mt-1 inline-block rounded-lg bg-surface-2 px-1.5 py-0.5 text-xs text-text-dim">
              {exercise.machine_setup}
            </span>
          )}
          {/* Stated on the card, not just in the library. Every number below
              means the opposite of what it normally does, and the one place
              that has to be unambiguous is where you are typing them in. */}
          {assisted && (
            <span className="mt-1 ml-1 inline-block rounded-lg bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
              assisted · less is progress
            </span>
          )}
        </button>
        {/* Collapse lives here, NOT on the weight/reps row.
            Putting it there cost the inputs two thirds of their width - the
            weight field measured 25px and clipped "40", which is the same
            "62.5 truncated to 6" failure the layout comment below was written
            about. A chevron beside the remove cross reads as an accordion and
            takes no room from anything. */}
        {active && (
          <button
            onClick={onCollapse}
            aria-label="Hide the log-set controls"
            className="-mt-1 flex size-11 shrink-0 items-center justify-center text-text-dim"
          >
            {/* Inline SVG rather than a glyph: U+2304 renders as a stray,
                differently-baselined "v" next to the × and reads as a typo. */}
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
        <button
          onClick={() => (mine.length > 0 ? setConfirmRemove(true) : onRemove())}
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
                      pr-2 text-xs text-text-dim">
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
                'tabular min-h-11 rounded-full border px-3 text-base font-medium',
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
              className="min-h-11 min-w-11 px-2 text-sm text-text-dim underline underline-offset-4"
            >
              {showWhy ? 'Hide' : 'Why?'}
            </button>
          </div>
          {showWhy && (
            <p className="mt-2 text-xs text-text-dim">{suggestion.reason}</p>
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
                  {/* w-6, not w-5: at 16px two tabular digits need 20px and the
                      old column was exactly that, with nothing left for the
                      arrow a continuation set gets. */}
                  <span className="tabular w-6 text-base text-text-dim">{setLabel(mine, i)}</span>
                  <span className="tabular flex-1 font-medium">
                    {formatKg(s.weight_kg)} × {s.reps}
                  </span>
                  {toKind(s) !== 'working' && (
                    <span className="rounded-lg bg-surface-2 px-1.5 py-0.5 text-xs text-text-dim">
                      {KINDS.find((k) => k.kind === toKind(s))!.short}
                    </span>
                  )}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {undoable && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-1.5">
          <span className="tabular text-xs text-text-dim">Deleted {undoable.label}</span>
          <button
            onClick={() => void undoRemove()}
            className="min-h-11 shrink-0 text-sm font-semibold text-accent"
          >
            Undo
          </button>
        </div>
      )}

      {active ? (
        <>
          {/* Log a set. Values are pre-filled, so this is one tap.
              Log sits on its own full-width row rather than beside the fields:
              at 390px, two steppered inputs plus a button left the weight input
              about 56px wide, which truncated "62.5" to "6". It is also a
              bigger target and lands in the lower third, where the thumb is. */}
          <div className="flex flex-col gap-2 px-4 pb-2 pt-3">
            <div className="flex items-end gap-3">
              {/* Weight takes the larger share: it holds "137.5", reps holds
                  "12". Split evenly the weight box clipped its own value. */}
              <NumberField
                label={assisted ? 'Assistance (kg)' : 'Weight (kg)'}
                value={weight}
                onChange={setWeight}
                step={exercise.load_increment_kg || 1}
                grow={1.25}
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
              combinations those would allow are the ones the database rejects.

              One row of five, not two of three. At 375px each cell is about
              65px, which fits every label at text-xs - the earlier worry that
              it would not was wrong, and it cost a whole 44px row on the
              tallest block in the app. The per-type explanation that sat under
              this is gone with it: it is a `title` on each button, and the
              README has the table. */}
          <div className="px-4 pb-2">
            <div role="group" aria-label="Set type" className="grid grid-cols-5 gap-1">
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
                      'min-h-11 rounded-lg border px-0.5 text-xs font-medium',
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
          </div>

          {/* This exercise, this session. Not the session note: "left elbow on
              set 3" belongs to the lift, and finding it next time means having
              it on the lift's card rather than in a paragraph about the day. */}
          <div className="px-4 pb-2">
            <NoteField
              id={`note-${workoutId}-${exercise.id}`}
              label={`Note — ${exercise.name}`}
              collapsedLabel="+ Note"
              collapsedClassName="min-h-11 text-sm font-medium text-text-dim"
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
            <p className="border-t border-border px-4 py-2 text-xs text-text-dim">
              {note}
            </p>
          )}
          <button
            onClick={activate}
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
          grow={1.25}
        />
        <NumberField label="Reps" value={r} onChange={setR} step={1} min={1} />
      </div>
      {/* Editable here too - a set tagged wrong in the moment is otherwise
          only fixable by deleting and re-logging it. */}
      <div role="group" aria-label="Set type" className="grid grid-cols-3 gap-1">
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
