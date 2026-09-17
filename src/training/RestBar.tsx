import { mmss } from '../cardio/schedule'
import type { RestTimer } from './useRestTimer'

/**
 * The rest countdown, floating above the tab bar.
 *
 * Fixed rather than in the document flow, because the whole point is that it
 * stays readable while you scroll the session - and between sets you are
 * scrolling, checking what you did last time. Docked above the tab bar rather
 * than over it: the tabs are still the most-used control on the screen and
 * covering them to show a number would be a bad trade.
 *
 * It is a countdown, which is the opposite of the rule the cardio timer was
 * built to. That rule exists because a round has to be read from across a room
 * with gloves on, where "how long is left" is the only question. Between sets
 * the phone is in your hand and the question really is how long is left, so a
 * countdown is right here and wrong there.
 */
export function RestBar({ timer }: { timer: RestTimer }) {
  const { remaining, total, label, adjust, stop } = timer
  if (remaining === null || total === null) return null

  const done = remaining === 0
  // Elapsed, so the bar drains left to right as the rest runs out.
  const pct = Math.min(100, Math.max(0, ((total - remaining) / total) * 100))

  return (
    <div
      // Above the tab bar, whose height is a token so this cannot drift out of
      // step with it. The safe-area inset is the Android gesture bar.
      className="fixed inset-x-0 z-30 px-3
                 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.5rem)]"
    >
      <div
        className={[
          'relative mx-auto flex max-w-lg items-center gap-2 overflow-hidden rounded-2xl border',
          'bg-surface/95 px-2 py-2 shadow-lg backdrop-blur',
          done ? 'border-accent' : 'border-border',
        ].join(' ')}
      >
        {/* The drain. Behind the controls rather than beside them, so the
            numbers keep the full width at 390px. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent/70 transition-[width]"
          style={{ width: `${pct}%` }}
        />

        <div className="min-w-0 flex-1 px-1">
          <p
            className="tabular text-xl font-semibold leading-none"
            // Announced only at the end: a live region ticking every second
            // would make a screen reader unusable.
            aria-live={done ? 'polite' : 'off'}
          >
            {done ? 'Rest done' : mmss(remaining)}
          </p>
          {label && <p className="mt-0.5 truncate text-xs text-text-dim">{label}</p>}
        </div>

        <button
          onClick={() => adjust(-30)}
          aria-label="Take 30 seconds off this rest"
          className="min-h-11 shrink-0 rounded-lg border border-border px-2.5 text-sm font-medium"
        >
          −30
        </button>
        <button
          onClick={() => adjust(30)}
          aria-label="Add 30 seconds to this rest"
          className="min-h-11 shrink-0 rounded-lg border border-border px-2.5 text-sm font-medium"
        >
          +30
        </button>
        <button
          onClick={stop}
          aria-label={done ? 'Dismiss' : 'Skip the rest of this rest'}
          className="min-h-11 shrink-0 rounded-lg px-2.5 text-sm font-medium text-text-dim"
        >
          {done ? 'Done' : 'Skip'}
        </button>
      </div>
    </div>
  )
}
