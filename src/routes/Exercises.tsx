import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { deleteRow, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { EQUIPMENT, MUSCLE_GROUPS, type Equipment, type Exercise, type MuscleGroup } from '../db/types'
import { listExercises } from '../training/queries'

type Draft = {
  name: string
  muscle_group: MuscleGroup
  equipment: Equipment
  target_rep_min: string
  target_rep_max: string
  load_increment_kg: string
  min_weight_kg: string
  machine_setup: string
  load_is_assistance: boolean
}

const blank: Draft = {
  name: '',
  muscle_group: 'chest',
  equipment: 'barbell',
  target_rep_min: '8',
  target_rep_max: '12',
  load_increment_kg: '2.5',
  min_weight_kg: '20',
  machine_setup: '',
  load_is_assistance: false,
}

function toDraft(e: Exercise): Draft {
  return {
    name: e.name,
    muscle_group: e.muscle_group,
    equipment: e.equipment,
    target_rep_min: String(e.target_rep_min),
    target_rep_max: String(e.target_rep_max),
    load_increment_kg: String(e.load_increment_kg),
    min_weight_kg: String(e.min_weight_kg),
    machine_setup: e.machine_setup ?? '',
    load_is_assistance: e.load_is_assistance ?? false,
  }
}

export function Exercises() {
  const exercises = useLiveQuery(() => listExercises(true), [], [])
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(blank)

  function startNew() {
    setDraft(blank)
    setEditing('new')
  }

  function startEdit(e: Exercise) {
    setDraft(toDraft(e))
    setEditing(e.id)
  }

  async function save() {
    const fields = {
      name: draft.name.trim(),
      muscle_group: draft.muscle_group,
      equipment: draft.equipment,
      target_rep_min: Number(draft.target_rep_min),
      target_rep_max: Number(draft.target_rep_max),
      load_increment_kg: Number(draft.load_increment_kg),
      min_weight_kg: Number(draft.min_weight_kg),
      // Empty means "no setup to remember", which is null and not '' - an
      // empty string would render as a blank badge on the logging screen.
      machine_setup: draft.machine_setup.trim() || null,
      load_is_assistance: draft.load_is_assistance,
    }
    if (!fields.name) return
    if (fields.target_rep_max < fields.target_rep_min) return

    if (editing === 'new') {
      await putRow('exercises', newRow({ ...fields, archived: false }) as Exercise)
    } else if (editing) {
      await patchRow<Exercise>('exercises', editing, fields)
    }
    scheduleFlush()
    setEditing(null)
  }

  return (
    <Screen
      title="Exercises"
      subtitle={`${(exercises ?? []).filter((e) => !e.archived).length} in library`}
      actions={<SyncPill />}
    >
      {editing ? (
        <EditorForm
          draft={draft}
          setDraft={setDraft}
          onSave={() => void save()}
          onCancel={() => setEditing(null)}
          onDelete={
            editing !== 'new'
              ? async () => {
                  await deleteRow('exercises', editing)
                  scheduleFlush()
                  setEditing(null)
                }
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <button
            onClick={startNew}
            className="min-h-14 w-full rounded-xl bg-accent px-4 font-semibold text-accent-text"
          >
            + New exercise
          </button>

          {(exercises ?? []).length === 0 ? (
            <EmptyState
              title="Library is empty"
              body="Add the lifts you actually do. Each one needs a rep range and a load increment — that is what double progression reasons from."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {exercises!.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => startEdit(e)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={e.archived ? 'text-text-dim line-through' : ''}>{e.name}</span>
                      <span className="tabular mt-0.5 block text-xs text-text-dim">
                        {e.muscle_group} · {e.equipment} · {e.target_rep_min}–{e.target_rep_max} reps
                        {' · '}
                        {e.load_is_assistance ? '−' : '+'}
                        {e.load_increment_kg}&nbsp;kg
                      </span>
                      {e.machine_setup && (
                        <span className="mt-0.5 block text-xs text-text-dim">
                          {e.machine_setup}
                        </span>
                      )}
                      {e.load_is_assistance && (
                        <span className="mt-0.5 block text-xs text-accent">
                          assisted · less is progress
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/train"
            className="flex min-h-11 w-fit items-center rounded-full border border-border
                       bg-surface-2 px-3 text-sm font-medium text-text-dim active:bg-border"
          >
            ‹ Today's session
          </Link>
        </div>
      )}
    </Screen>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-dim">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'min-h-12 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent'

function EditorForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => Promise<void>
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v })
  const rangeBad = Number(draft.target_rep_max) < Number(draft.target_rep_min)

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Field label="Name">
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Bench press"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Muscle group">
          <select
            value={draft.muscle_group}
            onChange={(e) => set('muscle_group', e.target.value as MuscleGroup)}
            className={inputCls}
          >
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Equipment">
          <select
            value={draft.equipment}
            onChange={(e) => set('equipment', e.target.value as Equipment)}
            className={inputCls}
          >
            {EQUIPMENT.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Target reps, min">
          <input
            inputMode="numeric"
            value={draft.target_rep_min}
            onChange={(e) => set('target_rep_min', e.target.value.replace(/\D/g, ''))}
            className={inputCls}
          />
        </Field>
        <Field label="Target reps, max">
          <input
            inputMode="numeric"
            value={draft.target_rep_max}
            onChange={(e) => set('target_rep_max', e.target.value.replace(/\D/g, ''))}
            className={inputCls}
          />
        </Field>
      </div>
      {rangeBad && <p className="-mt-2 text-xs text-danger">Max reps must be at least min reps.</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Load increment (kg)">
          <input
            inputMode="decimal"
            value={draft.load_increment_kg}
            onChange={(e) => set('load_increment_kg', e.target.value.replace(/[^0-9.]/g, ''))}
            className={inputCls}
          />
        </Field>
        <Field label="Lightest loadable (kg)">
          <input
            inputMode="decimal"
            value={draft.min_weight_kg}
            onChange={(e) => set('min_weight_kg', e.target.value.replace(/[^0-9.]/g, ''))}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Machine setting (optional)">
        <input
          value={draft.machine_setup}
          onChange={(e) => set('machine_setup', e.target.value)}
          placeholder="seat 1, pin 3"
          className={inputCls}
        />
      </Field>
      <p className="-mt-3 text-xs leading-relaxed text-text-dim">
        Seat, pin or notch numbers — whatever makes the machine repeatable. Shown on the logging
        screen. Keep it out of the name: rename an exercise when the seat moves and it becomes a
        second exercise, which breaks its progression and its 1RM chart.
      </p>
      <p className="-mt-2 text-xs text-text-dim">
        Lightest loadable is the empty bar, or the lightest pin on a machine. A deload will never
        suggest less than this.
        {draft.load_is_assistance && ' On an assisted machine it is the least help the stack offers — progression stops there.'}
      </p>

      {/* A toggle rather than a negative increment. The direction is only one
          of the things that invert, and the rest - which set counts as the top
          one, whether the weight belongs in tonnage, whether a 1RM means
          anything - would all still have needed a flag. */}
      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
        <input
          type="checkbox"
          checked={draft.load_is_assistance}
          onChange={(e) => set('load_is_assistance', e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">The machine assists me</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-text-dim">
            Assisted pull-up or dip: the stack counterweights you, so{' '}
            <strong>less weight is harder</strong>. Progression takes weight off, a deload puts it
            back, and the hardest set of a session is the lightest one. The weight is the
            machine's work rather than yours, so it is left out of tonnage, and the estimated 1RM
            chart is replaced by an assistance chart — Epley needs the load you moved, and that
            is your bodyweight minus this number.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!draft.name.trim() || rangeBad}
          className="min-h-14 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-text
                     disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={onCancel} className="min-h-14 rounded-xl border border-border px-4">
          Cancel
        </button>
      </div>
      {onDelete && (
        <ConfirmDelete
          label="Delete exercise"
          warning={
            <>
              Delete <strong>{draft.name || 'this exercise'}</strong>? Past sessions keep it and its
              sets, but it stops being offered when you add a lift, and its 1RM chart goes with it.
              If you have simply stopped doing it,{' '}
              <strong>archiving</strong> keeps the chart and hides it from the picker.
            </>
          }
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}
