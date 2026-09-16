import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { NumberField } from '../components/NumberField'
import { db } from '../db/db'
import { alive, newRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Bodyweight } from '../db/types'
import {
  bodyweightSeries,
  e1rmSeries,
  tonnageSeries,
  weeklyWorkingSets,
} from '../training/analytics'
import {
  BodyweightChart,
  ChartCard,
  Legend,
  SERIES,
  StackedWeeks,
  TimeBars,
  TimeLine,
} from '../training/charts'
import { listAllExercises, listExercises, recentSessions } from '../training/queries'
import { listSessions } from '../cardio/queries'
import { weeklyCardio } from '../cardio/analytics'
import { todayIso } from '../lib/dates'

/**
 * Progress.
 *
 * Four views, each answering one question: is this lift getting stronger, is
 * the session getting bigger, is the weekly volume where I want it, and is
 * bodyweight trending.
 */
export function Progress() {
  const exercises = useLiveQuery(() => listExercises(true), [], [])
  // The weekly chart maps sets to muscle groups, so it needs EVERY exercise:
  // looked up in the offerable list, an archived lift's sets fall out of the
  // group map and silently vanish from the volume history.
  const everyExercise = useLiveQuery(listAllExercises, [], [])
  const [exerciseId, setExerciseId] = useState<string>('')

  // Default to the lift trained most recently rather than the alphabetically
  // first one - "Barbell curl" is nobody's idea of the headline chart.
  const lastTrained = useLiveQuery(async () => {
    const [sets, workouts] = await Promise.all([
      db.sets.toArray().then(alive),
      db.workouts.toArray().then(alive),
    ])
    const dateOf = new Map(workouts.map((w) => [w.id, w.date]))
    let best: { id: string; date: string } | null = null
    for (const s of sets) {
      const date = dateOf.get(s.workout_id)
      if (!date) continue
      if (!best || date > best.date) best = { id: s.exercise_id, date }
    }
    return best?.id ?? ''
  }, [], '')

  const selected = exerciseId || lastTrained || exercises?.[0]?.id || ''

  const sessions = useLiveQuery(
    async () => (selected ? await recentSessions(selected, { limit: 60 }) : []),
    [selected],
    [],
  )
  const workouts = useLiveQuery(
    async () => alive(await db.workouts.toArray()).map((w) => ({ id: w.id, date: w.date })),
    [],
    [],
  )
  const sets = useLiveQuery(async () => alive(await db.sets.toArray()), [], [])
  const weights = useLiveQuery(async () => alive(await db.bodyweight.toArray()), [], [])
  const cardio = useLiveQuery(listSessions, [], [])

  const e1rm = useMemo(() => e1rmSeries(sessions ?? []), [sessions])
  const tonnage = useMemo(() => tonnageSeries(workouts ?? [], sets ?? []), [workouts, sets])
  const bw = useMemo(() => bodyweightSeries(weights ?? []), [weights])

  // Cap the stack at six groups plus Other. A ninth categorical hue is never
  // generated - past the validated slots, series fold into "Other".
  const weekly = useMemo(() => {
    const rows = weeklyWorkingSets(workouts ?? [], sets ?? [], everyExercise ?? [], 12)
    const totals = new Map<string, number>()
    for (const r of rows) {
      for (const [k, v] of Object.entries(r)) {
        if (k === 'week' || k === 'total') continue
        totals.set(k, (totals.get(k) ?? 0) + (v as number))
      }
    }
    const top = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k)

    const folded = rows.map((r) => {
      const out: Record<string, string | number> = { week: r.week }
      let other = 0
      for (const [k, v] of Object.entries(r)) {
        if (k === 'week' || k === 'total') continue
        if (top.includes(k)) out[k] = v as number
        else other += v as number
      }
      if (other > 0) out.Other = other
      return out
    })
    const keys = [...top, ...(folded.some((r) => r.Other) ? ['Other'] : [])]
    return { rows: folded, keys }
  }, [workouts, sets, everyExercise])

  const cardioWeeks = useMemo(() => weeklyCardio(cardio ?? [], 12), [cardio])

  const hasTraining = (sets ?? []).length > 0

  return (
    <Screen title="Progress" actions={<SyncPill />}>
      <div className="flex flex-col gap-3 pb-4">
        <BodyweightCard series={bw} />

        {!hasTraining ? (
          <EmptyState
            title="No training data yet"
            body="Log a few sessions and this fills in: estimated 1RM per lift, tonnage per session, and weekly working sets by muscle group."
          />
        ) : (
          <>
            <ChartCard
              title="Estimated 1RM"
              right={
                <select
                  value={selected}
                  onChange={(e) => setExerciseId(e.target.value)}
                  className="max-w-40 rounded-lg border border-border bg-surface-2 px-2 py-1
                             text-xs outline-none"
                >
                  {(exercises ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              }
              note={
                <>
                  Epley: weight × (1 + reps/30). An <strong>estimate</strong> — its accuracy
                  degrades materially above roughly 10–12 reps, so treat a number from a set of
                  fifteen with suspicion.
                </>
              }
              empty={e1rm.length === 0 ? 'No working sets logged for this exercise yet.' : undefined}
            >
              <TimeLine data={e1rm} unit="kg" />
              {e1rm.length > 0 && (
                <p className="tabular mt-1 text-xs text-text-dim">
                  Latest <span className="text-text">{e1rm[e1rm.length - 1]!.value}kg</span> ·{' '}
                  {e1rm.length} session{e1rm.length === 1 ? '' : 's'}
                </p>
              )}
            </ChartCard>

            <ChartCard
              title="Session tonnage"
              note="Weight × reps across working sets. Warm-ups excluded."
              empty={tonnage.length === 0 ? 'No working sets logged yet.' : undefined}
            >
              <TimeBars data={tonnage} unit="kg" />
            </ChartCard>

            <WeeklyVolumeCard rows={weekly.rows} keys={weekly.keys} />
          </>
        )}

        {/* Two measures on two different scales - a count and a duration - so
            two charts. Never one chart with two y-axes: the reader cannot tell
            which line belongs to which scale, and the crossing point is an
            artefact of where the axes were put. */}
        {cardioWeeks.length > 0 && (
          <>
            <ChartCard
              title="Cardio sessions"
              note="Completed sessions per ISO week, whether they ran to the end or not."
            >
              <StackedWeeks data={cardioWeeks} keys={['sessions']} />
            </ChartCard>

            <ChartCard
              title="Cardio work"
              note="Minutes of work per ISO week — rounds actually completed, breaks excluded. Forty minutes on the clock with 2:00 rests is thirty minutes of work."
            >
              <StackedWeeks data={cardioWeeks} keys={['workMinutes']} />
            </ChartCard>
          </>
        )}
      </div>
    </Screen>
  )
}

function WeeklyVolumeCard({
  rows,
  keys,
}: {
  rows: Array<Record<string, string | number>>
  keys: string[]
}) {
  // The light-mode palette puts three slots below 3:1 on white, which obliges
  // relief: a table view carrying the same numbers. It is also just useful -
  // you can read exact counts off it.
  const [asTable, setAsTable] = useState(false)

  return (
    <ChartCard
      title="Weekly working sets"
      right={
        <button
          onClick={() => setAsTable((v) => !v)}
          className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs
                     text-text-dim"
        >
          {asTable ? 'Chart' : 'Table'}
        </button>
      }
      note="Non-warm-up sets per ISO week. Each exercise counts towards one muscle group, so compound lifts do not add to their secondary movers."
      empty={rows.length === 0 ? 'No working sets logged yet.' : undefined}
    >
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-xs">
            <thead>
              <tr className="text-text-dim">
                <th className="py-1 pr-2 text-left font-medium">Week</th>
                {keys.map((k) => (
                  <th key={k} className="px-1 py-1 text-right font-medium capitalize">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={String(r.week)} className="border-t border-border">
                  <td className="py-1 pr-2">{String(r.week).split('-W')[1]}</td>
                  {keys.map((k) => (
                    <td key={k} className="px-1 py-1 text-right">
                      {(r[k] as number) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <StackedWeeks data={rows} keys={keys} />
          <Legend items={keys.map((k, i) => ({ label: k, color: SERIES[i % SERIES.length]! }))} />
        </>
      )}
    </ChartCard>
  )
}

function BodyweightCard({ series }: { series: ReturnType<typeof bodyweightSeries> }) {
  const [adding, setAdding] = useState(false)
  const [kg, setKg] = useState('')
  const today = todayIso()
  const latest = series[series.length - 1]

  async function save() {
    const weight = Number(kg)
    if (!weight) return
    // One entry per date: replace today's rather than adding a second, which
    // the unique index would reject on sync anyway.
    const existing = alive(await db.bodyweight.where('date').equals(today).toArray())[0]
    if (existing) {
      await putRow('bodyweight', { ...existing, weight_kg: weight })
    } else {
      await putRow('bodyweight', newRow({ date: today, weight_kg: weight }) as Bodyweight)
    }
    scheduleFlush()
    setKg('')
    setAdding(false)
  }

  return (
    <ChartCard
      title="Bodyweight"
      right={
        !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs
                       text-text-dim"
          >
            + Log
          </button>
        )
      }
      note={
        series.length > 0
          ? 'The 7-day average is what to read — daily readings swing several hundred grams on water and food alone.'
          : undefined
      }
      empty={series.length === 0 && !adding ? 'No weigh-ins yet. Log one to start the trend.' : undefined}
    >
      {adding && (
        <div className="mb-3">
          <NumberField label="Weight today (kg)" value={kg} onChange={setKg} step={0.1} min={1} />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void save()}
              disabled={!kg}
              className="min-h-11 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-text
                         disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              className="min-h-11 rounded-lg border border-border px-4 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {series.length > 0 && (
        <>
          <p className="tabular mb-1 text-2xl font-semibold">
            {latest!.ma7 ?? latest!.value}
            <span className="ml-1 text-sm font-normal text-text-dim">
              kg {latest!.ma7 ? '7-day avg' : 'latest'}
            </span>
          </p>
          <BodyweightChart data={series} />
          <Legend
            items={[
              { label: 'Daily', color: 'var(--text-dim)' },
              { label: '7-day average', color: SERIES[0]! },
            ]}
          />
        </>
      )}
    </ChartCard>
  )
}
