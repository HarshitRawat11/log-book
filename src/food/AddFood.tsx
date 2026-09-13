import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumberField } from '../components/NumberField'
import type { Food, Recipe } from '../db/types'
import { macrosFor } from './macros'
import {
  isRecipe,
  listFoods,
  listRecipes,
  logPortion,
  per100gOf,
  recentAndFavourites,
  cacheProviderFood,
  type MealSlot,
} from './queries'
import { ifctProvider, openFoodFactsProvider, type ProviderFood } from './provider'

/**
 * Adding food to a meal.
 *
 * Ordered the way the brief asks for (7.4): recents and favourites first, the
 * personal library second, an online lookup only if you ask for it. After a few
 * weeks almost everything should be a tap on the first row.
 */
export function AddFood({
  date,
  slot,
  onClose,
}: {
  date: string
  slot: MealSlot
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Food | Recipe | null>(null)
  const [online, setOnline] = useState<ProviderFood[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const recents = useLiveQuery(() => recentAndFavourites(12), [], [])
  const foods = useLiveQuery(() => listFoods(), [], [])
  const recipes = useLiveQuery(() => listRecipes(), [], [])

  const library = useMemo(() => {
    const all: Array<Food | Recipe> = [...(recipes ?? []), ...(foods ?? [])]
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 25)
  }, [foods, recipes, query])

  // IFCT is bundled, so it costs nothing and works offline - search it as you
  // type. Open Food Facts is a network call with a 10 req/min limit, so it
  // stays behind an explicit button.
  const [ifctHits, setIfctHits] = useState<ProviderFood[]>([])
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setIfctHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void ifctProvider.search(q).then((r) => {
        if (!cancelled) setIfctHits(r.slice(0, 12))
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  async function searchOnline() {
    const q = query.trim()
    if (!q) return
    abort.current?.abort()
    abort.current = new AbortController()
    setSearching(true)
    setError(null)
    try {
      setOnline(await openFoodFactsProvider.search(q, abort.current.signal))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(navigator.onLine ? 'Search failed. Try again in a moment.' : 'Offline — your library and the Indian food tables still work.')
      }
    } finally {
      setSearching(false)
    }
  }

  if (picked) {
    return <Portion date={date} slot={slot} item={picked} onBack={() => setPicked(null)} onDone={onClose} />
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium capitalize">Add to {slot}</span>
        <button onClick={onClose} aria-label="Close" className="size-11 text-text-dim">
          ×
        </button>
      </div>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your library or Indian food tables"
        className="min-h-12 w-full rounded-lg border border-border bg-surface-2 px-3 text-base
                   outline-none placeholder:text-text-dim focus:border-accent"
      />

      <div className="mt-2 max-h-96 overflow-y-auto">
        {!query.trim() && (
          <Group title={(recents ?? []).length ? 'Recent and favourites' : undefined}>
            {(recents ?? []).map((x) => (
              <ItemRow key={x.id} item={x} onPick={() => setPicked(x)} />
            ))}
            {(recents ?? []).length === 0 && (
              <p className="px-2 py-3 text-sm text-text-dim">
                Nothing logged yet. Search above — Indian staples are built in, no network needed.
              </p>
            )}
          </Group>
        )}

        {query.trim() && (
          <>
            {library.length > 0 && (
              <Group title="Your library">
                {library.map((x) => (
                  <ItemRow key={x.id} item={x} onPick={() => setPicked(x)} />
                ))}
              </Group>
            )}

            {ifctHits.length > 0 && (
              <Group title="Indian Food Composition Tables">
                {ifctHits.map((p) => (
                  <ProviderRow
                    key={p.source_ref}
                    p={p}
                    onPick={async () => setPicked(await cacheProviderFood(p))}
                  />
                ))}
              </Group>
            )}

            {online && (
              <Group title="Open Food Facts">
                {online.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-text-dim">
                    No packaged products matched. Home-cooked dishes usually will not — build a
                    recipe instead.
                  </p>
                ) : (
                  online.map((p) => (
                    <ProviderRow
                      key={p.source_ref}
                      p={p}
                      onPick={async () => setPicked(await cacheProviderFood(p))}
                    />
                  ))
                )}
              </Group>
            )}

            {error && <p className="px-2 py-2 text-sm text-danger">{error}</p>}

            {!online && (
              <button
                onClick={() => void searchOnline()}
                disabled={searching}
                className="mt-2 min-h-12 w-full rounded-lg border border-border bg-surface-2
                           text-sm font-medium text-text-dim disabled:opacity-50"
              >
                {searching ? 'Searching…' : 'Search Open Food Facts (packaged goods)'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      {title && <p className="px-2 py-1 text-xs font-medium text-text-dim">{title}</p>}
      <ul className="divide-y divide-border">{children}</ul>
    </div>
  )
}

function ItemRow({ item, onPick }: { item: Food | Recipe; onPick: () => void }) {
  const per = per100gOf(item)
  return (
    <li>
      <button onClick={onPick} className="flex min-h-12 w-full items-center gap-2 px-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{item.name}</span>
          <span className="tabular block text-xs text-text-dim">
            {isRecipe(item) && 'recipe · '}
            {per ? `${Math.round(per.kcal_100g)} kcal/100g` : 'needs a cooked weight'}
            {!isRecipe(item) && item.brand ? ` · ${item.brand}` : ''}
          </span>
        </span>
        {item.is_favourite && <span className="text-xs text-accent">★</span>}
      </button>
    </li>
  )
}

function ProviderRow({ p, onPick }: { p: ProviderFood; onPick: () => void }) {
  return (
    <li>
      <button onClick={onPick} className="flex min-h-12 w-full items-center gap-2 px-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{p.name}</span>
          <span className="tabular block text-xs text-text-dim">
            {Math.round(p.kcal_100g)} kcal/100g · P{Math.round(p.protein_100g)}
            {p.brand ? ` · ${p.brand}` : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

function Portion({
  date,
  slot,
  item,
  onBack,
  onDone,
}: {
  date: string
  slot: MealSlot
  item: Food | Recipe
  onBack: () => void
  onDone: () => void
}) {
  const [grams, setGrams] = useState('100')
  const per = per100gOf(item)
  const preview = per && grams ? macrosFor(per, Number(grams)) : null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="text-xs text-text-dim capitalize">to {slot}</p>
        </div>
        <button onClick={onBack} className="min-h-11 text-sm text-text-dim">
          Back
        </button>
      </div>

      {!per ? (
        <p className="text-sm text-danger">
          This recipe has no cooked weight yet, so a portion cannot be worked out. Add the cooked
          yield on the recipe first.
        </p>
      ) : (
        <>
          <NumberField label="Grams" value={grams} onChange={setGrams} step={10} min={1} />
          {preview && (
            <p className="tabular mt-3 text-sm">
              <span className="font-semibold">{Math.round(preview.kcal)} kcal</span>
              <span className="text-text-dim">
                {' · '}P {preview.protein_g.toFixed(1)} · C {preview.carbs_g.toFixed(1)} · F{' '}
                {preview.fat_g.toFixed(1)}
              </span>
            </p>
          )}
          <button
            onClick={async () => {
              if (!grams || Number(grams) <= 0) return
              await logPortion({ date, slot, item, grams: Number(grams) })
              onDone()
            }}
            disabled={!grams || Number(grams) <= 0}
            className="mt-4 min-h-14 w-full rounded-xl bg-accent text-lg font-semibold
                       text-accent-text disabled:opacity-40"
          >
            Log it
          </button>
        </>
      )}
    </div>
  )
}
