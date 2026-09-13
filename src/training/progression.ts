import type { Exercise, WorkoutSet } from '../db/types'
import { daysBetween, relativeAge, shortDate, todayIso } from '../lib/dates'

/**
 * Double progression.
 *
 * Specified by the project brief (7.2) and deliberately deterministic - no
 * autoregulation, no velocity, no RIR-driven adjustment. Every branch states
 * its reason in plain language, because a suggestion that cannot be audited is
 * a suggestion that will not be trusted.
 *
 * The rules, given target range [min, max] and load increment `inc`, evaluated
 * against the TOP-WEIGHT working sets of the most recent session containing
 * this exercise:
 *
 *   1. no history                   -> no suggestion (empty state, never a guess)
 *   2. every top set at >= max      -> weight + inc, at min reps
 *   3. lowest top set >= min        -> same weight, +1 rep on the earliest set
 *                                      that is not yet at max
 *   4. lowest < min, twice running  -> deload to 0.9x, rounded DOWN to a
 *      (and within STALL_WINDOW)       loadable weight, flagged as stalling
 *   5. lowest < min, first time     -> repeat the same weight at min reps
 *
 * Rule 5 is not in the original brief - the brief only said what to do after
 * TWO below-range sessions - and was added to make the function total. Approved
 * at the Phase 0 gate.
 */

/**
 * Two below-range sessions either side of a long gap are a layoff, not a stall,
 * and deloading after a holiday is exactly wrong. Only consecutive sessions
 * closer together than this count towards the stall rule.
 */
export const STALL_WINDOW_DAYS = 21

export type SessionPerformance = {
  workout_id: string
  date: string
  /** Working sets only - warm-ups are excluded before this point. */
  sets: WorkoutSet[]
}

export type Suggestion = {
  weight_kg: number
  reps: number
  /** Plain-language justification, shown verbatim in the UI. */
  reason: string
  /** True when the lift has gone backwards twice running. */
  stalling: boolean
  /** The session this was reasoned from, so a stale basis is visible. */
  basis: { date: string; age: string }
}

function roundDownToIncrement(weight: number, inc: number, floor: number): number {
  if (inc <= 0) return Math.max(weight, floor)
  const stepped = Math.floor(weight / inc) * inc
  // Guard against floating-point dust: 52.500000000000004 kg helps nobody.
  return Math.max(Number(stepped.toFixed(2)), floor)
}

/** e.g. "3x12 @ 60kg" when uniform, "12/10/10 @ 60kg" when not. */
function describeSets(sets: WorkoutSet[], weight: number): string {
  const reps = sets.map((s) => s.reps)
  const uniform = reps.every((r) => r === reps[0])
  const repText = uniform ? `${reps.length}x${reps[0]}` : reps.join('/')
  return weight > 0 ? `${repText} @ ${formatKg(weight)}` : `${repText} bodyweight`
}

export function formatKg(kg: number): string {
  return `${Number(kg.toFixed(2))}kg`
}

/** Working sets at the heaviest weight used, in the order they were performed. */
function topSets(session: SessionPerformance): { weight: number; sets: WorkoutSet[] } | null {
  if (session.sets.length === 0) return null
  const weight = Math.max(...session.sets.map((s) => s.weight_kg))
  const sets = session.sets
    .filter((s) => s.weight_kg === weight)
    .sort((a, b) => a.set_index - b.set_index)
  return { weight, sets }
}

function isBelowRange(session: SessionPerformance, min: number): boolean {
  const top = topSets(session)
  if (!top) return false
  return Math.min(...top.sets.map((s) => s.reps)) < min
}

/**
 * @param sessions Sessions containing this exercise, MOST RECENT FIRST,
 *                 already filtered to working sets.
 */
