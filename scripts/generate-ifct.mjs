/**
 * Trims the IFCT 2017 dataset down to the six fields this app uses and writes
 * src/data/ifct.json. Run with `npm run ifct`; the output is committed, so a
 * normal build needs neither this script nor the source package.
 *
 * Source: Indian Food Composition Tables 2017, National Institute of Nutrition,
 * Hyderabad. Packaged as @ifct2017/compositions (MIT).
 *
 * ---------------------------------------------------------------------------
 * ENERGY IS IN KILOJOULES. This is the one thing that will bite.
 *
 * The package does not document it - @ifct2017/columns reports `unit:
 * undefined` for every field - so it was established by arithmetic against
 * foods with well-known values:
 *
 *   Paneer               1079 kJ / 4.184 = 258 kcal/100g   (known ~265)
 *   Wheat flour, refined 1472 kJ / 4.184 = 352 kcal/100g   (known ~348)
 *   Lentil dal           1349 kJ / 4.184 = 322 kcal/100g   (known ~340)
 *
 * All three only make sense as kJ; 1079 kcal/100g is physically impossible,
 * since pure fat is about 900. The conversion is asserted below and pinned by
 * a test, so a future package change cannot silently quadruple every calorie.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
const KJ_PER_KCAL = 4.184

/**
 * Read index.csv rather than the package's query function.
 *
 * The exported function only does fuzzy text lookup and exposes no way to
 * enumerate rows, and its internals are not part of its API - an earlier
 * attempt at `compositions.corpus` broke immediately. The CSV is the actual
 * data and its shape is stable.
 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Foods whose energy we know independently, used as a build-time tripwire. */
const SANITY = [
  { query: 'paneer', kcalMin: 230, kcalMax: 290 },
  { query: 'wheat flour', kcalMin: 320, kcalMax: 380 },
  { query: 'lentil dal', kcalMin: 290, kcalMax: 360 },
]

const round = (n, dp = 1) => (Number.isFinite(n) ? Number(n.toFixed(dp)) : 0)

const csvPath = join(dirname(require.resolve('@ifct2017/compositions')), 'index.csv')
const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const header = rows.shift()

// Headers look like "Food Name; name" - the part after the semicolon is the key.
const keyIndex = new Map()
header.forEach((h, i) => {
  const key = h.includes(';') ? h.split(';').pop().trim() : h.trim()
  if (!keyIndex.has(key)) keyIndex.set(key, i)
})

const need = ['code', 'name', 'enerc', 'protcnt', 'choavldf', 'fatce', 'fibtg']
for (const k of need) {
  if (!keyIndex.has(k)) throw new Error(`column "${k}" missing from index.csv`)
}
const col = (row, key) => row[keyIndex.get(key)]
const num = (row, key) => Number(col(row, key))

const foods = []
for (const row of rows) {
  const name = col(row, 'name')?.trim()
  if (!name) continue
  const kcal = num(row, 'enerc') / KJ_PER_KCAL
  // A few rows carry no proximate data at all; useless for logging.
  if (!Number.isFinite(kcal) || kcal <= 0) continue
  foods.push({
    c: col(row, 'code'),
    n: name,
    k: round(kcal),
    p: round(num(row, 'protcnt') || 0),
    ca: round(num(row, 'choavldf') || 0),
    f: round(num(row, 'fatce') || 0),
    fi: round(num(row, 'fibtg') || 0),
  })
}

foods.sort((a, b) => a.n.localeCompare(b.n))

// --- tripwire ---------------------------------------------------------------
for (const { query, kcalMin, kcalMax } of SANITY) {
  const hit = foods.find((f) => f.n.toLowerCase().includes(query.toLowerCase()))
  if (!hit) throw new Error(`sanity check: no food matching "${query}"`)
  if (hit.k < kcalMin || hit.k > kcalMax) {
    throw new Error(
      `sanity check FAILED for "${query}": ${hit.n} = ${hit.k} kcal/100g, ` +
        `expected ${kcalMin}-${kcalMax}. Has the energy unit changed?`,
    )
  }
  console.log(`  ok  ${query.padEnd(14)} -> ${hit.n} = ${hit.k} kcal/100g`)
}

mkdirSync(OUT_DIR, { recursive: true })
const out = join(OUT_DIR, 'ifct.json')
const json = JSON.stringify({ source: 'IFCT 2017 (NIN Hyderabad)', foods })
writeFileSync(out, json)
console.log(`\n  ${foods.length} foods -> src/data/ifct.json (${(json.length / 1024).toFixed(0)} KB)`)
