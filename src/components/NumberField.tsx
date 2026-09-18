/**
 * Numeric field for weights and reps.
 *
 * inputMode="decimal" so the numeric keypad opens rather than the full
 * keyboard (brief 7.1). type="text" rather than type="number" deliberately:
 * number inputs silently discard what they consider invalid intermediate
 * states, which on a phone means a half-typed "62." can vanish under your
 * thumb. We validate on our own terms instead.
 */
export function NumberField({
  label,
  value,
  onChange,
  step,
  min = 0,
  grow = 1,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  step: number
  min?: number
  /**
   * Share of the row, against the other fields beside it.
   *
   * Weight and reps are not the same size of number. Reps is two digits;
   * weight is "137.5". Split evenly, the weight box came out at 53px and
   * clipped "62.5" - the same failure the logging screen's layout comment
   * warns about, reintroduced by putting a button on the row.
   */
  grow?: number
}) {
  const nudge = (delta: number) => {
    const current = Number(value === '' ? 0 : value)
    const next = Math.max(min, Number((current + delta).toFixed(2)))
    onChange(String(next))
  }

  return (
    <div style={{ flex: `${grow} 1 0%` }}>
      <label className="mb-1 block text-xs text-text-dim">{label}</label>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(-step)}
          className="h-12 w-10 shrink-0 rounded-lg border border-border bg-surface-2 text-xl
                     leading-none text-text-dim active:bg-border"
        >
          −
        </button>
        <div className="flex-1">
          <input
            inputMode="decimal"
            enterKeyHint="done"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={label}
            className="tabular h-12 w-full rounded-lg border border-border bg-surface px-1
                       text-center text-xl font-semibold outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => nudge(step)}
          className="h-12 w-10 shrink-0 rounded-lg border border-border bg-surface-2 text-xl
                     leading-none text-text-dim active:bg-border"
        >
          +
        </button>
      </div>
    </div>
  )
}
