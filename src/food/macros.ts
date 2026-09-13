import type { Food, FoodLog, Recipe } from '../db/types'

/**
 * Macro arithmetic.
 *
 * Two rules do the work here, and both come straight from the brief:
 *
 *  1. A recipe's per-100g values are derived from its raw ingredients divided
 *     by the COOKED yield weight. Energy and macros are conserved through
 *     cooking; only water leaves. Weighing the finished dish is therefore the
 *     one measurement that makes home-cooked food loggable at all, which is
 *     why yield is required rather than optional (brief 6).
 *
 *  2. A food_log row SNAPSHOTS its macros at the moment of logging and is never
 *     recomputed. Correcting a food's macros in November must not silently
 *     rewrite August (brief 6, critical rule).
 */

export type Macros = {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number
}

export const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }

const r2 = (n: number) => Math.round(n * 100) / 100

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    fibre_g: a.fibre_g + b.fibre_g,
  }
}

export function roundMacros(m: Macros): Macros {
  return {
    kcal: r2(m.kcal),
    protein_g: r2(m.protein_g),
    carbs_g: r2(m.carbs_g),
    fat_g: r2(m.fat_g),
    fibre_g: r2(m.fibre_g),
  }
}

/** Per-100g source - a food, or a recipe with its derived values. */
export type Per100g = {
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
  fibre_100g: number
}

/** Macros for `grams` of something whose values are per 100g. */
export function macrosFor(per100g: Per100g, grams: number): Macros {
  const f = grams / 100
  return roundMacros({
    kcal: per100g.kcal_100g * f,
    protein_g: per100g.protein_100g * f,
    carbs_g: per100g.carbs_100g * f,
    fat_g: per100g.fat_100g * f,
    fibre_g: per100g.fibre_100g * f,
  })
}

export type RecipeItemInput = { food: Food; grams: number }

/**
 * Derive a recipe's per-100g values from its ingredients and cooked yield.
 *
 * Returns null when yield is missing or non-positive: a dish you have not
 * weighed cannot be logged by portion, and guessing here would silently
 * corrupt every entry made from it.
 */
export function deriveRecipePer100g(
  items: RecipeItemInput[],
  cookedYieldG: number,
): (Per100g & { total: Macros }) | null {
  if (!(cookedYieldG > 0) || items.length === 0) return null

  let total = ZERO
  for (const { food, grams } of items) {
    total = addMacros(total, macrosFor(food, grams))
  }

  const per = 100 / cookedYieldG
  return {
    total: roundMacros(total),
    kcal_100g: r2(total.kcal * per),
    protein_100g: r2(total.protein_g * per),
    carbs_100g: r2(total.carbs_g * per),
    fat_100g: r2(total.fat_g * per),
    fibre_100g: r2(total.fibre_g * per),
  }
}

/** Sum the SNAPSHOT columns. Never recomputed from the current food row. */
export function totalLogged(entries: FoodLog[]): Macros {
  return roundMacros(
    entries.reduce<Macros>(
      (t, e) => ({
        kcal: t.kcal + e.kcal,
        protein_g: t.protein_g + e.protein_g,
        carbs_g: t.carbs_g + e.carbs_g,
        fat_g: t.fat_g + e.fat_g,
        fibre_g: t.fibre_g + e.fibre_g,
      }),
      ZERO,
    ),
  )
}

/**
 * Rolling average over the last `days` calendar days ending at `endDate`.
 *
 * Days with nothing logged count as zero, deliberately. Averaging only over
 * days you remembered to log flatters the number badly - skip your worst three
 * days and your "average" improves without you eating differently. A weekly
 * average is only the real signal (brief 7.4) if it includes the blanks.
 */
export function rollingAverage(
  entriesByDate: Map<string, FoodLog[]>,
  endDate: string,
  days = 7,
): Macros & { days_logged: number } {
  const end = new Date(`${endDate}T00:00:00`)
  let total = ZERO
  let logged = 0

  for (let i = 0; i < days; i++) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-CA')
    const entries = entriesByDate.get(key) ?? []
    if (entries.length > 0) logged++
    total = addMacros(total, totalLogged(entries))
  }

  return {
    ...roundMacros({
      kcal: total.kcal / days,
      protein_g: total.protein_g / days,
      carbs_g: total.carbs_g / days,
      fat_g: total.fat_g / days,
      fibre_g: total.fibre_g / days,
    }),
    days_logged: logged,
  }
}

/**
 * Mifflin-St Jeor BMR: 10*weight(kg) + 6.25*height(cm) - 5*age + 5 (male),
 * or -161 instead of +5 (female).
 *
 * A starting estimate to be adjusted against real bodyweight trend, never a
 * prescription (brief 7.4).
 */
export function mifflinStJeorBMR(opts: {
  weightKg: number
  heightCm: number
  ageYears: number
  sex: 'male' | 'female'
}): number {
  const base = 10 * opts.weightKg + 6.25 * opts.heightCm - 5 * opts.ageYears
  return Math.round(base + (opts.sex === 'male' ? 5 : -161))
}

export function recipeAsPer100g(r: Recipe): Per100g | null {
  if (r.kcal_100g === null) return null
  return {
    kcal_100g: r.kcal_100g,
    protein_100g: r.protein_100g ?? 0,
    carbs_100g: r.carbs_100g ?? 0,
    fat_100g: r.fat_100g ?? 0,
    fibre_100g: r.fibre_100g ?? 0,
  }
}
