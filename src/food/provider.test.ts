import { describe, expect, it } from 'vitest'
import { ifctProvider } from './provider'

/**
 * Pins the IFCT dataset's energy unit.
 *
 * The source data is in kilojoules and the package documents no units at all,
 * so the conversion was inferred. If a regenerated dataset ever ships raw kJ,
 * every calorie in the app quietly becomes 4.184x too large - which would look
 * plausible enough on a single row to go unnoticed for weeks. These numbers are
 * the tripwire.
 */
describe('ifctProvider', () => {
  it('returns kcal, not kilojoules', async () => {
    const [paneer] = await ifctProvider.search('paneer')
    expect(paneer).toBeDefined()
    expect(paneer!.name).toMatch(/paneer/i)
    // 1079 kJ / 4.184 = 258. As kJ it would read 1079, which is impossible:
    // pure fat is about 900 kcal/100g.
    expect(paneer!.kcal_100g).toBeGreaterThan(230)
    expect(paneer!.kcal_100g).toBeLessThan(290)
  })

  it('has plausible macros for a known food', async () => {
    const [paneer] = await ifctProvider.search('paneer')
    expect(paneer!.protein_100g).toBeGreaterThan(14)
    expect(paneer!.protein_100g).toBeLessThan(25)
    expect(paneer!.fat_100g).toBeGreaterThan(10)
  })

  it('requires every token to match, so "toor dal" is not just any dal', async () => {
    const results = await ifctProvider.search('lentil dal')
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.name.toLowerCase()).toContain('lentil')
      expect(r.name.toLowerCase()).toContain('dal')
    }
  })

  it('finds Indian staples by their common names', async () => {
    for (const q of ['paneer', 'wheat flour', 'rice', 'egg']) {
      const results = await ifctProvider.search(q)
      expect(results.length, `no IFCT match for "${q}"`).toBeGreaterThan(0)
    }
  })

  it('returns nothing for an empty query rather than the whole table', async () => {
    expect(await ifctProvider.search('')).toEqual([])
    expect(await ifctProvider.search('   ')).toEqual([])
  })

  it('tags results so they can be cached and traced back', async () => {
    const [first] = await ifctProvider.search('paneer')
    expect(first!.source).toBe('ifct2017')
    expect(first!.source_ref).toBeTruthy()
  })

  it('works offline - it is bundled data, not a network call', () => {
    expect(ifctProvider.offline).toBe(true)
  })
})
