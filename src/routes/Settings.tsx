import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { mmss } from '../cardio/schedule'
import { getDefaultRest, setDefaultRest } from '../training/session'
import { Screen } from '../components/Screen'
import { SyncPill } from '../components/SyncPill'
import { useAuth } from '../auth/AuthProvider'
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from '../db/sync'
import { collectDiagnostics, formatDiagnostics } from '../lib/diagnostics'
import { Targets } from '../food/Targets'
import {
  exportBodyweightCsv,
  exportCardioCsv,
  exportFoodCsv,
  exportJson,
  exportSetsCsv,
} from '../lib/export'

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
  const [update, setUpdate] = useState<'idle' | 'checking' | 'found' | 'current'>('idle')
  const [diag, setDiag] = useState<string | null>(null)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')

  useEffect(() => subscribeSync(setSync), [])

  async function copyDiagnostics() {
    const text = formatDiagnostics(await collectDiagnostics())
    try {
      await navigator.clipboard.writeText(text)
      setCopied('ok')
      setTimeout(() => setCopied('idle'), 2500)
    } catch {
      // Clipboard access can be refused - a non-secure context, or the page not
      // being focused. Falling back to showing the text beats a dead button.
      setCopied('failed')
      setDiag(text)
    }
  }

  async function showDiagnostics() {
    setDiag(diag ? null : formatDiagnostics(await collectDiagnostics()))
  }

  /**
   * The service worker only swaps on demand (registerType 'prompt'), which is
   * right - a background reload mid-set is not acceptable - but it means a
   * phone can sit on an old bundle indefinitely if the update pill is missed.
   * This is the manual escape hatch, next to the build stamp that reveals it.
   */
  async function checkForUpdate() {
    setUpdate('checking')
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      let found = false
      for (const r of regs) {
        await r.update()
        if (r.waiting || r.installing) found = true
      }
      setUpdate(found ? 'found' : 'current')
    } catch {
      setUpdate('current')
    }
  }

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
        // Filled: everything else on Settings is a field you edit in place, so
        // this is the only action on the screen, and gate 3b wants one that
        // survives greyscale.
        className="mt-3 min-h-12 w-full rounded-lg bg-accent font-semibold text-accent-text
                   disabled:opacity-40"
      >
        Sync now
      </button>

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Library</h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        <Link to="/exercises" className="flex min-h-14 items-center justify-between px-4">
          <span>Exercises</span>
          <span aria-hidden="true" className="text-text-dim">
            ›
          </span>
        </Link>
        <Link to="/history" className="flex min-h-14 items-center justify-between px-4">
          <span>Workout history</span>
          <span aria-hidden="true" className="text-text-dim">
            ›
          </span>
        </Link>
        <Link to="/foods" className="flex min-h-14 items-center justify-between px-4">
          <span>Foods and recipes</span>
          <span aria-hidden="true" className="text-text-dim">
            ›
          </span>
        </Link>
      </div>

      <RestLength />

      <Targets />

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Version</h2>
      <section className="rounded-2xl border border-border bg-surface">
        <Row label="Build" value={__BUILD_SHA__} />
        <Row label="Committed" value={new Date(__BUILD_TIME__).toLocaleString('en-GB')} />
      </section>
      <button
        onClick={() => void checkForUpdate()}
        className="mt-3 min-h-12 w-full rounded-lg border border-border bg-surface font-medium"
      >
        {update === 'checking'
          ? 'Checking…'
          : update === 'found'
            ? 'Update found — reload to apply'
            : update === 'current'
              ? 'Already up to date'
              : 'Check for updates'}
      </button>
      {update === 'found' && (
        <button
          onClick={() => window.location.reload()}
          className="mt-2 min-h-12 w-full rounded-lg bg-accent font-semibold text-accent-text"
        >
          Reload now
        </button>
      )}

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Export</h2>
      <p className="mb-2 px-1 text-xs text-text-dim">
        Everything is exported from this device, so it works offline and includes anything not yet
        synced.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void exportJson()}
          className="min-h-12 rounded-lg border border-border bg-surface text-sm font-medium"
        >
          All data (JSON)
        </button>
        <button
          onClick={() => void exportSetsCsv()}
          className="min-h-12 rounded-lg border border-border bg-surface text-sm font-medium"
        >
          Sets (CSV)
        </button>
        <button
          onClick={() => void exportFoodCsv()}
          className="min-h-12 rounded-lg border border-border bg-surface text-sm font-medium"
        >
          Food log (CSV)
        </button>
        <button
          onClick={() => void exportBodyweightCsv()}
          className="min-h-12 rounded-lg border border-border bg-surface text-sm font-medium"
        >
          Bodyweight (CSV)
        </button>
        <button
          onClick={() => void exportCardioCsv()}
          className="min-h-12 rounded-lg border border-border bg-surface text-sm font-medium"
        >
          Cardio (CSV)
        </button>
      </div>

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Diagnostics</h2>
      <p className="mb-2 px-1 text-xs text-text-dim">
        A snapshot of build, sync and storage state. No tokens, and no workout data — outbox
        entries list their field names only.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => void copyDiagnostics()}
          className="min-h-12 flex-1 rounded-lg border border-border bg-surface font-medium"
        >
          {copied === 'ok'
            ? 'Copied'
            : copied === 'failed'
              ? 'Copy failed — shown below'
              : 'Copy diagnostics'}
        </button>
        <button
          onClick={() => void showDiagnostics()}
          className="min-h-12 rounded-lg border border-border bg-surface px-4 text-sm"
        >
          {diag ? 'Hide' : 'View'}
        </button>
      </div>
      {diag && (
        <textarea
          readOnly
          value={diag}
          onFocus={(e) => e.currentTarget.select()}
          rows={14}
          className="mt-2 w-full rounded-lg border border-border bg-surface-2 p-3 font-mono
                     text-xs outline-none"
        />
      )}

      {blocked !== null ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 p-4">
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
          className="mt-6 min-h-14 w-full rounded-lg border border-border bg-surface px-4
                     font-semibold text-danger"
        >
          Sign out
        </button>
      )}
    </Screen>
  )
}


