import { useState, type ReactNode } from 'react'

/**
 * A destructive action behind one deliberate step.
 *
 * The `warning` should say what is actually lost, in numbers where there are
 * numbers - "and all 14 of its sets" is a decision, "are you sure?" is not.
 *
 * Extracted because the pattern was written once for sessions and then not
 * applied to foods, recipes or exercises, all of which deleted on a single tap
 * with no warning at all.
 */
export function ConfirmDelete({
  label,
  warning,
  confirmLabel = 'Delete',
  onConfirm,
}: {
  /** The resting trigger, e.g. "Delete food". */
  label: string
  warning: ReactNode
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="min-h-11 text-sm text-danger">
        {label}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
      <p className="text-sm leading-relaxed">{warning}</p>
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              // The caller usually navigates away; if it does not, close up.
              setBusy(false)
              setOpen(false)
            }
          }}
          className="min-h-11 flex-1 rounded-lg bg-danger px-3 text-sm font-semibold text-white
                     disabled:opacity-50"
        >
          {busy ? 'Deleting…' : confirmLabel}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-lg border border-border px-3 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
