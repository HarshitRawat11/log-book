/**
 * Dates are handled as local calendar dates (yyyy-mm-dd), never UTC instants.
 *
 * This matters: a 9pm session in IST is 15:30 UTC the same day, but a 6am one
 * is 00:30 UTC and `toISOString().slice(0,10)` would file it under the previous
 * day. Training days are calendar days as the lifter experiences them.
 */

export function todayIso(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function daysBetween(aIso: string, bIso: string): number {
  const ms = parseIsoDate(bIso).getTime() - parseIsoDate(aIso).getTime()
  return Math.round(ms / 86_400_000)
}

/** "18 Aug" - short, unambiguous, no year unless it differs from now. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = parseIsoDate(iso)
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * "today" / "yesterday" / "4 days ago" / "3 weeks ago".
 *
 * A suggestion built on a month-old session has to admit its age, or it gets
 * acted on as though it were current.
 */
export function relativeAge(iso: string, now: Date = new Date()): string {
  const days = daysBetween(iso, todayIso(now))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `${weeks} weeks ago`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

/** ISO week key, e.g. "2026-W37". Monday-start, per ISO 8601. */
export function isoWeek(iso: string): string {
  const d = parseIsoDate(iso)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // Thursday of the current week determines the year.
  const dayNum = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNum + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstDayNum = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}
