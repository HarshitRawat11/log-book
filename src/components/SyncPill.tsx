import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from '../db/sync'

/**
 * Sync indicator.
 *
 * Small, non-modal, and silent when there is nothing to say (brief 4). It never
 * blocks: a write is already safe in IndexedDB by the time this renders, so the
 * pill reports progress rather than gating on it.
 *
 * A STUCK pill opens. It used to say only how many writes had failed, which is
 * the one number that cannot be acted on - a real duplicate-name rejection sat
 * at 52 attempts for two days because the reason existed only in Settings ->
 * Diagnostics and nothing on screen pointed there.
 */
export function SyncPill() {
  const [s, setS] = useState<SyncStatus>(getSyncStatus)
  const [open, setOpen] = useState(false)

  useEffect(() => subscribeSync(setS), [])

  const stuck = s.stuck > 0
  // Whatever was wrong has cleared; do not leave a stale panel hanging open.
  useEffect(() => {
    if (!stuck) setOpen(false)
  }, [stuck])

  const offline = !s.online
  const pending = s.pending > 0
  if (!offline && !pending) return null

  const label = offline
    ? pending
      ? `Offline · ${s.pending} to sync`
      : 'Offline'
    : stuck
      ? `${s.stuck} stuck`
      : s.flushing
        ? `Syncing ${s.pending}…`
        : `${s.pending} to sync`

  return (
    <div className="relative">
      <button
        type="button"
        // Stuck opens the detail; anything else is a plain "try now", because
        // there is nothing to explain about a write that is merely queued.
        onClick={() => (stuck ? setOpen((v) => !v) : void syncNow({ manual: true }))}
        aria-expanded={stuck ? open : undefined}
        title={s.lastError ?? undefined}
        className={[
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          stuck
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-border bg-surface-2 text-text-dim',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'size-1.5 rounded-full',
            offline ? 'bg-text-dim' : stuck ? 'bg-danger' : 'bg-accent',
            s.flushing ? 'animate-pulse' : '',
          ].join(' ')}
        />
        {label}
      </button>

      {open && s.stuckDetail && (
        <div
          role="status"
          // Right-aligned under the pill and 288px wide, which clears 375px
          // with the header's own padding.
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-danger/40
                     bg-surface p-3 text-left shadow-lg"
        >
          <p className="text-xs font-medium">
            {s.stuckDetail.table} · {s.stuckDetail.attempts} attempts
          </p>
          {/* Verbatim. The constraint name is the part that identifies it, and
              a friendlier paraphrase would be the part that gets dropped. */}
          <p className="mt-1 break-words text-xs leading-relaxed text-text-dim">
            {s.stuckDetail.error ?? 'No error recorded yet.'}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            Nothing is lost — it retries. Writes to this table wait behind it.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void syncNow({ manual: true })}
              className="min-h-11 flex-1 rounded-lg border border-border bg-surface-2 text-xs
                         font-medium"
            >
              Try again
            </button>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-lg border border-border px-3 text-xs
                         font-medium text-text-dim"
            >
              Diagnostics
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