/**
 * How long a rest is, by default.
 *
 * Its own control because "set manually, not hardcoded" is the rule this app
 * was built to for the cardio timer, and a rest length is the same kind of
 * number - 90 seconds on curls and three minutes on a heavy press are both
 * correct, for different people on different days.
 *
 * Stored in local-only `meta`, so it does not sync. Deliberate: it is a
 * preference about this device, losing it costs one number retyped, and a
 * migration to sync a number changed twice a year is not a trade worth making.
 */
function RestLength() {
  const seconds = useLiveQuery(getDefaultRest, [], null)
  if (seconds === null) return null

  const step = async (delta: number) => {
    await setDefaultRest(seconds + delta)
  }

  return (
    <>
      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-dim">Rest timer</h2>
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => void step(-15)}
            disabled={seconds <= 15}
            aria-label="Shorten the default rest by 15 seconds"
            className="min-h-12 w-12 shrink-0 rounded-lg border border-border text-lg
                       disabled:opacity-40"
          >
            −
          </button>
          <p className="tabular flex-1 text-center text-2xl font-semibold">{mmss(seconds)}</p>
          <button
            onClick={() => void step(15)}
            disabled={seconds >= 600}
            aria-label="Lengthen the default rest by 15 seconds"
            className="min-h-12 w-12 shrink-0 rounded-lg border border-border text-lg
                       disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="mt-3 text-xs text-text-dim">
          Starts automatically when you log a set, with a warning ten seconds before the end and a
          bell at zero. Warm-ups do not start one. You can stretch or skip any individual rest from
          the bar without changing this.
        </p>
      </section>
    </>
  )
}
