import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../db/types'

/**
 * What a session is about, and therefore which lifts to offer first.
 *
 * The exercise picker used to be one alphabetical list, so adding the third
 * back exercise on a Pull day meant scrolling past every leg and chest lift in
 * the library. This ranks the plausible ones to the top and leaves everything
 * else underneath - it never hides a lift, because the day you want to do
 * something off-plan is exactly the day a filter would be infuriating.
 *
 * Two sources of truth, in order:
 *
 *   1. The session's NAME, or its routine day's name. "Pull" means back and
 *      biceps. This is a naming convention, not exercise science - it is the
 *      split as stated, nothing is inferred about what trains what.
 *   2. Failing a name, THE EXERCISES ALREADY IN THE SESSION. Two back lifts in
 *      and the third suggestion should be a back lift. Needs no setup and no
 *      naming discipline, which is why it is the fallback rather than an
 *      error state.
 *
 * Name beats contents deliberately. On a session named Pull that happens to
 * contain one chest lift, chest should not get promoted on the strength of
 * that one row.
 */

/**
 * The split vocabulary. Every muscle-group name matches itself as well, so
 * "Chest + Triceps" and "Shoulders" work without being listed here.
 *
 * Forearms sit with pull: grip work belongs to a pulling day by convention.
 * If that is wrong for this programme it is one entry to move.
 */
const SPLIT_WORDS: Record<string, readonly MuscleGroup[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  leg: ['quads', 'hamstrings', 'glutes', 'calves'],
  arms: ['biceps', 'triceps', 'forearms'],
  upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves'],
}

/**
 * Groups named by a session or routine-day label, or null if it names none.
 *
 * Scans for every keyword and unions the matches, so "Push / Shoulders" picks
 * up both. Matching is on word boundaries: "Backend day" is not a back day,
 * and "Pullover" is not Pull.
 */
export function groupsFromName(name: string | null | undefined): Set<MuscleGroup> | null {
  if (!name) return null
  const found = new Set<MuscleGroup>()
  const words = name.toLowerCase().match(/[a-z]+/g) ?? []
  for (const w of words) {
    for (const g of SPLIT_WORDS[w] ?? []) found.add(g)
    if ((MUSCLE_GROUPS as readonly string[]).includes(w)) found.add(w as MuscleGroup)
  }
  return found.size > 0 ? found : null
}

/**
 * The muscle groups this session is about.
 *
 * @param names       Session name first, then the routine day's - the first
 *                    that names any group wins.
 * @param inSession   Exercises already added, used only when no name does.
 */
export function sessionFocus(
  names: Array<string | null | undefined>,
  inSession: ReadonlyArray<Pick<Exercise, 'muscle_group'>>,
): Set<MuscleGroup> | null {
  for (const n of names) {
    const fromName = groupsFromName(n)
    if (fromName) return fromName
  }
  const fromContents = new Set(inSession.map((e) => e.muscle_group))
  return fromContents.size > 0 ? fromContents : null
}

/**
 * Split a picker list into the ones that fit the session and the rest.
 *
 * Both halves keep the order they came in, which is alphabetical - a picker
 * whose ordering changes for reasons you cannot see is worse than one that is
 * merely long.
 *
 * With no focus, or a focus that matches everything or nothing, `relevant` is
 * empty and the caller renders one plain list. That is the honest outcome:
 * splitting a list into "all of it" and "none of it" is just a heading.
 */
export function rankForSession<T extends Pick<Exercise, 'muscle_group'>>(
  exercises: readonly T[],
  focus: Set<MuscleGroup> | null,
): { relevant: T[]; rest: T[] } {
  if (!focus || focus.size === 0) return { relevant: [], rest: [...exercises] }

  const relevant = exercises.filter((e) => focus.has(e.muscle_group))
  const rest = exercises.filter((e) => !focus.has(e.muscle_group))
  if (relevant.length === 0 || rest.length === 0) return { relevant: [], rest: [...exercises] }
  return { relevant, rest }
}
