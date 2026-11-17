import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDurationHuman, formatShortDate } from '@/services/timeFormat'
import type {
  ActivityComparisonSeries,
  DailySeriesPoint,
  DistributionItem,
  HourlyPoint,
  WeekdayPoint,
} from '@/types'

const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  borderColor: 'var(--border)',
  borderRadius: '6px',
  fontSize: '12px',
  color: 'var(--text)',
  boxShadow: 'none',
}

function secondsToHours(seconds: number): number {
  return Number((seconds / 3600).toFixed(2))
}

export function DailyLineChart({
  data,
  height = 240,
  color = 'var(--accent)',
}: {
  data: DailySeriesPoint[]
  height?: number
  color?: string
}) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatShortDate(d.date),
    hours: secondsToHours(d.total_seconds),
  }))

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={22}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={false}
            tickLine={false}
            unit="h"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(_val: unknown, _name: unknown, props: { payload?: { total_seconds: number } }) => [
              formatDurationHuman(props.payload?.total_seconds ?? 0),
              'Tracked',
            ]}
          />
          <Line
            type="monotone"
            dataKey="hours"
            stroke={color}
            strokeWidth={2}
            dot={chartData.length <= 16 ? { r: 3, fill: color } : false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ActivityDistributionChart({
  items,
  mode,
}: {
  items: DistributionItem[]
  mode: 'bar' | 'donut'
}) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-xs text-fg-subtle">No data for this period.</p>
  }

  const chartData = items.slice(0, 8).map((item) => ({
    ...item,
    hours: secondsToHours(item.total_seconds),
  }))

  if (mode === 'donut') {
    return (
      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
        <div className="h-[220px] sm:col-span-6">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="total_seconds"
                nameKey="name"
                innerRadius={56}
                outerRadius={84}
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: unknown) => [formatDurationHuman(Number(val) || 0), 'Time']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 sm:col-span-6">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="truncate text-fg">{item.name}</span>
              </div>
              <span className="shrink-0 font-mono text-fg-muted tabular-nums">
                {formatDurationHuman(item.total_seconds)} ({item.percentage.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            unit="h"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={115}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(_v: unknown, _n: unknown, props: { payload?: { total_seconds: number } }) => [
              formatDurationHuman(props.payload?.total_seconds ?? 0),
              'Tracked',
            ]}
          />
          <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WeeklyOverviewChart({ data }: { data: WeekdayPoint[] }) {
  const chartData = data.map((d) => ({
    ...d,
    hours: secondsToHours(d.total_seconds),
  }))
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={false}
            tickLine={false}
            unit="h"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(_v: unknown, _n: unknown, props: { payload?: { total_seconds: number } }) => [
              formatDurationHuman(props.payload?.total_seconds ?? 0),
              'Total',
            ]}
          />
          <Bar dataKey="hours" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function HourlyPatternChart({ data }: { data: HourlyPoint[] }) {
  const chartData = data.map((d) => ({
    ...d,
    minutes: Math.round(d.total_seconds / 60),
    shortHour: `${String(d.hour).padStart(2, '0')}`,
  }))

  return (
    <div style={{ width: '100%', height: 190 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="shortHour"
            tick={{ fontSize: 10, fill: 'var(--text-subtle)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--text-subtle)' }}
            axisLine={false}
            tickLine={false}
            unit="m"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(lbl) => `Hour ${lbl}:00`}
            formatter={(_v: unknown, _n: unknown, props: { payload?: { total_seconds: number } }) => [
              formatDurationHuman(props.payload?.total_seconds ?? 0),
              'Logged',
            ]}
          />
          <Bar dataKey="minutes" fill="var(--accent)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ActivityComparisonChart({ series }: { series: ActivityComparisonSeries[] }) {
  if (series.length === 0 || series[0].daily.length === 0) {
    return <p className="py-10 text-center text-xs text-fg-subtle">Select activities to compare.</p>
  }

  const dates = series[0].daily.map((d) => d.date)
  const chartData = dates.map((dateStr, idx) => {
    const row: Record<string, string | number> = {
      date: dateStr,
      label: formatShortDate(dateStr),
    }
    series.forEach((s) => {
      row[s.activity.id] = secondsToHours(s.daily[idx]?.total_seconds ?? 0)
    })
    return row
  })

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={22}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
            axisLine={false}
            tickLine={false}
            unit="h"
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val: unknown, name: unknown) => {
              const s = series.find((x) => x.activity.id === name)
              const secs = Math.round(Number(val) * 3600)
              return [formatDurationHuman(secs), s?.activity.name ?? String(name)]
            }}
          />
          <Legend
            formatter={(value: string) => {
              const s = series.find((x) => x.activity.id === value)
              return <span className="text-xs text-fg-muted">{s?.activity.name ?? value}</span>
            }}
          />
          {series.map((s) => (
            <Line
              key={s.activity.id}
              type="monotone"
              dataKey={s.activity.id}
              name={s.activity.id}
              stroke={s.activity.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
