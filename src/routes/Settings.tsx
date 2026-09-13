import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { SyncPill } from '../components/SyncPill'
import { useAuth } from '../auth/AuthProvider'
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from '../db/sync'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
      <span className="text-sm text-text-dim">{label}</span>
      <span className="tabular truncate text-sm">{value}</span>
    </div>
  )
}

export function Settings() {
  const { session, signOut } = useAuth()
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus)
  const [blocked, setBlocked] = useState<number | null>(null)

  useEffect(() => subscribeSync(setSync), [])

  async function doSignOut(force = false) {
    const r = await signOut({ force })
    if (!r.ok) setBlocked(r.pending)
  }

  return (
    <Screen title="Settings" actions={<SyncPill />}>
      <section className="rounded-2xl border border-border bg-surface">
        <Row label="Signed in as" value={session?.user.email ?? '—'} />
        <Row label="Units" value="Kilograms and grams" />
        <Row label="Region" value="ap-south-1 (Mumbai)" />
      </section>

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Sync</h2>
      <section className="rounded-2xl border border-border bg-surface">
        <Row label="Connection" value={sync.online ? 'Online' : 'Offline'} />
        <Row label="Waiting to sync" value={String(sync.pending)} />
        {sync.stuck > 0 && <Row label="Stuck" value={String(sync.stuck)} />}
        <Row
          label="Last synced"
          value={sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString('en-GB') : 'never'}
        />
      </section>
      {sync.lastError && (
        <p className="mt-2 px-1 text-xs text-danger">Last error: {sync.lastError}</p>
      )}
      <button
        onClick={() => void syncNow({ manual: true })}
        disabled={!sync.online}
        className="mt-3 min-h-12 w-full rounded-xl border border-border bg-surface font-medium
                   disabled:opacity-40"
      >
        Sync now
      </button>

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Library</h2>
      <Link
        to="/exercises"
        className="flex min-h-14 items-center justify-between rounded-2xl border border-border
                   bg-surface px-4"
      >
        <span>Exercises</span>
        <span aria-hidden="true" className="text-text-dim">
          ›
        </span>
      </Link>

      <p className="mt-6 px-1 text-sm text-text-dim">
        Diet targets, the BMR calculator and data export arrive in later phases.
      </p>

      {blocked !== null ? (
        <div className="mt-6 rounded-xl border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm">
            {blocked} change{blocked === 1 ? '' : 's'} {blocked === 1 ? 'has' : 'have'} not reached
            the server yet. Signing out clears this device, so {blocked === 1 ? 'it' : 'they'} would
            be lost.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void syncNow({ manual: true })}
              className="min-h-11 flex-1 rounded-lg bg-accent px-3 text-sm font-semibold
                         text-accent-text"
            >
              Try syncing
            </button>
            <button
              onClick={() => void doSignOut(true)}
              className="min-h-11 rounded-lg border border-danger/40 px-3 text-sm text-danger"
            >
              Sign out anyway
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => void doSignOut()}
          className="mt-6 min-h-14 w-full rounded-xl border border-border bg-surface px-4
                     font-semibold text-danger"
        >
          Sign out
        </button>
      )}
    </Screen>
  )
}
