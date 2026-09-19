import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumberField } from '../components/NumberField'
import { db } from '../db/db'
import { deleteRow, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Food, Recipe, RecipeItem } from '../db/types'
import { deriveRecipePer100g } from './macros'
import { listFoods, recipeItems, refreshRecipeDerived } from './queries'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { ifctProvider, type ProviderFood } from './provider'
import { cacheProviderFood } from './queries'

/**
 * Build a dish from raw ingredients plus the weight of the finished pan.
 *
 * This is the feature that makes the app usable for Indian home cooking, where
 * nothing arrives with a label (brief 6). Energy and macros survive cooking;
 * only water leaves. So raw ingredients divided by the COOKED weight gives
 * per-100g values you can portion against honestly.
 */
export function RecipeEditor({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [name, setName] = useState(recipe.name)
  const [yieldG, setYieldG] = useState(String(recipe.cooked_yield_g || ''))
  const [adding, setAdding] = useState(false)

  const items = useLiveQuery(() => recipeItems(recipe.id), [recipe.id], [])
  const foods = useLiveQuery(() => listFoods(), [], [])
  const byId = new Map((foods ?? []).map((f) => [f.id, f]))

  const inputs = (items ?? [])
    .map((i) => ({ food: byId.get(i.food_id), grams: i.grams, item: i }))
    .filter((x): x is { food: Food; grams: number; item: RecipeItem } => !!x.food)

  const derived = deriveRecipePer100g(inputs, Number(yieldG) || 0)
  const rawWeight = inputs.reduce((t, i) => t + i.grams, 0)

  async function saveHeader() {
    await patchRow<Recipe>('recipes', recipe.id, {
      name: name.trim() || 'Untitled dish',
      cooked_yield_g: Number(yieldG) || 0,
    })
    await refreshRecipeDerived(recipe.id)
  }

  async function addItem(food: Food, grams: number) {
    await putRow(
      'recipe_items',
      newRow({
        recipe_id: recipe.id,
        food_id: food.id,
        grams,
        position: (items ?? []).length,
      }),
    )
    await refreshRecipeDerived(recipe.id)
    setAdding(false)
  }

  async function removeItem(id: string) {
    await deleteRow('recipe_items', id)
    await refreshRecipeDerived(recipe.id)
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-dim">Dish name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveHeader()}
          placeholder="Palak paneer"
          className="min-h-12 rounded-lg border border-border bg-surface px-3 text-base outline-none
                     focus:border-accent"
        />
      </label>

      {/* Ingredients */}
      <section>
        <p className="mb-2 px-1 text-xs font-medium text-text-dim">Ingredients, raw weight</p>
        {inputs.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {inputs.map(({ food, grams, item }) => (
              <li key={item.id} className="flex min-h-12 items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{food.name}</span>
                  <span className="tabular block text-xs text-text-dim">
                    {grams}&nbsp;g · {Math.round((food.kcal_100g * grams) / 100)} kcal
                  </span>
                </span>
                <button
                  onClick={() => void removeItem(item.id)}
                  aria-label={`Remove ${food.name}`}
                  className="size-11 shrink-0 text-text-dim"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <IngredientPicker onCancel={() => setAdding(false)} onAdd={addItem} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 min-h-12 w-full rounded-lg border border-dashed border-border text-sm
                       font-medium text-text-dim"
          >
            + Add ingredient
          </button>
        )}
      </section>

      {/* Cooked yield */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <NumberField label="Cooked weight of the finished dish (g)" value={yieldG} onChange={setYieldG} step={50} min={1} />
        <button
          onClick={() => void saveHeader()}
          className="mt-3 min-h-12 w-full rounded-lg border border-border bg-surface-2 text-sm font-medium"
        >
          Save yield
        </button>
        <p className="mt-2 text-xs text-text-dim">
          Weigh the pan contents after cooking. Ingredients here total{' '}
          <span className="tabular text-text">{Math.round(rawWeight)}&nbsp;g</span> raw — the difference
          is water lost, which is exactly what makes the per-100g figure right.
        </p>
      </section>

      {/* Derived */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-text-dim">Per 100g of the finished dish</p>
        {derived ? (
          <>
            <p className="tabular mt-1 text-xl font-semibold">
              {Math.round(derived.kcal_100g)} kcal
            </p>
            <p className="tabular mt-1 text-sm text-text-dim">
              P {derived.protein_100g.toFixed(1)} · C {derived.carbs_100g.toFixed(1)} · F{' '}
              {derived.fat_100g.toFixed(1)} · fibre {derived.fibre_100g.toFixed(1)}
            </p>
            <p className="tabular mt-2 text-xs text-text-dim">
              Whole dish: {Math.round(derived.total.kcal)} kcal ·{' '}
              {derived.total.protein_g.toFixed(0)}&nbsp;g protein
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-text-dim">
            {inputs.length === 0
              ? 'Add ingredients to see the derived values.'
              : 'Enter the cooked weight to derive per-100g values.'}
          </p>
        )}
      </section>

      <div className="flex gap-2">
        <button
          onClick={async () => {
            await saveHeader()
            onClose()
          }}
          className="min-h-14 flex-1 rounded-lg bg-accent font-semibold text-accent-text"
        >
          Done
        </button>
        <button
          onClick={async () => {
            await patchRow<Recipe>('recipes', recipe.id, {
              is_favourite: !recipe.is_favourite,
            })
            scheduleFlush()
          }}
          className="min-h-14 rounded-lg border border-border px-4 text-sm"
        >
          {recipe.is_favourite ? '★ Favourite' : '☆ Favourite'}
        </button>
      </div>

      <ConfirmDelete
        label="Delete recipe"
        warning={
          <>
            Delete <strong>{recipe.name}</strong> and its {(items ?? []).length} ingredient
            {(items ?? []).length === 1 ? '' : 's'}? Meals already logged from it keep their own
            snapshot and are unaffected.
          </>
        }
        onConfirm={async () => {
          for (const i of items ?? []) await deleteRow('recipe_items', i.id)
          await deleteRow('recipes', recipe.id)
          scheduleFlush()
          onClose()
        }}
      />
    </div>
  )
}

/** Pick an ingredient from the library or the bundled Indian tables. */
function IngredientPicker({
  onAdd,
  onCancel,
}: {
  onAdd: (food: Food, grams: number) => Promise<void>
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState('100')
  const [ifctHits, setIfctHits] = useState<ProviderFood[]>([])

  const foods = useLiveQuery(() => listFoods(), [], [])
  const lib = (foods ?? []).filter(
    (f) => query.trim() && f.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  async function runIfct(q: string) {
    setQuery(q)
    setIfctHits(q.trim().length >= 2 ? (await ifctProvider.search(q)).slice(0, 10) : [])
  }

  if (picked) {
    return (
      <div className="mt-2 rounded-2xl border border-border bg-surface p-3">
        <p className="truncate text-sm font-medium">{picked.name}</p>
        <div className="mt-2">
          <NumberField label="Raw grams" value={grams} onChange={setGrams} step={10} min={1} />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => void onAdd(picked, Number(grams) || 0)}
            disabled={!grams || Number(grams) <= 0}
            className="min-h-12 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-text
                       disabled:opacity-40"
          >
            Add
          </button>
          <button onClick={() => setPicked(null)} className="min-h-12 rounded-lg border border-border px-4 text-sm">
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-text-dim">Add ingredient</span>
        <button onClick={onCancel} aria-label="Cancel" className="size-11 text-text-dim">
          ×
        </button>
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => void runIfct(e.target.value)}
        placeholder="Paneer, spinach, mustard oil…"
        className="min-h-12 w-full rounded-lg border border-border bg-surface-2 px-3 text-base
                   outline-none placeholder:text-text-dim focus:border-accent"
      />
      <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
        {lib.map((f) => (
          <li key={f.id}>
            <button onClick={() => setPicked(f)} className="min-h-12 w-full px-2 text-left text-sm">
              {f.name}
              <span className="tabular block text-xs text-text-dim">
                {Math.round(f.kcal_100g)} kcal/100g · your library
              </span>
            </button>
          </li>
        ))}
        {ifctHits.map((p) => (
          <li key={p.source_ref}>
            <button
              onClick={async () => setPicked(await cacheProviderFood(p))}
              className="min-h-12 w-full px-2 text-left text-sm"
            >
              {p.name}
              <span className="tabular block text-xs text-text-dim">
                {Math.round(p.kcal_100g)} kcal/100g · IFCT
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Create an empty recipe, ready to edit. */
export async function createRecipe(): Promise<Recipe> {
  const row = newRow({
    name: '',
    cooked_yield_g: 0,
    kcal_100g: null,
    protein_100g: null,
    carbs_100g: null,
    fat_100g: null,
    fibre_100g: null,
    is_favourite: false,
  })
  const saved = await putRow('recipes', row)
  scheduleFlush()
  return saved
}

export { db }
