import { useEffect, useState } from 'react'
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from '../db/sync'

/**
 * Sync indicator.
 *
 * Small, non-modal, and silent when there is nothing to say (brief 4). It never
 * blocks: a write is already safe in IndexedDB by the time this renders, so the
 * pill reports progress rather than gating on it.
 */
export function SyncPill() {
  const [s, setS] = useState<SyncStatus>(getSyncStatus)

  useEffect(() => subscribeSync(setS), [])

  const offline = !s.online
  const pending = s.pending > 0
  if (!offline && !pending) return null

  const stuck = s.stuck > 0
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
    <button
      type="button"
      onClick={() => void syncNow({ manual: true })}
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
  )
}
