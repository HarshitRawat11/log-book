import type { ReactNode } from 'react'

/**
 * Standard screen chrome: a scrolling body between the status bar and the tab
 * bar, with the header safe-area padded so it clears the Android status bar in
 * standalone display mode.
 */
export function Screen({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header
        className="sticky top-0 z-10 border-b border-border bg-bg/95 px-4 pb-3 backdrop-blur
                   pt-[calc(env(safe-area-inset-top)+0.875rem)]"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {actions}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-text-dim">{subtitle}</p>}
      </header>

      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  )
}
