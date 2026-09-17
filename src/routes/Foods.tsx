import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { EmptyState } from '../components/EmptyState'
import { SyncPill } from '../components/SyncPill'
import { NumberField } from '../components/NumberField'
import { deleteRow, newRow, patchRow, putRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import type { Food, Recipe } from '../db/types'
import { listFoods, listRecipes } from '../food/queries'
import { createRecipe, RecipeEditor } from '../food/RecipeEditor'

/**
 * The personal library: foods and recipes.
 *
 * This is the primary path for daily logging (brief 7.4) - online search only
 * ever seeds it. Recipes come first in the tab order because on a home-cooked
 * diet they are what you actually log.
 */
export function Foods() {
  const [tab, setTab] = useState<'recipes' | 'foods'>('recipes')
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [editingFood, setEditingFood] = useState<Food | 'new' | null>(null)

  const foods = useLiveQuery(() => listFoods(), [], [])
  const recipes = useLiveQuery(() => listRecipes(), [], [])

  // Keep the editor bound to the live row so derived values refresh as items change.
  const liveRecipe = (recipes ?? []).find((r) => r.id === editingRecipe?.id) ?? editingRecipe

  if (liveRecipe) {
    return (
      <Screen title="Recipe" subtitle={liveRecipe.name || 'New dish'} actions={<SyncPill />}>
        <RecipeEditor recipe={liveRecipe} onClose={() => setEditingRecipe(null)} />
      </Screen>
    )
  }

  if (editingFood) {
    return (
      <Screen title={editingFood === 'new' ? 'New food' : 'Edit food'} actions={<SyncPill />}>
        <FoodEditor
          food={editingFood === 'new' ? null : editingFood}
          onClose={() => setEditingFood(null)}
        />
      </Screen>
    )
  }

  return (
    <Screen
      title="Library"
      subtitle={`${(recipes ?? []).length} recipes · ${(foods ?? []).length} foods`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/food"
            className="flex min-h-9 items-center rounded-full border border-border bg-surface-2
                       px-3 text-xs font-medium text-text-dim active:bg-border"
          >
            Today
          </Link>
          <SyncPill />
        </div>
      }
    >
      <div className="mb-3 flex gap-2">
        {(['recipes', 'foods'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'min-h-10 flex-1 rounded-full border text-sm font-medium capitalize',
              tab === t
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-surface text-text-dim',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'recipes' ? (
        <div className="flex flex-col gap-3 pb-4">
          <button
            onClick={async () => setEditingRecipe(await createRecipe())}
            className="min-h-14 w-full rounded-xl bg-accent font-semibold text-accent-text"
          >
            + New recipe
          </button>
          {(recipes ?? []).length === 0 ? (
            <EmptyState
              title="No recipes yet"
              body="Build a dish from its raw ingredients, weigh the finished pan, and the app works out per-100g values. This is how home-cooked food becomes loggable."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {recipes!.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setEditingRecipe(r)}
                    className="flex min-h-14 w-full items-center gap-2 px-4 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.name || 'Untitled dish'}</span>
                      <span className="tabular block text-xs text-text-dim">
                        {r.kcal_100g === null
                          ? 'needs a cooked weight'
                          : `${Math.round(r.kcal_100g)} kcal/100g · yields ${Math.round(r.cooked_yield_g)} g`}
                      </span>
                    </span>
                    {r.is_favourite && <span className="text-xs text-accent">★</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <button
            onClick={() => setEditingFood('new')}
            className="min-h-14 w-full rounded-xl border border-border bg-surface font-semibold"
          >
            + Add food manually
          </button>
          {(foods ?? []).length === 0 ? (
            <EmptyState
              title="No foods yet"
              body="Foods land here automatically the first time you log them from search, so this fills itself. You can also add one by hand from a label."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {foods!.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setEditingFood(f)}
                    className="flex min-h-14 w-full items-center gap-2 px-4 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{f.name}</span>
                      <span className="tabular block text-xs text-text-dim">
                        {Math.round(f.kcal_100g)} kcal/100g · P{f.protein_100g.toFixed(0)}
                        {f.brand ? ` · ${f.brand}` : ''}
                        {f.source !== 'manual' && ` · ${f.source === 'ifct2017' ? 'IFCT' : 'OFF'}`}
                      </span>
                    </span>
                    {f.is_favourite && <span className="text-xs text-accent">★</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Screen>
  )
}

const inputCls =
  'min-h-12 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent'

function FoodEditor({ food, onClose }: { food: Food | null; onClose: () => void }) {
  const [name, setName] = useState(food?.name ?? '')
  const [brand, setBrand] = useState(food?.brand ?? '')
  const [kcal, setKcal] = useState(String(food?.kcal_100g ?? ''))
  const [protein, setProtein] = useState(String(food?.protein_100g ?? ''))
  const [carbs, setCarbs] = useState(String(food?.carbs_100g ?? ''))
  const [fat, setFat] = useState(String(food?.fat_100g ?? ''))
  const [fibre, setFibre] = useState(String(food?.fibre_100g ?? '0'))

  const valid = name.trim() && kcal !== ''

  async function save() {
    const fields = {
      name: name.trim(),
      brand: brand.trim() || null,
      kcal_100g: Number(kcal) || 0,
      protein_100g: Number(protein) || 0,
      carbs_100g: Number(carbs) || 0,
      fat_100g: Number(fat) || 0,
      fibre_100g: Number(fibre) || 0,
    }
    if (food) {
      // Editing macros does NOT touch entries already logged - they carry their
      // own snapshot. That is the point (brief 6).
      await patchRow<Food>('foods', food.id, fields)
    } else {
      await putRow(
        'foods',
        newRow({ ...fields, source: 'manual', source_ref: null, fetched_at: null, is_favourite: false }),
      )
    }
    scheduleFlush()
    onClose()
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-dim">Name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-dim">Brand (optional)</span>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
      </label>

      <p className="px-1 text-xs font-medium text-text-dim">Per 100g</p>
      <div className="flex gap-3">
        <NumberField label="kcal" value={kcal} onChange={setKcal} step={10} />
        <NumberField label="Protein" value={protein} onChange={setProtein} step={1} />
      </div>
      <div className="flex gap-3">
        <NumberField label="Carbs" value={carbs} onChange={setCarbs} step={1} />
        <NumberField label="Fat" value={fat} onChange={setFat} step={1} />
      </div>
      <div className="flex gap-3">
        <NumberField label="Fibre" value={fibre} onChange={setFibre} step={1} />
        <div className="flex-1" />
      </div>

      {food && (
        <p className="px-1 text-xs leading-relaxed text-text-dim">
          Changing these does not alter anything already logged — past entries keep the numbers
          they were logged with.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={!valid}
          className="min-h-14 flex-1 rounded-xl bg-accent font-semibold text-accent-text
                     disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={onClose} className="min-h-14 rounded-xl border border-border px-4">
          Cancel
        </button>
      </div>

      {food && (
        <>
          <button
            onClick={async () => {
              await patchRow<Food>('foods', food.id, { is_favourite: !food.is_favourite })
              scheduleFlush()
              onClose()
            }}
            className="min-h-11 text-sm text-accent"
          >
            {food.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
          </button>
          <ConfirmDelete
            label="Delete food"
            warning={
              <>
                Delete <strong>{food.name}</strong>? It stops appearing in search. Recipes using it
                keep it in their totals, and anything already logged keeps its own snapshot — so
                nothing you have eaten changes.
              </>
            }
            onConfirm={async () => {
              await deleteRow('foods', food.id)
              scheduleFlush()
              onClose()
            }}
          />
        </>
      )}
    </div>
  )
}
