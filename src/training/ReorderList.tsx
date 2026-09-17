import { useEffect, useRef, useState } from 'react'

/**
 * Drag to reorder the exercises in a session.
 *
 * A separate MODE rather than handles on the cards themselves. A card is three
 * to six hundred pixels tall, so dragging one means a long slow travel past
 * everything else on a scrolling page, fighting the scroll the whole way. In
 * reorder mode the same lifts collapse to fixed-height rows, which makes the
 * travel short and the index arithmetic exact.
 *
 * Pointer Events rather than HTML5 drag-and-drop: `dragstart` does not fire
 * from touch on Android Chrome at all, so the native API would have produced a
 * feature that worked only on the desktop this was written on.
 *
 * Nothing is written until Done. The order lives in the local-only `meta`
 * table - it is presentation state, and losing it costs a re-drag, never a set.
 */

/** Fixed, and the whole reason the index maths is a division. */
const ROW_H = 52

export type ReorderItem = { id: string; name: string; sets: number }

export function ReorderList({
  items,
  onDone,
  onCancel,
}: {
  items: ReorderItem[]
  /** Called with the final order, newest first in the list's own terms. */
  onDone: (ids: string[]) => void
  onCancel: () => void
}) {
  const [order, setOrder] = useState<ReorderItem[]>(items)
  const [dragId, setDragId] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)

  // Where the drag began, in both senses. Held in a ref because pointermove
  // fires far more often than React should re-render.
  const from = useRef<{ y: number; index: number; current: number } | null>(null)

  /**
   * Re-seed only when the MEMBERSHIP changes, and never mid-drag.
   *
   * Keyed on the array identity, this reset the order on every parent render -
   * and the parent re-renders on every live-query tick, so a drag was undone
   * within milliseconds of making it. The symptom was a row that followed the
   * finger by a couple of pixels and snapped back: the reorder was happening,
   * and then being overwritten before it could be seen.
   *
   * The drag guard matters too. An exercise appearing while a row is in the
   * air would otherwise yank the list out from under it.
   */
  const signature = items.map((i) => i.id).join(',')
  useEffect(() => {
    if (from.current) return
    setOrder(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  function begin(e: React.PointerEvent, id: string, index: number) {
    // Capture so the drag survives the finger leaving the handle, which it
    // does immediately. Guarded because capture throws if the pointer is not
    // active - which is never true of a real touch, and always true of a
    // synthesised one, so without this the whole thing is untestable.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Drag still works; it just ends if the pointer leaves the element.
    }
    from.current = { y: e.clientY, index, current: index }
    setDragId(id)
    setOffset(0)
  }

  function move(e: React.PointerEvent) {
    const f = from.current
    if (!f) return

    const delta = e.clientY - f.y
    // Measured from where the drag STARTED, not from the row's current slot:
    // the row moves under the finger as the list reshuffles, and measuring
    // against the moving target makes it oscillate between two positions.
    const target = Math.max(0, Math.min(order.length - 1, f.index + Math.round(delta / ROW_H)))

    if (target !== f.current) {
      // Read out of the ref BEFORE the updater, not inside it. A React updater
      // runs during the next render, by which point `f.current = target` below
      // has already happened - so the splice removed and reinserted at the same
      // index and the row appeared to stick one slot from where it started.
      const fromIndex = f.current
      setOrder((prev) => {
        const next = [...prev]
        const [row] = next.splice(fromIndex, 1)
        next.splice(target, 0, row!)
        return next
      })
      f.current = target
    }
    // Keep the dragged row under the finger; the others snap to their slots.
    setOffset(delta - (f.current - f.index) * ROW_H)
  }

  function end() {
    from.current = null
    setDragId(null)
    setOffset(0)
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-2">
      <p className="px-2 py-1 text-sm text-text-dim">Drag to reorder</p>

      <ul className="relative select-none" style={{ height: order.length * ROW_H }}>
        {order.map((item, i) => {
          const dragging = item.id === dragId
          return (
            <li
              key={item.id}
              className={[
                'absolute inset-x-0 flex items-center gap-2 rounded-lg pr-2',
                dragging ? 'z-10 bg-surface-2 shadow-lg' : 'transition-transform',
              ].join(' ')}
              style={{
                height: ROW_H,
                transform: `translateY(${i * ROW_H + (dragging ? offset : 0)}px)`,
              }}
            >
              {/* The handle is the only draggable part, so the row itself can
                  still be scrolled past without picking it up by accident.
                  touch-action:none stops Chrome claiming the gesture. */}
              <button
                onPointerDown={(e) => begin(e, item.id, i)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                aria-label={`Drag ${item.name} to reorder`}
                className="size-11 shrink-0 cursor-grab touch-none text-lg text-text-dim"
              >
                ≡
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
              <span className="tabular shrink-0 text-xs text-text-dim">
                {item.sets} set{item.sets === 1 ? '' : 's'}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onDone(order.map((o) => o.id))}
          className="min-h-12 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-text"
        >
          Done
        </button>
        <button onClick={onCancel} className="min-h-12 rounded-lg border border-border px-4 text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}
