import type { ReactNode } from 'react'

/**
 * Every list needs a designed empty state that says what to do next (brief 8).
 *
 * The `action` is the point of this component. An empty state that only
 * explains why a list is empty has wasted the screen.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed
                    border-border px-6 py-12 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-xs text-sm leading-relaxed text-text-dim">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
