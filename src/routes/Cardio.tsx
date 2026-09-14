import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { SyncPill } from '../components/SyncPill'
import type { CardioPreset } from '../db/types'
import {
  STARTER_PRESETS,
  lastUsedPresetId,
  listPresets,
  rememberPreset,
  savePreset,
} from '../cardio/queries'
import { createOutput, ensureContext, playTestSequence } from '../cardio/audio'
import { humanDuration, mmss, totalSeconds } from '../cardio/schedule'

/**
 * Pre-session configuration. Bare-handed, so normal-sized controls are fine -
 * everything here happens before the gloves go on.
 *
 * Durations are entered as minutes plus seconds rather than raw seconds: a
 * five-minute round is "5 / 00", not "300", and a HIIT interval is "0 / 20".
 * One box would make one of those two cases silly.
 */

type Draft = {
  activity: string
  workMin: string
  workSec: string
  breakMin: string
  breakSec: string
  rounds: string
}

const toDraft = (p: CardioPreset): Draft => ({
  activity: p.activity,
  workMin: String(Math.floor(p.work_seconds / 60)),
  workSec: String(p.work_seconds % 60),
  breakMin: String(Math.floor(p.break_seconds / 60)),
  breakSec: String(p.break_seconds % 60),
  rounds: String(p.rounds),
})

const BLANK: Draft = {
  activity: 'kickboxing',
  workMin: '5',
  workSec: '0',
  breakMin: '2',
  breakSec: '0',
  rounds: '6',
}

const secs = (m: string, s: string) => (Number(m) || 0) * 60 + (Number(s) || 0)
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 3)

export function Cardio() {
  const presets = useLiveQuery(listPresets, [], [])
  const remembered = useLiveQuery(lastUsedPresetId, [], null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [touched, setTouched] = useState(false)
  const [testing, setTesting] = useState(false)

  // Open on the last preset used, as asked. Only until the first edit - after
  // that the draft is the user's and must not be overwritten by a live query.
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (touched || !presets?.length) return
    const target = presets.find((p) => p.id === remembered) ?? presets[0]!
    if (applied.current === target.id) return
    applied.current = target.id
    setSelectedId(target.id)
    setDraft(toDraft(target))
  }, [presets, remembered, touched])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setTouched(true)
    setDraft((d) => ({ ...d, [k]: v }))
  }

  const config = useMemo(
    () => ({
      work_seconds: secs(draft.workMin, draft.workSec),
      break_seconds: secs(draft.breakMin, draft.breakSec),
      rounds: Number(draft.rounds) || 0,
    }),
    [draft],
  )

  const valid = config.work_seconds > 0 && config.rounds > 0
  const selected = presets?.find((p) => p.id === selectedId) ?? null

  const missingStarters = useMemo(
    () =>
      STARTER_PRESETS.filter(
        (s) => !(presets ?? []).some((p) => p.name.toLowerCase() === s.name.toLowerCase()),
      ),
    [presets],
  )
  const changed =
    selected !== null &&
    (selected.work_seconds !== config.work_seconds ||
      selected.break_seconds !== config.break_seconds ||
      selected.rounds !== config.rounds ||
      selected.activity !== draft.activity)

  // One context for the life of the screen. Created inside the test-sound tap,
  // never before: a context built outside a user gesture starts suspended and
  // stays silent with no error anywhere.
  const audio = useRef<{ ctx: AudioContext; out: GainNode } | null>(null)
  async function testSound() {
    setTesting(true)
    try {
      const ctx = await ensureContext(audio.current?.ctx)
      if (!audio.current) audio.current = { ctx, out: createOutput(ctx) }
      await playTestSequence(audio.current.ctx, audio.current.out)
    } finally {
      setTimeout(() => setTesting(false), 5600)
    }
  }
  useEffect(() => () => void audio.current?.ctx.close(), [])

  async function pick(p: CardioPreset) {
    setSelectedId(p.id)
    setDraft(toDraft(p))
    setTouched(false)
    applied.current = p.id
    await rememberPreset(p.id)
  }

  return (
    <Screen title="Cardio" actions={<SyncPill />}>
      <div className="flex flex-col gap-4 pb-4">
        {(presets ?? []).length > 0 && (
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-2">
              {presets!.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void pick(p)}
                  className={[
                    'min-h-11 shrink-0 rounded-full border px-3 text-sm font-medium',
                    p.id === selectedId
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-text-dim',
                  ].join(' ')}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Offered per starter still missing, not just while the list is empty:
            adding Kickboxing must not take the HIIT offer away with it. */}
        {missingStarters.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">
              {(presets ?? []).length === 0 ? 'No presets yet' : 'Add a starter preset'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-text-dim">
              Start from one of these and adjust it, or set the durations below and save your own.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missingStarters.map((s) => (
                <button
                  key={s.name}
                  onClick={() => void savePreset({ ...s })}
                  className="min-h-11 rounded-full border border-accent/40 bg-accent/10 px-3
                             text-sm font-medium text-accent"
                >
                  + {s.name} ({mmss(s.work_seconds)}/{mmss(s.break_seconds)} × {s.rounds})
                </button>
              ))}
            </div>
          </section>
        )}

        <Field label="Activity">
          <input
            value={draft.activity}
            onChange={(e) => set('activity', e.target.value)}
            placeholder="kickboxing"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Duration
            label="Round"
            min={draft.workMin}
            sec={draft.workSec}
            onMin={(v) => set('workMin', digits(v))}
            onSec={(v) => set('workSec', digits(v))}
          />
          <Duration
            label="Break"
            min={draft.breakMin}
            sec={draft.breakSec}
            onMin={(v) => set('breakMin', digits(v))}
            onSec={(v) => set('breakSec', digits(v))}
          />
        </div>

        <Field label="Rounds">
          <input
            inputMode="numeric"
            value={draft.rounds}
            onChange={(e) => set('rounds', digits(e.target.value))}
            className={inputCls}
          />
        </Field>

        {/* Total before committing, not discovered at minute 40. */}
        <section className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-2xl font-semibold">
            {valid ? humanDuration(totalSeconds(config)) : '—'}
          </p>
          <p className="mt-0.5 text-xs text-text-dim">
            {valid
              ? `${config.rounds} × ${mmss(config.work_seconds)} work` +
                (config.break_seconds > 0
                  ? `, ${mmss(config.break_seconds)} break between`
                  : ', continuous')
              : 'Set a round length and a number of rounds.'}
          </p>
        </section>

        {/* Volume check while hands are still free. Also the user gesture that
            unlocks the AudioContext - discovering it is muted is a two-minute
            problem now and a ruined session later. */}
        <button
          onClick={() => void testSound()}
          disabled={testing}
          className="min-h-12 w-full rounded-xl border border-border bg-surface font-medium
                     disabled:opacity-50"
        >
          {testing ? 'Playing all four cues…' : 'Test sound'}
        </button>

        {(changed || !selected) && valid && (
          <SavePreset
            existing={changed ? selected : null}
            fields={{ ...config, activity: draft.activity.trim() || 'other' }}
            onSaved={(p) => void pick(p)}
          />
        )}

        <button
          disabled
          className="min-h-16 w-full rounded-xl bg-accent text-lg font-semibold text-accent-text
                     disabled:opacity-40"
        >
          Start session
        </button>
        <p className="-mt-2 text-center text-xs text-text-dim">
          The timer engine lands in the next step — start is deliberately inert until then.
        </p>
      </div>
    </Screen>
  )
}

