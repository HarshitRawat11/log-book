import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SYNC_TABLES, pkOf } from './types'

/**
 * The code's idea of the schema, checked against the migrations.
 *
 * This exists because of a bug that shipped and went unnoticed for a whole
 * phase: the outbox keyed every row on `id`, but `profile` is keyed by
 * `user_id` and has no `id` column at all. The write path invented one to
 * satisfy the outbox, and Supabase rejected every push with PGRST204 - "Could
 * not find the 'id' column of 'profile'". Targets saved locally and never once
 * reached the server, failing quietly into the outbox's retry backoff.
 *
 * Nothing in TypeScript could catch that: types are erased, and the mismatch
 * only exists between our payload and Postgres. Reading the migrations is the
 * cheapest thing that does.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations')

/** Every `create table` in the migrations, mapped to its column names. */
function columnsByTable(): Map<string, Set<string>> {
  const sql = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(DIR, f), 'utf8'))
    .join('\n')

  const tables = new Map<string, Set<string>>()

  for (const m of sql.matchAll(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const [, name, body] = m
    const cols = new Set<string>()
    for (const line of body!.split('\n')) {
      const t = line.trim()
      // Skip comments and table-level constraint clauses.
      if (!t || t.startsWith('--') || /^(constraint|primary key|unique|check|foreign)\b/i.test(t)) {
        continue
      }
      const col = t.match(/^(\w+)\s+/)
      if (col) cols.add(col[1]!)
    }
    tables.set(name!, cols)
  }

  // Columns added later by ALTER, which never appear in a create table body.
  for (const m of sql.matchAll(/alter table (\w+) add column (?:if not exists )?(\w+)/g)) {
    tables.get(m[1]!)?.add(m[2]!)
  }

  return tables
}

const TABLES = columnsByTable()

describe('migrations parse', () => {
  it('finds every synced table', () => {
    for (const t of SYNC_TABLES) expect(TABLES.has(t), `no create table for ${t}`).toBe(true)
  })

  it('picks up columns added by later migrations, not just create table', () => {
    expect(TABLES.get('sets')).toContain('set_type')
    expect(TABLES.get('exercises')).toContain('machine_setup')
  })
})

describe('pkOf matches the real schema', () => {
  it.each([...SYNC_TABLES])('%s is keyed by a column that exists', (table) => {
    expect(TABLES.get(table)).toContain(pkOf(table))
  })

  /**
   * The exact bug. profile has no `id`, so anything keying on `id` for it is
   * writing a column Postgres will refuse.
   */
  it('profile has no id column, so pkOf must not claim one', () => {
    expect(TABLES.get('profile')!.has('id')).toBe(false)
    expect(pkOf('profile')).toBe('user_id')
  })

  it('every other synced table does have id', () => {
    for (const t of SYNC_TABLES) {
      if (t === 'profile') continue
      expect(TABLES.get(t), `${t} is missing id`).toContain('id')
    }
  })
})

describe('columns every synced table carries', () => {
  it('has user_id, updated_at and deleted_at, so RLS and tombstones work', () => {
    for (const t of SYNC_TABLES) {
      const cols = TABLES.get(t)!
      for (const required of ['user_id', 'updated_at', 'deleted_at']) {
        expect(cols, `${t} is missing ${required}`).toContain(required)
      }
    }
  })
})
