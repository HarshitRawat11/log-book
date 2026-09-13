import { describe, expect, it } from 'vitest'
import {
  deriveRecipePer100g,
  macrosFor,
  mifflinStJeorBMR,
  rollingAverage,
  totalLogged,
} from './macros'
import type { Food, FoodLog } from '../db/types'

const food = (over: Partial<Food>): Food => ({
  id: 'f',
  user_id: 'u',
  updated_at: '',
  deleted_at: null,
  name: 'x',
  brand: null,
  kcal_100g: 0,
  protein_100g: 0,
  carbs_100g: 0,
  fat_100g: 0,
  fibre_100g: 0,
  source: 'manual',
  source_ref: null,
  fetched_at: null,
  is_favourite: false,
  ...over,
})

const logEntry = (over: Partial<FoodLog>): FoodLog => ({
  id: crypto.randomUUID(),
  user_id: 'u',
  updated_at: '',
  deleted_at: null,
  date: '2026-09-13',
  meal_slot: 'lunch',
  food_id: 'f',
  recipe_id: null,
  grams: 100,
  name_snapshot: 'x',
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fibre_g: 0,
  ...over,
})

describe('macrosFor', () => {
  it('scales per-100g values by portion', () => {
    const paneer = food({ kcal_100g: 258, protein_100g: 18.9, fat_100g: 14.8 })
    expect(macrosFor(paneer, 150)).toMatchObject({ kcal: 387, protein_g: 28.35, fat_g: 22.2 })
  })
})

describe('deriveRecipePer100g', () => {
  /**
   * The feature that makes Indian home cooking loggable. Raw ingredients go in,
   * the cooked dish is weighed, and per-100g falls out of the two.
   */
  it('divides ingredient totals by the COOKED yield, not the raw weight', () => {
    // 200g paneer + 300g raw spinach, simmered down to 400g of palak paneer.
    const items = [
      { food: food({ kcal_100g: 258, protein_100g: 18.9, fat_100g: 14.8 }), grams: 200 },
      { food: food({ kcal_100g: 23, protein_100g: 2.9, fat_100g: 0.4 }), grams: 300 },
    ]
    const d = deriveRecipePer100g(items, 400)!
    // total = 516 + 69 = 585 kcal, over 400g cooked -> 146.25 kcal/100g
    expect(d.total.kcal).toBeCloseTo(585, 1)
    expect(d.kcal_100g).toBeCloseTo(146.25, 2)
    // raw weight was 500g; using it would give 117 and understate every portion
    expect(d.kcal_100g).not.toBeCloseTo(117, 1)
  })

  it('concentrates macros when a dish reduces', () => {
    const items = [{ food: food({ kcal_100g: 100 }), grams: 500 }]
    const reduced = deriveRecipePer100g(items, 250)!
    expect(reduced.kcal_100g).toBe(200) // 500 kcal over 250g
  })

  it('refuses to derive without a yield weight, rather than guessing', () => {
    const items = [{ food: food({ kcal_100g: 100 }), grams: 100 }]
    expect(deriveRecipePer100g(items, 0)).toBeNull()
    expect(deriveRecipePer100g(items, -5)).toBeNull()
    expect(deriveRecipePer100g([], 400)).toBeNull()
  })
})

describe('totalLogged', () => {
  it('sums the snapshot columns', () => {
    const t = totalLogged([
      logEntry({ kcal: 400, protein_g: 30 }),
      logEntry({ kcal: 250, protein_g: 12 }),
    ])
    expect(t.kcal).toBe(650)
    expect(t.protein_g).toBe(42)
  })

  it('is unaffected by what the underlying food says now', () => {
    // The whole point of snapshotting: the entry carries its own numbers.
    const august = logEntry({ kcal: 500, name_snapshot: 'Dal as it was in August' })
    expect(totalLogged([august]).kcal).toBe(500)
  })
})

describe('rollingAverage', () => {
  const byDate = new Map<string, FoodLog[]>([
    ['2026-09-13', [logEntry({ kcal: 2100, protein_g: 140 })]],
    ['2026-09-12', [logEntry({ kcal: 2500, protein_g: 160 })]],
    ['2026-09-11', [logEntry({ kcal: 1700, protein_g: 120 })]],
  ])

  it('divides by the window, not by the days you happened to log', () => {
    const avg = rollingAverage(byDate, '2026-09-13', 7)
    // 6300 over SEVEN days = 900. Dividing by 3 would read 2100 and flatter you
    // for skipping four days.
    expect(avg.kcal).toBe(900)
    expect(avg.days_logged).toBe(3)
  })

  it('reports a true average once the window is full', () => {
    const full = new Map<string, FoodLog[]>()
    for (let i = 0; i < 7; i++) {
      const d = new Date('2026-09-13T00:00:00')
      d.setDate(d.getDate() - i)
      full.set(d.toLocaleDateString('en-CA'), [logEntry({ kcal: 2000, protein_g: 150 })])
    }
    const avg = rollingAverage(full, '2026-09-13', 7)
    expect(avg.kcal).toBe(2000)
    expect(avg.protein_g).toBe(150)
    expect(avg.days_logged).toBe(7)
  })
})

describe('mifflinStJeorBMR', () => {
  it('matches the published formula for a male', () => {
    // 10*80 + 6.25*178 - 5*30 + 5 = 800 + 1112.5 - 150 + 5 = 1767.5 -> 1768
    expect(mifflinStJeorBMR({ weightKg: 80, heightCm: 178, ageYears: 30, sex: 'male' })).toBe(1768)
  })

  it('uses -161 for female', () => {
    expect(mifflinStJeorBMR({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'female' })).toBe(
      Math.round(10 * 60 + 6.25 * 165 - 5 * 30 - 161),
    )
  })
})
