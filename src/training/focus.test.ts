import { describe, expect, it } from 'vitest'
import { groupsFromName, rankForSession, sessionFocus } from './focus'
import type { Exercise, MuscleGroup } from '../db/types'

/**
 * The exercise picker's ordering.
 *
 * Worth pinning because it is guesswork by construction - it reads a label and
 * infers intent - and the failure mode is quiet: a wrong guess does not throw,
 * it just puts the wrong lifts at the top and makes the list feel broken.
 */

const ex = (name: string, muscle_group: MuscleGroup) =>
  ({ name, muscle_group }) as Pick<Exercise, 'name' | 'muscle_group'>

describe('groupsFromName', () => {
  it('reads the split words', () => {
    expect([...groupsFromName('Pull')!].sort()).toEqual(['back', 'biceps', 'forearms'])
    expect([...groupsFromName('Push')!].sort()).toEqual(['chest', 'shoulders', 'triceps'])
    expect([...groupsFromName('Legs')!].sort()).toEqual(['calves', 'glutes', 'hamstrings', 'quads'])
  })

  it('is case-insensitive and ignores the suffix on "Pull A"', () => {
    expect(groupsFromName('pull a')).toEqual(groupsFromName('Pull'))
  })

  it('unions every keyword it finds', () => {
    expect([...groupsFromName('Chest + Triceps')!].sort()).toEqual(['chest', 'triceps'])
  })

  it('matches muscle groups by their own name, with no vocabulary needed', () => {
    expect([...groupsFromName('Shoulders')!]).toEqual(['shoulders'])
  })

  /**
   * Word boundaries, not substrings. "Pullover" is a chest exercise and
   * "Backend" is not a training day; matching on `includes` would have made
   * both of them Pull days.
   */
  it('does not match a keyword buried inside another word', () => {
    expect(groupsFromName('Pullover day')).toBeNull()
    expect(groupsFromName('Backend deploy')).toBeNull()
  })

  it('returns null for a name that says nothing about muscles', () => {
    expect(groupsFromName('Tuesday')).toBeNull()
    expect(groupsFromName('')).toBeNull()
    expect(groupsFromName(null)).toBeNull()
  })
})

describe('sessionFocus', () => {
  it('reads the session name', () => {
    const focus = sessionFocus('Pull', [])!
    expect(focus.has('back')).toBe(true)
    expect(focus.has('chest')).toBe(false)
  })

  /**
   * The case that needs no setup and no naming discipline, which is why it has
   * to work: two back lifts in, the third suggestion should be a back lift.
   */
  it('falls back to what is already in the session', () => {
    const focus = sessionFocus(null, [ex('Row', 'back'), ex('Curl', 'biceps')])!
    expect([...focus].sort()).toEqual(['back', 'biceps'])
  })

  /**
   * A named Pull day containing one stray chest lift is still a Pull day. If
   * contents were unioned in, one accidental row would promote chest for the
   * rest of the session.
   */
  it('does not let one off-plan lift widen a named session', () => {
    const focus = sessionFocus('Pull', [ex('Bench', 'chest')])!
    expect(focus.has('chest')).toBe(false)
  })

  it('is null on an empty unnamed session, so the list stays alphabetical', () => {
    expect(sessionFocus(null, [])).toBeNull()
  })
})

describe('rankForSession', () => {
  const library = [
    ex('Bench press', 'chest'),
    ex('Barbell row', 'back'),
    ex('Cable curl', 'biceps'),
    ex('Squat', 'quads'),
  ]

  it('lifts the matching groups out, keeping both halves in their original order', () => {
    const { relevant, rest } = rankForSession(library, groupsFromName('Pull'))
    expect(relevant.map((e) => e.name)).toEqual(['Barbell row', 'Cable curl'])
    expect(rest.map((e) => e.name)).toEqual(['Bench press', 'Squat'])
  })

  it('never drops anything - the off-plan lift is always still reachable', () => {
    const { relevant, rest } = rankForSession(library, groupsFromName('Pull'))
    expect([...relevant, ...rest]).toHaveLength(library.length)
  })

  it('does not split the list when there is no focus', () => {
    const { relevant, rest } = rankForSession(library, null)
    expect(relevant).toEqual([])
    expect(rest).toHaveLength(4)
  })

  /**
   * Splitting a list into "all of it" and "none of it" is just a heading, and
   * a heading that says nothing is worse than no heading.
   */
  it('does not split when the focus matches everything, or nothing', () => {
    const allBack = [ex('Row', 'back'), ex('Pulldown', 'back')]
    expect(rankForSession(allBack, groupsFromName('Pull')).relevant).toEqual([])
    expect(rankForSession(allBack, groupsFromName('Legs')).relevant).toEqual([])
  })
})
