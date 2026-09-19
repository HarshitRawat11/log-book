import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service worker update notice.
 *
 * Non-modal and dismissible, deliberately. The alternative (registerType
 * 'autoUpdate') can reload the app shell mid-session, and losing an
 * in-progress set to a background deploy is not a trade worth making.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-lg items-center gap-3
                 rounded-lg border border-border bg-surface-2 px-4 py-3 shadow-lg"
    >
      <span className="flex-1 text-sm">A new version is ready.</span>
      <button
        onClick={() => void updateServiceWorker(true)}
        className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-text"
      >
        Reload
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
        className="min-h-11 px-2 text-sm text-text-dim"
      >
        Later
      </button>
    </div>
  )
}
