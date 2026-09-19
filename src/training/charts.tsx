import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { shortDate } from '../lib/dates'

/**
 * Chart primitives.
 *
 * Conventions applied throughout, so no individual chart has to remember them:
 * recessive grid and axes, 2px lines, 8px markers, rounded-lg data-ends anchored
 * to the baseline, a 2px surface gap between stacked segments, and a tooltip on
 * everything. Colours come from --series-N, which are validated slots - assign
 * by slot, never cycle.
 */

export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
] as const

/** Recharts types the tooltip label as ReactNode, so narrow rather than assert. */
const fmtLabel = (d: unknown) => (typeof d === 'string' ? shortDate(d) : String(d ?? ''))

const axis = {
  stroke: 'var(--border)',
  tick: { fill: 'var(--text-dim)', fontSize: 12 },
  tickLine: false,
} as const

function TooltipBox({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string | number
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload
        .filter((p) => p.value !== undefined && p.value !== null && p.value !== 0)
        .map((p, i) => (
          <p key={i} className="tabular flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-text-dim">{p.name}</span>
            <span className="font-medium">
              {p.value}
              {/* A non-breaking space, so "60 kg" never wraps in a tooltip
                  narrower than the text it is holding. */}
              {unit ? ` ${unit}` : ''}
            </span>
          </p>
        ))}
    </div>
  )
}

export function ChartCard({
  title,
  note,
  right,
  children,
  empty,
}: {
  title: string
  note?: ReactNode
  right?: ReactNode
  children: ReactNode
  empty?: string
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <header className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </header>
      {note && <p className="mb-2 text-xs text-text-dim">{note}</p>}
      {empty ? <p className="py-6 text-center text-sm text-text-dim">{empty}</p> : children}
    </section>
  )
}

/** Single-series line. One series needs no legend - the card title names it. */
export function TimeLine({
  data,
  unit,
  dataKey = 'value',
}: {
  data: Array<Record<string, unknown>>
  unit?: string
  dataKey?: string
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => shortDate(d)}
          {...axis}
          minTickGap={24}
        />
        <YAxis {...axis} width={52} domain={['dataMin - 2', 'dataMax + 2']} />
        <Tooltip
          content={<TooltipBox unit={unit} />}
          labelFormatter={fmtLabel}
          cursor={{ stroke: 'var(--text-dim)', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          name="Estimated 1RM"
          stroke="var(--series-1)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: 'var(--series-1)' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Single-series bars, rounded-lg at the data end only. */
export function TimeBars({ data, unit }: { data: Array<Record<string, unknown>>; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => shortDate(d)} {...axis} minTickGap={24} />
        <YAxis {...axis} width={56} />
        <Tooltip
          content={<TooltipBox unit={unit} />}
          labelFormatter={fmtLabel}
          cursor={{ fill: 'var(--surface-2)' }}
        />
        <Bar
          dataKey="value"
          name="Tonnage"
          fill="var(--series-1)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Stacked bars for weekly volume by muscle group.
 *
 * Each segment carries a 2px stroke in the surface colour, which reads as a gap
 * between fills and keeps adjacent hues from touching - the secondary encoding
 * the palette's CVD floor band asks for.
 */
export function StackedWeeks({
  data,
  keys,
}: {
  data: Array<Record<string, string | number>>
  keys: string[]
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="week" tickFormatter={(w: string) => w.split('-W')[1] ?? w} {...axis} />
        <YAxis {...axis} width={40} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<TooltipBox />} />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            name={k}
            stackId="a"
            fill={SERIES[i % SERIES.length]}
            stroke="var(--surface)"
            strokeWidth={2}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Bodyweight: faint dailies, emphasised 7-day average. Two series, so a legend. */
export function BodyweightChart({ data }: { data: Array<Record<string, unknown>> }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => shortDate(d)} {...axis} minTickGap={24} />
        <YAxis {...axis} width={52} domain={['dataMin - 1', 'dataMax + 1']} />
        <Tooltip
          content={<TooltipBox unit="kg" />}
          labelFormatter={fmtLabel}
          cursor={{ stroke: 'var(--text-dim)', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          name="Daily"
          stroke="var(--text-dim)"
          strokeWidth={1}
          dot={{ r: 2, strokeWidth: 0, fill: 'var(--text-dim)' }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="ma7"
          name="7-day average"
          stroke="var(--series-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Identity is never colour alone: a swatch plus its label, in text ink. */
export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs text-text-dim">
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
