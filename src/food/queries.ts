import { db } from '../db/db'
import { alive, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Food, FoodLog, Recipe, RecipeItem } from '../db/types'
import {
  deriveRecipePer100g,
  macrosFor,
  recipeAsPer100g,
  type Per100g,
} from './macros'
import type { ProviderFood } from './provider'

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

/* ------------------------------------------------------------- reading -- */

export async function listFoods(): Promise<Food[]> {
  return alive(await db.foods.toArray()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function listRecipes(): Promise<Recipe[]> {
  return alive(await db.recipes.toArray()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function recipeItems(recipeId: string): Promise<RecipeItem[]> {
  return alive(await db.recipe_items.where('recipe_id').equals(recipeId).toArray()).sort(
    (a, b) => a.position - b.position,
  )
}

export async function logForDate(date: string): Promise<FoodLog[]> {
  return alive(await db.food_log.where('date').equals(date).toArray())
}

/** Log entries for the N days ending at `date`, keyed by date. */
export async function logByDate(date: string, days: number): Promise<Map<string, FoodLog[]>> {
  const end = new Date(`${date}T00:00:00`)
  const keys: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    keys.push(d.toLocaleDateString('en-CA'))
  }
  const map = new Map<string, FoodLog[]>()
  for (const k of keys) map.set(k, await logForDate(k))
  return map
}

/**
 * What to offer first when adding food (brief 7.4): things you actually eat,
 * most-recent first, then favourites. Online search is the seeding path, not
 * the daily one.
 */
export async function recentAndFavourites(limit = 12): Promise<Array<Food | Recipe>> {
  const [foods, recipes, log] = await Promise.all([
    listFoods(),
    listRecipes(),
    db.food_log.toArray().then(alive),
  ])

  const lastUsed = new Map<string, string>()
  for (const e of log) {
    const key = e.food_id ?? e.recipe_id
    if (!key) continue
    const prev = lastUsed.get(key)
    if (!prev || e.date > prev) lastUsed.set(key, e.date)
  }

  const all: Array<Food | Recipe> = [...foods, ...recipes]
  const known = all
    .filter((x) => x.is_favourite || lastUsed.has(x.id))
    .sort((a, b) => {
      if (a.is_favourite !== b.is_favourite) return a.is_favourite ? -1 : 1
      return (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? '')
    })

  // Pad with recipes you have built but not yet logged. Otherwise the panel is
  // empty the first time you use a dish you just spent five minutes creating,
  // and you have to go and search for it by name - which is exactly the
  // friction the recents list exists to remove.
  const padding = recipes
    .filter((r) => !known.some((k) => k.id === r.id) && r.kcal_100g !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...known, ...padding].slice(0, limit)
}

export const isRecipe = (x: Food | Recipe): x is Recipe => 'cooked_yield_g' in x

/** Per-100g for either kind, or null for a recipe with no derived values. */
export function per100gOf(x: Food | Recipe): Per100g | null {
  return isRecipe(x) ? recipeAsPer100g(x) : x
}

/* ------------------------------------------------------------- writing -- */

/** Cache a provider result into the library, or return the existing copy. */
export async function cacheProviderFood(p: ProviderFood): Promise<Food> {
  const existing = alive(await db.foods.toArray()).find(
    (f) => f.source === p.source && f.source_ref === p.source_ref,
  )
  if (existing) return existing

  const row = newRow({
    name: p.name,
    brand: p.brand,
    kcal_100g: p.kcal_100g,
    protein_100g: p.protein_100g,
    carbs_100g: p.carbs_100g,
    fat_100g: p.fat_100g,
    fibre_100g: p.fibre_100g,
    source: p.source,
    source_ref: p.source_ref,
    fetched_at: new Date().toISOString(),
    is_favourite: false,
  })
  const saved = await putRow('foods', row)
  scheduleFlush()
  return saved
}

/**
 * Log a portion.
 *
 * The macros are computed HERE and written onto the row. They are never read
 * back through the food again, which is what stops a later correction to a
 * food from rewriting history (brief 6, critical rule).
 */
export async function logPortion(opts: {
  date: string
  slot: MealSlot
  item: Food | Recipe
  grams: number
}): Promise<FoodLog | null> {
  const per = per100gOf(opts.item)
  if (!per) return null // a recipe with no yield cannot be portioned

  const m = macrosFor(per, opts.grams)
  const recipe = isRecipe(opts.item)

  const row = newRow({
    date: opts.date,
    meal_slot: opts.slot,
    food_id: recipe ? null : opts.item.id,
    recipe_id: recipe ? opts.item.id : null,
    grams: opts.grams,
    name_snapshot: opts.item.name,
    kcal: m.kcal,
    protein_g: m.protein_g,
    carbs_g: m.carbs_g,
    fat_g: m.fat_g,
    fibre_g: m.fibre_g,
  })
  const saved = await putRow('food_log', row)
  scheduleFlush()
  return saved
}

/**
 * Recompute and store a recipe's derived per-100g values.
 *
 * Called whenever its items or yield change. Existing log entries are NOT
 * touched: they carry their own snapshot, and rewriting them would be the
 * exact bug the snapshot rule exists to prevent.
 */
export async function refreshRecipeDerived(recipeId: string): Promise<void> {
  const [recipe, items, foods] = await Promise.all([
    db.recipes.get(recipeId),
    recipeItems(recipeId),
    // db.foods, NOT listFoods(): tombstoned foods are deliberately included.
    //
    // A recipe contains what it contains. Deleting "ghee" from the library
    // means stop offering it in search - it must not silently vanish from a
    // curry and take that curry's calories down with it. listFoods() filters
    // tombstones, so the ingredient was dropped from the sum with nothing to
    // show for it, the next time the recipe happened to be edited.
    db.foods.toArray(),
  ])
  if (!recipe) return

  const byId = new Map(foods.map((f) => [f.id, f]))
  const inputs = items
    .map((i) => ({ food: byId.get(i.food_id), grams: i.grams }))
    .filter((x): x is { food: Food; grams: number } => !!x.food)

  const derived = deriveRecipePer100g(inputs, recipe.cooked_yield_g)

  await patchRow<Recipe>('recipes', recipeId, {
    kcal_100g: derived?.kcal_100g ?? null,
    protein_100g: derived?.protein_100g ?? null,
    carbs_100g: derived?.carbs_100g ?? null,
    fat_100g: derived?.fat_100g ?? null,
    fibre_100g: derived?.fibre_100g ?? null,
  })
  scheduleFlush()
}
