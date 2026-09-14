import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

/* Inline SVG rather than an icon package: four glyphs do not justify a
   dependency, and these inherit currentColor for free. */

const icons: Record<string, ReactNode> = {
  train: (
    <>
      <path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8" />
    </>
  ),
  food: (
    <>
      <path d="M5 3v8a3 3 0 0 0 6 0V3M8 3v18" />
      <path d="M17 3c-1.5 2-2 4-2 6s.5 3 2 3 2-1 2-3-.5-4-2-6zM17 12v9" />
    </>
  ),
  progress: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  cardio: (
    <>
      {/* A stopwatch: the tab is the timer, not "some cardio". */}
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6M18.5 5.5l1.5-1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
}

const tabs = [
  { to: '/train', label: 'Train', icon: 'train' },
  { to: '/food', label: 'Food', icon: 'food' },
  { to: '/cardio', label: 'Cardio', icon: 'cardio' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
] as const

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      // pb picks up the Android gesture bar via safe-area-inset so the tabs are
      // never sitting underneath it.
      className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                [
                  // 60px tall: comfortably past the 44px minimum tap target,
                  // and this is the control used most while out of breath.
                  'flex min-h-15 flex-col items-center justify-center gap-1 py-2 text-[11px]',
                  isActive ? 'text-accent' : 'text-text-dim',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isActive ? 2.4 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {icons[t.icon]}
                  </svg>
                  <span className={isActive ? 'font-semibold' : undefined}>{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