export function suggestNext(
  exercise: Exercise,
  sessions: SessionPerformance[],
  now: Date = new Date(),
): Suggestion | null {
  const last = sessions[0]
  if (!last) return null

  const top = topSets(last)
  if (!top) return null

  const { weight, sets } = top
  const min = exercise.target_rep_min
  const max = exercise.target_rep_max
  const inc = exercise.load_increment_kg
  const lowest = Math.min(...sets.map((s) => s.reps))

  const basis = { date: last.date, age: relativeAge(last.date, now) }
  const when = `${shortDate(last.date, now)}, ${basis.age}`
  const did = describeSets(sets, weight)

  // --- rule 2: everything at the top of the range, add load ----------------
  if (sets.every((s) => s.reps >= max)) {
    const next = weight + inc
    return {
      weight_kg: Number(next.toFixed(2)),
      reps: min,
      stalling: false,
      basis,
      reason: `Last time (${when}) ${did} — top of range, so +${formatKg(inc)}.`,
    }
  }

  // --- rule 3: inside the range, add a rep ---------------------------------
  if (lowest >= min) {
    const targetIdx = sets.findIndex((s) => s.reps < max)
    const nextReps = (sets[targetIdx]?.reps ?? min) + 1
    return {
      weight_kg: weight,
      reps: nextReps,
      stalling: false,
      basis,
      reason:
        `Last time (${when}) ${did} — in range, so ${nextReps} reps on ` +
        `set ${targetIdx + 1}, same weight.`,
    }
  }

  // --- rules 4 and 5: below the range --------------------------------------
  const prev = sessions[1]
  const prevAlsoBelow = prev ? isBelowRange(prev, min) : false
  const gap = prev ? daysBetween(prev.date, last.date) : Infinity
  const consecutive = prevAlsoBelow && gap <= STALL_WINDOW_DAYS

  if (consecutive) {
    const deloaded = roundDownToIncrement(weight * 0.9, inc, exercise.min_weight_kg)

    // Already as light as this exercise goes - an empty bar, or the lightest
    // pin. There is nothing left to take off, so say so rather than suggest
    // the same number and call it a deload.
    if (deloaded >= weight) {
      return {
        weight_kg: weight,
        reps: min,
        stalling: true,
        basis,
        reason:
          `Below ${min} reps twice running (last ${when}) at ${formatKg(weight)}, ` +
          `which is already the lightest this exercise loads. Hold and reset.`,
      }
    }

    return {
      weight_kg: deloaded,
      reps: min,
      stalling: true,
      basis,
      reason:
        `Below ${min} reps twice running (last ${when}) — ` +
        `deload ${formatKg(weight)} to ${formatKg(deloaded)}.`,
    }
  }

  // Rule 5. Includes the layoff case: prev was also below range but too long
  // ago to count, which is a comeback rather than a stall.
  const layoff = prevAlsoBelow && gap > STALL_WINDOW_DAYS
  return {
    weight_kg: weight,
    reps: min,
    stalling: false,
    basis,
    reason: layoff
      ? `Last time (${when}) ${did} — short of ${min}, but the session before ` +
        `was ${gap} days earlier. Treating that as a layoff, not a stall: repeat ${formatKg(weight)}.`
      : `Last time (${when}) ${did} — short of ${min}. Repeat ${formatKg(weight)} before deloading.`,
  }
}

/** What to pre-fill a new set with. NOT a suggestion - a repeat of fact. */
export function repeatOf(
  setsThisSession: WorkoutSet[],
  lastSession: SessionPerformance | undefined,
): { weight_kg: number; reps: number } | null {
  const previousInSession = [...setsThisSession].sort((a, b) => b.set_index - a.set_index)[0]
  if (previousInSession) {
    return { weight_kg: previousInSession.weight_kg, reps: previousInSession.reps }
  }
  const top = lastSession ? topSets(lastSession) : null
  if (top && top.sets[0]) return { weight_kg: top.weight, reps: top.sets[0].reps }
  return null
}

/** Estimated 1RM, Epley: 1RM = w x (1 + reps/30). */
export function epley1RM(weight_kg: number, reps: number): number {
  // A single IS the one-rep max by definition; the formula would inflate it by
  // 3.3%. Special-cased rather than left as a quirk to rediscover later.
  if (reps <= 1) return weight_kg
  return weight_kg * (1 + reps / 30)
}

export { todayIso }
