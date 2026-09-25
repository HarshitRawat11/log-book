import { useLayoutEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { SyncPill } from '../components/SyncPill'
import { db } from '../db/db'
import { deleteRow } from '../db/mutate'
import { scheduleFlush } from '../db/sync'
import { AddFood } from '../food/AddFood'
import { rollingAverage, totalLogged } from '../food/macros'
import { logByDate, logForDate, MEAL_SLOTS, type MealSlot } from '../food/queries'
import { todayIso } from '../lib/dates'

/**
 * The meal you are most likely logging into, by the clock.
 *
 * Only used to decide which of the four Add buttons is filled. Four filled
 * buttons would be four dominant elements, which is no hierarchy at all and
 * exactly the "busy" the intent brief rules out; none would leave the screen
 * with no prominent action, which is what gate 3b caught. One is the answer,
 * and the clock is the only signal available for choosing it.
 *
 * Getting it wrong costs nothing: the other three are still there, still one
 * tap away, and look exactly as they always did.
 */
function slotNow(now = new Date()): MealSlot {
  const h = now.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

/**
 * Today's food log.
 *
 * The 7-day average sits directly under the daily total and is given the same
 * weight, because a single day means very little (brief 7.4).
 */
export function Food() {
  const date = todayIso()
  // Safe because this screen is always today - there is no date picker here.
  const nowSlot = slotNow()
  const [addingTo, setAddingTo] = useState<MealSlot | null>(null)

  const entries = useLiveQuery(() => logForDate(date), [date], [])
  const window7 = useLiveQuery(() => logByDate(date, 7), [date, entries?.length], undefined)
  const profile = useLiveQuery(async () => (await db.profile.toArray())[0] ?? null, [], undefined)

  const today = totalLogged(entries ?? [])
  const avg = window7 ? rollingAverage(window7, date, 7) : null

  const pretty = new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const kcalTarget = profile?.kcal_target ?? null
  const proteinTarget = profile?.protein_g_target ?? null

  /**
   * Opening the form from the button at the top means the form itself is
   * usually below the fold, and a button that opens something you cannot see
   * is worse than no button. Armed on that tap only, so tapping a meal's own
   * Add - already in view - does not yank the page.
   *
   * `auto`, not `smooth`: nothing else in this app animates, and a smooth
   * scroll does not run at all on a hidden page, which makes it untestable.
   */
  const armed = useRef(false)
  useLayoutEffect(() => {
    if (!armed.current || !addingTo) return
    armed.current = false
    document.getElementById(`meal-${addingTo}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }, [addingTo])

  return (
    <Screen
      title="Food"
      subtitle={pretty}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/foods"
            className="flex min-h-11 items-center rounded-full border border-border bg-surface-2
                       px-3 text-xs font-medium text-text-dim active:bg-border"
          >
            Library
          </Link>
          <SyncPill />
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-4">
        {/* Today */}
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="tabular text-2xl font-semibold">{Math.round(today.kcal)}</span>
            <span className="text-sm text-text-dim">
              {kcalTarget ? `of ${Math.round(kcalTarget)} kcal` : 'kcal today'}
            </span>
          </div>
          {kcalTarget && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, (today.kcal / kcalTarget) * 100)}%` }}
              />
            </div>
          )}
          <div className="tabular mt-3 grid grid-cols-4 gap-2 text-center text-xs">
            <Macro label="Protein" value={today.protein_g} target={proteinTarget} />
            <Macro label="Carbs" value={today.carbs_g} target={profile?.carbs_g_target ?? null} />
            <Macro label="Fat" value={today.fat_g} target={profile?.fat_g_target ?? null} />
            <Macro label="Fibre" value={today.fibre_g} target={null} />
          </div>
        </section>

        {/* 7-day average - given equal billing, per the brief */}
        <section className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-text-dim">7-day average</p>
          {avg ? (
            <>
              <p className="tabular mt-1 text-lg font-semibold">
                {Math.round(avg.kcal)} kcal
                <span className="ml-2 text-sm font-normal text-text-dim">
                  {avg.protein_g.toFixed(0)}&nbsp;g protein
                </span>
              </p>
              <p className="mt-1 text-xs text-text-dim">
                {avg.days_logged} of 7 days logged
                {avg.days_logged < 7 && ' — blank days count as zero, so this reads low until the week fills'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-dim">Calculating…</p>
          )}
        </section>

        {!kcalTarget && (
          <Link
            to="/settings"
            className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm
                       text-text-dim"
          >
            Set daily targets in Settings to see progress against them →
          </Link>
        )}

        {/* The screen's one filled action, and the only one.

            It used to be the current meal's own Add button, which followed the
            clock - and so fell below the fold for dinner and snack, roughly
            half the day, leaving nothing prominent in view. Here it is above
            the fold whatever the time.

            Placed after the 7-day average rather than above it: the brief
            gives the daily total and the average equal billing and sits them
            together, so a button wedged between them would break the pair.
            This is as high as it goes without doing that. */}
        {addingTo === null && (
          <button
            onClick={() => {
              armed.current = true
              setAddingTo(nowSlot)
            }}
            className="min-h-12 w-full rounded-lg bg-accent font-semibold text-accent-text"
          >
            {/* capitalize on the button would title-case the "to" as well. */}
            + Add to <span className="capitalize">{nowSlot}</span>
          </button>
        )}

        {/* Meals */}
        {MEAL_SLOTS.map((slot) => {
          const forSlot = (entries ?? []).filter((e) => e.meal_slot === slot)
          const slotTotal = totalLogged(forSlot)
          return (
            <section
              key={slot}
              id={`meal-${slot}`}
              className="scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <header className="flex items-baseline justify-between px-4 pt-3">
                <h2 className="font-semibold capitalize">{slot}</h2>
                <span className="tabular text-sm text-text-dim">
                  {forSlot.length ? `${Math.round(slotTotal.kcal)} kcal` : ''}
                </span>
              </header>

              {forSlot.length > 0 && (
                <ul className="mt-2 divide-y divide-border border-y border-border">
                  {forSlot.map((e) => (
                    <li key={e.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{e.name_snapshot}</span>
                        <span className="tabular block text-xs text-text-dim">
                          {Math.round(e.grams)}&nbsp;g · {Math.round(e.kcal)} kcal · P
                          {e.protein_g.toFixed(0)}
                        </span>
                      </span>
                      <button
                        onClick={async () => {
                          await deleteRow('food_log', e.id)
                          scheduleFlush()
                        }}
                        aria-label={`Remove ${e.name_snapshot}`}
                        className="size-11 shrink-0 text-text-dim"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* A slot with nothing in it still says so, rather than leaving the
                  heading floating above an Add button. Four words, not a banner:
                  there are four of these on screen at once. */}
              {forSlot.length === 0 && (
                <p className="px-4 pt-1 text-xs text-text-dim">Nothing logged</p>
              )}

              <div className="p-3">
                {addingTo === slot ? (
                  <AddFood date={date} slot={slot} onClose={() => setAddingTo(null)} />
                ) : (
                  <button
                    onClick={() => setAddingTo(slot)}
                    className="min-h-12 w-full rounded-lg border border-dashed border-border
                               text-sm font-medium text-text-dim"
                  >
                    + Add
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </Screen>
  )
}

function Macro({ label, value, target }: { label: string; value: number; target: number | null }) {
  return (
    <div>
      <div className="font-semibold">{Math.round(value)}</div>
      <div className="text-text-dim">
        {label}
        {target ? ` /${Math.round(target)}` : ''}
      </div>
    </div>
  )
}
