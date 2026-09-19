import { useEffect, useRef, useState } from 'react'

/**
 * A debounced free-text field that saves itself.
 *
 * Extracted from SessionNotes when per-exercise notes arrived, because the
 * fiddly parts are the same for both and neither is the part anyone remembers
 * to get right twice: re-seed only when the SUBJECT changes, never when the
 * saved value does, and flush a pending debounce on unmount.
 *
 * Deliberately unstructured. It is the place for the things worth remembering
 * that no field will ever have, and the moment it grows a taxonomy it stops
 * being somewhere you can type in eight seconds between sets.
 */
export function NoteField({
  id,
  label,
  collapsedLabel,
  placeholder,
  value,
  subject,
  rows = 3,
  openClassName,
  collapsedClassName,
  onSave,
}: {
  id: string
  /** Heading above the open field. */
  label: string
  /** The resting trigger when there is nothing stored, e.g. "+ Note". */
  collapsedLabel: string
  placeholder: string
  value: string | null
  /**
   * What this note belongs to - a workout id, or workout+exercise. Changing it
   * re-seeds the field; changing the saved text does not.
   */
  subject: string
  rows?: number
  /**
   * Applied to the OPEN field's container only. The collapsed state is a bare
   * dashed button by design - wrapping that in a card would draw a box around
   * a button whose whole job is to be unobtrusive until there is something in
   * it.
   */
  openClassName?: string
  /**
   * Overrides the collapsed trigger's styling. The session note wants a
   * full-width dashed box; a per-exercise note sitting under an already tall
   * log block wants to be a line of text.
   */
  collapsedClassName?: string
  onSave: (next: string) => Promise<void>
}) {
  const [text, setText] = useState(value ?? '')
  const [open, setOpen] = useState(Boolean(value))
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle')

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read by the unmount cleanup, which must not re-run on every keystroke.
  const latest = useRef(text)
  latest.current = text
  // Likewise: the cleanup must call the CURRENT save without depending on it.
  const save = useRef(onSave)
  save.current = onSave

  /**
   * Re-seed only when the subject itself changes.
   *
   * Deliberately NOT keyed on `value`. Saving updates the row, the live query
   * re-renders with the new value, and if that fed back into state it would
   * overwrite anything typed in the meantime with the value from 600ms ago. It
   * also means a background sync cannot yank text out from under you
   * mid-sentence, which is the right call for a field only one device edits.
   */
  useEffect(() => {
    const row = value ?? ''
    setText(row)
    setOpen(Boolean(row))
    setStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject])

  /**
   * Debounced: every keystroke is otherwise a Dexie write plus an outbox row to
   * flush. 600ms coalesces a sentence and still saves if the phone goes down
   * mid-word.
   */
  function edit(next: string) {
    setText(next)
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void save.current(next).then(() => setStatus('saved'))
    }, 600)
  }

  // Flush a pending debounce on unmount, or the last few characters typed
  // before navigating away are lost.
  useEffect(() => {
    return () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = null
      void save.current(latest.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          collapsedClassName ??
          'min-h-11 w-full rounded-lg border border-dashed border-border text-sm ' +
            'font-medium text-text-dim'
        }
      >
        {collapsedLabel}
      </button>
    )
  }

  return (
    <div className={openClassName}>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-text-dim">
          {label}
        </label>
        <span aria-live="polite" className="text-xs text-text-dim">
          {status === 'pending' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        id={id}
        value={text}
        onChange={(e) => edit(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-border bg-surface-2 p-2 text-base
                   outline-none focus:border-accent"
      />
    </div>
  )
}
