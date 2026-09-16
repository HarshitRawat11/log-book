import type { CardioSession } from '../db/types'
import { isoWeek } from '../lib/dates'

/**
 * Cardio rollups. Pure functions over loaded rows, like training analytics.
 */

export type CardioWeek = { week: string; sessions: number; workMinutes: number }

/**
 * Sessions and work-minutes per ISO week.
 *
 * Work minutes count `rounds_completed`, not `rounds_planned`: the question is
 * how much work was done, and a session abandoned at round three of eight did
 * three rounds of work no matter what it set out to do.
 *
 * Breaks are excluded. Forty minutes on the clock with 2-minute rests is
 * thirty minutes of work, and calling it forty would flatter every week.
 *
 * Sessions still in progress have no `ended_at` and are left out - counting one
 * would make the current week jump the moment a session started.
 */
export function weeklyCardio(sessions: CardioSession[], weeks = 12): CardioWeek[] {
  const byWeek = new Map<string, CardioWeek>()

  for (const s of sessions) {
    if (s.deleted_at || !s.ended_at) continue
    const wk = isoWeek(s.date)
    const row = byWeek.get(wk) ?? { week: wk, sessions: 0, workMinutes: 0 }
    row.sessions += 1
    row.workMinutes += (s.rounds_completed * s.work_seconds) / 60
    byWeek.set(wk, row)
  }

  return [...byWeek.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-weeks)
    .map((r) => ({ ...r, workMinutes: Math.round(r.workMinutes) }))
}

/** Work minutes actually performed in one session. */
export const workMinutesOf = (s: CardioSession): number =>
  Math.round((s.rounds_completed * s.work_seconds) / 60)