const inputCls =
  'min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-dim">{label}</span>
      {children}
    </label>
  )
}

function Duration({
  label,
  min,
  sec,
  onMin,
  onSec,
}: {
  label: string
  min: string
  sec: string
  onMin: (v: string) => void
  onSec: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-dim">{label}</span>
      <div className="flex items-center gap-1">
        <input
          inputMode="numeric"
          value={min}
          onChange={(e) => onMin(e.target.value)}
          aria-label={`${label} minutes`}
          className={`${inputCls} tabular text-center`}
        />
        <span className="text-text-dim">:</span>
        <input
          inputMode="numeric"
          value={sec}
          onChange={(e) => onSec(e.target.value)}
          aria-label={`${label} seconds`}
          className={`${inputCls} tabular text-center`}
        />
      </div>
    </div>
  )
}

function SavePreset({
  existing,
  fields,
  onSaved,
}: {
  existing: CardioPreset | null
  fields: { activity: string; work_seconds: number; break_seconds: number; rounds: number }
  onSaved: (p: CardioPreset) => void
}) {
  const [name, setName] = useState('')
  const [naming, setNaming] = useState(false)

  if (existing && !naming) {
    return (
      <div className="flex gap-2">
        <button
          onClick={async () => onSaved(await savePreset({ ...fields, name: existing.name }, existing))}
          className="min-h-12 flex-1 rounded-xl border border-border bg-surface text-sm font-medium"
        >
          Update “{existing.name}”
        </button>
        <button
          onClick={() => setNaming(true)}
          className="min-h-12 rounded-xl border border-border bg-surface px-4 text-sm"
        >
          Save as new
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name"
        className={inputCls}
      />
      <button
        onClick={async () => {
          if (!name.trim()) return
          onSaved(await savePreset({ ...fields, name: name.trim() }))
          setName('')
          setNaming(false)
        }}
        disabled={!name.trim()}
        className="min-h-12 shrink-0 rounded-xl border border-border bg-surface px-4 text-sm
                   font-medium disabled:opacity-40"
      >
        Save
      </button>
    </div>
  )
}
