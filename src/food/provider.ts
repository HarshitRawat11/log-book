/**
 * Food data providers.
 *
 * Two implementations behind one interface, so swapping either is a one-file
 * change (brief 7.5):
 *
 *  - IFCT 2017, bundled. 528 Indian foods, no network, no key, no rate limit,
 *    no outage. Searched first, because on an Indian diet it answers most
 *    lookups and it works in a gym basement.
 *  - Open Food Facts, remote. Packaged and branded goods, which IFCT does not
 *    cover. Explicitly opt-in, never automatic.
 *
 * Whatever a provider returns is CACHED into the local `foods` table on first
 * use, so the library becomes self-sufficient and the app keeps working when
 * the provider does not.
 */

export type ProviderFood = {
  name: string
  brand: string | null
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
  fibre_100g: number
  /** Matches foods.source: 'ifct2017' | 'openfoodfacts'. */
  source: string
  /** The provider's own id, so a food is cached exactly once. */
  source_ref: string
}

export interface FoodDataProvider {
  readonly id: string
  readonly label: string
  /** True when it needs no network - drives what the UI offers offline. */
  readonly offline: boolean
  search(query: string, signal?: AbortSignal): Promise<ProviderFood[]>
}

/* ------------------------------------------------------------ IFCT 2017 -- */

type IfctRow = { c: string; n: string; k: number; p: number; ca: number; f: number; fi: number }
let ifctCache: IfctRow[] | null = null

/** Lazy so 40KB of food data is not in the bundle that renders the gym screen. */
async function loadIfct(): Promise<IfctRow[]> {
  if (!ifctCache) {
    const mod = await import('../data/ifct.json')
    ifctCache = (mod.default as { foods: IfctRow[] }).foods
  }
  return ifctCache
}

/**
 * Every query token must appear somewhere in the name. "toor dal" should not
 * match every dal in the table, and a single fuzzy edit-distance pass over 528
 * rows produces confident nonsense - which for nutrition data is worse than no
 * result at all (brief 7.5: do not paper over the gap with fuzzy matching).
 */
function scoreMatch(name: string, tokens: string[]): number {
  const lower = name.toLowerCase()
  if (!tokens.every((t) => lower.includes(t))) return -1
  if (lower === tokens.join(' ')) return 0
  if (lower.startsWith(tokens[0]!)) return 1
  return 2
}

export const ifctProvider: FoodDataProvider = {
  id: 'ifct2017',
  label: 'Indian Food Composition Tables',
  offline: true,
  async search(query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return []
    const rows = await loadIfct()

    return rows
      .map((r) => ({ r, score: scoreMatch(r.n, tokens) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.r.n.length - b.r.n.length)
      .slice(0, 30)
      .map(({ r }) => ({
        name: r.n,
        brand: null,
        kcal_100g: r.k,
        protein_100g: r.p,
        carbs_100g: r.ca,
        fat_100g: r.f,
        fibre_100g: r.fi,
        source: 'ifct2017',
        source_ref: r.c,
      }))
  },
}

/* ------------------------------------------------------ Open Food Facts -- */

const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl'

/**
 * Open Food Facts asks callers to identify themselves in a User-Agent of the
 * form AppName/Version (ContactEmail). A browser cannot set User-Agent - it is
 * a forbidden header name and fetch silently refuses - so we send X-User-Agent,
 * which OFF accepts for exactly this reason and which their CORS policy
 * explicitly allows.
 */
const OFF_UA = 'log-book/0.1 (harshitrawat2011@gmail.com)'

type OffProduct = {
  code?: string
  product_name?: string
  brands?: string
  nutriments?: Record<string, number | string | undefined>
}

const nutrient = (n: OffProduct['nutriments'], key: string): number => {
  const v = n?.[key]
  const num = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(num) ? Number(num) : 0
}

export const openFoodFactsProvider: FoodDataProvider = {
  id: 'openfoodfacts',
  label: 'Open Food Facts',
  offline: false,
  async search(query, signal) {
    // /api/v2/search ignores search_terms and cheerfully returns the entire
    // database (4.7M products). cgi/search.pl is the endpoint that actually
    // does full text.
    const url =
      `${OFF_SEARCH}?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=25` +
      `&fields=code,product_name,brands,nutriments`

    const res = await fetch(url, { signal, headers: { 'X-User-Agent': OFF_UA } })
    if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`)
    const body = (await res.json()) as { products?: OffProduct[] }

    return (body.products ?? [])
      .filter((p) => p.product_name && p.code)
      .map((p) => ({
        name: p.product_name!.trim(),
        brand: p.brands?.split(',')[0]?.trim() || null,
        kcal_100g: nutrient(p.nutriments, 'energy-kcal_100g'),
        protein_100g: nutrient(p.nutriments, 'proteins_100g'),
        carbs_100g: nutrient(p.nutriments, 'carbohydrates_100g'),
        fat_100g: nutrient(p.nutriments, 'fat_100g'),
        fibre_100g: nutrient(p.nutriments, 'fiber_100g'),
        source: 'openfoodfacts',
        source_ref: p.code!,
      }))
      // A product with no energy is useless for logging, and OFF has many
      // half-filled entries. Better to show fewer, usable results.
      .filter((f) => f.kcal_100g > 0)
  },
}

export const providers = { ifct: ifctProvider, openFoodFacts: openFoodFactsProvider }
