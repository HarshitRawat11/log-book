import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { nowIso, putRow, requireUserId } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Profile } from '../db/types'
import { NumberField } from '../components/NumberField'
import { mifflinStJeorBMR } from './macros'

/**
 * Daily macro targets, set by hand, plus an optional BMR estimate to start from.
 */
export function Targets() {
  const profile = useLiveQuery(async () => (await db.profile.toArray())[0] ?? null, [], undefined)
  const [open, setOpen] = useState(false)

  if (profile === undefined) return null

  return (
    <>
      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Daily targets</h2>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-14 w-full items-center justify-between rounded-2xl border
                     border-border bg-surface px-4"
        >
          <span className="tabular text-sm">
            {profile?.kcal_target
              ? `${Math.round(profile.kcal_target)} kcal · P${Math.round(profile.protein_g_target ?? 0)} · C${Math.round(profile.carbs_g_target ?? 0)} · F${Math.round(profile.fat_g_target ?? 0)}`
              : 'Not set'}
          </span>
          <span aria-hidden="true" className="text-text-dim">
            ›
          </span>
        </button>
      ) : (
        <TargetsForm profile={profile} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

async function saveProfile(existing: Profile | null, patch: Partial<Profile>) {
  const base: Profile = existing ?? {
    user_id: requireUserId(),
    kcal_target: null,
    protein_g_target: null,
    carbs_g_target: null,
    fat_g_target: null,
    height_cm: null,
    birth_date: null,
    sex: null,
    updated_at: nowIso(),
    deleted_at: null,
  }
  /**
   * No `id` field. profile is keyed by user_id and the table has no `id`
   * column at all.
   *
   * This used to synthesise one so the outbox could key on it, and the server
   * rejected every push as a result - PGRST204, "Could not find the 'id'
   * column of 'profile'". Targets saved locally and never once reached
   * Supabase. The outbox now keys on each table's real primary key, so the
   * invention is unnecessary; `id` is stripped below because rows written by
   * the old code still carry it locally and would keep failing.
   */
  const { id: _legacyId, ...clean } = { ...base, ...patch } as Profile & { id?: string }
  void _legacyId
  await putRow('profile', clean)
  scheduleFlush()
}

function TargetsForm({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const [kcal, setKcal] = useState(String(profile?.kcal_target ?? ''))
  const [protein, setProtein] = useState(String(profile?.protein_g_target ?? ''))
  const [carbs, setCarbs] = useState(String(profile?.carbs_g_target ?? ''))
  const [fat, setFat] = useState(String(profile?.fat_g_target ?? ''))
  const [showBmr, setShowBmr] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex gap-3">
        <NumberField label="kcal" value={kcal} onChange={setKcal} step={50} />
        <NumberField label="Protein g" value={protein} onChange={setProtein} step={5} />
      </div>
      <div className="mt-3 flex gap-3">
        <NumberField label="Carbs g" value={carbs} onChange={setCarbs} step={5} />
        <NumberField label="Fat g" value={fat} onChange={setFat} step={5} />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={async () => {
            await saveProfile(profile, {
              kcal_target: kcal === '' ? null : Number(kcal),
              protein_g_target: protein === '' ? null : Number(protein),
              carbs_g_target: carbs === '' ? null : Number(carbs),
              fat_g_target: fat === '' ? null : Number(fat),
            })
            onClose()
          }}
          className="min-h-12 flex-1 rounded-lg bg-accent font-semibold text-accent-text"
        >
          Save
        </button>
        <button onClick={onClose} className="min-h-12 rounded-lg border border-border px-4">
          Cancel
        </button>
      </div>

      <button
        onClick={() => setShowBmr((v) => !v)}
        className="mt-3 min-h-11 text-sm text-accent underline underline-offset-4"
      >
        {showBmr ? 'Hide' : 'Estimate from BMR'}
      </button>
      {showBmr && <BmrCalculator onUse={(k) => setKcal(String(k))} />}
    </div>
  )
}

function BmrCalculator({ onUse }: { onUse: (kcal: number) => void }) {
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')
  const [activity, setActivity] = useState('1.55')

  const ready = weight && height && age
  const bmr = ready
    ? mifflinStJeorBMR({
        weightKg: Number(weight),
        heightCm: Number(height),
        ageYears: Number(age),
        sex: 'male',
      })
    : null
  const tdee = bmr ? Math.round(bmr * Number(activity)) : null

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex gap-3">
        <NumberField label="Weight kg" value={weight} onChange={setWeight} step={1} />
        <NumberField label="Height cm" value={height} onChange={setHeight} step={1} />
      </div>
      <div className="mt-3 flex gap-3">
        <NumberField label="Age" value={age} onChange={setAge} step={1} />
        <label className="flex-1">
          <span className="mb-1 block text-xs text-text-dim">Activity</span>
          <select
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="h-12 w-full rounded-lg border border-border bg-surface px-2 text-sm
                       outline-none focus:border-accent"
          >
            <option value="1.2">Sedentary</option>
            <option value="1.375">Light</option>
            <option value="1.55">Moderate</option>
            <option value="1.725">Heavy</option>
          </select>
        </label>
      </div>

      {bmr && (
        <>
          <p className="tabular mt-3 text-sm">
            BMR <span className="font-semibold">{bmr}</span> kcal · maintenance ≈{' '}
            <span className="font-semibold">{tdee}</span> kcal
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            Mifflin-St Jeor. This is a <em>starting estimate</em>, not a prescription — the only
            number that settles it is your own bodyweight trend over a few weeks. Adjust from here.
          </p>
          <button
            onClick={() => tdee && onUse(tdee)}
            className="mt-2 min-h-11 text-sm text-accent underline underline-offset-4"
          >
            Use {tdee} as my kcal target
          </button>
        </>
      )}
    </div>
  )
}
