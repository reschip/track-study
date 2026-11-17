import { useEffect, useState } from 'react'
import { analyticsApi } from '@/api/analytics'
import { ActivityDistributionList } from '@/components/charts/ActivityDistributionList'
import {
  ActivityComparisonChart,
  ActivityDistributionChart,
  DailyLineChart,
  HourlyPatternChart,
  WeeklyOverviewChart,
} from '@/components/charts/AnalyticsCharts'
import { PageHeader } from '@/components/layout/AppShell'
import { Input, Select } from '@/components/ui/Input'
import { Badge, Skeleton } from '@/components/ui/Misc'
import { formatDurationHuman, formatHoursDecimal, todayDateStringInZone } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { AnalyticsCompare, AnalyticsPeriod, AnalyticsSummary } from '@/types'

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

export function AnalyticsPage() {
  const { user, activities, projects, dataVersion } = useApp()
  const tz = user?.timezone ?? 'UTC'

  const [period, setPeriod] = useState<AnalyticsPeriod>('last_30_days')
  const [customStart, setCustomStart] = useState(() => todayDateStringInZone(tz))
  const [customEnd, setCustomEnd] = useState(() => todayDateStringInZone(tz))
  const [activityId, setActivityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [distChartMode, setDistChartMode] = useState<'bar' | 'donut'>('bar')

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Multi-activity comparison selection
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [comparison, setComparison] = useState<AnalyticsCompare | null>(null)

  useEffect(() => {
    if (compareIds.length === 0 && activities.length >= 2) {
      setCompareIds(activities.slice(0, 3).map((a) => a.id))
    }
  }, [activities, compareIds.length])

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd || customEnd < customStart)) return
    let cancelled = false
    setLoading(true)
    analyticsApi
      .summary({
        period,
        start_date: period === 'custom' ? customStart : undefined,
        end_date: period === 'custom' ? customEnd : undefined,
        activity_id: activityId || undefined,
        project_id: projectId || undefined,
      })
      .then((res) => {
        if (!cancelled) setSummary(res)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, customStart, customEnd, activityId, projectId, dataVersion])

  useEffect(() => {
    if (compareIds.length === 0) {
      setComparison(null)
      return
    }
    if (period === 'custom' && (!customStart || !customEnd || customEnd < customStart)) return
    let cancelled = false
    analyticsApi
      .compare({
        activity_ids: compareIds,
        period,
        start_date: period === 'custom' ? customStart : undefined,
        end_date: period === 'custom' ? customEnd : undefined,
      })
      .then((res) => {
        if (!cancelled) setComparison(res)
      })
      .catch(() => {
        if (!cancelled) setComparison(null)
      })
    return () => {
      cancelled = true
    }
  }, [compareIds, period, customStart, customEnd, dataVersion])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 5),
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle={
          summary
            ? `Descriptive statistics from ${summary.start_date} to ${summary.end_date}`
            : 'Statistics derived directly from recorded sessions.'
        }
      />

      {/* Period & Filter controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === opt.value
                  ? 'bg-accent text-accent-fg'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="h-7 w-36 text-xs"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="text-xs text-fg-subtle">→</span>
            <Input
              type="date"
              className="h-7 w-36 text-xs"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by activity"
            className="h-7 w-40 text-xs"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
          >
            <option value="">All activities</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by project"
            className="h-7 w-40 text-xs"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase text-fg-subtle">Total time</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? <Skeleton className="h-6 w-16" /> : formatDurationHuman(summary?.total_seconds ?? 0)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase text-fg-subtle">Total hours</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? <Skeleton className="h-6 w-14" /> : formatHoursDecimal(summary?.total_seconds ?? 0)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase text-fg-subtle">Sessions</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? <Skeleton className="h-6 w-10" /> : summary?.total_sessions ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase text-fg-subtle">Avg session</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? (
              <Skeleton className="h-6 w-14" />
            ) : (
              formatDurationHuman(summary?.average_session_seconds ?? 0)
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase text-fg-subtle">Avg / active day</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? (
              <Skeleton className="h-6 w-14" />
            ) : (
              formatDurationHuman(summary?.average_daily_seconds ?? 0)
            )}
          </div>
        </div>
      </div>

      {/* A & B: Time distribution + Daily activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-fg">Time distribution</h2>
            <div className="flex rounded border border-border bg-bg p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDistChartMode('bar')}
                className={`rounded px-2 py-0.5 ${
                  distChartMode === 'bar' ? 'bg-surface font-medium text-fg' : 'text-fg-muted'
                }`}
              >
                Bars
              </button>
              <button
                type="button"
                onClick={() => setDistChartMode('donut')}
                className={`rounded px-2 py-0.5 ${
                  distChartMode === 'donut' ? 'bg-surface font-medium text-fg' : 'text-fg-muted'
                }`}
              >
                Donut
              </button>
            </div>
          </div>
          {loading && !summary ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ActivityDistributionChart
              items={summary?.activity_distribution ?? []}
              mode={distChartMode}
            />
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 space-y-3 lg:col-span-6">
          <h2 className="text-[13px] font-semibold text-fg">Daily activity</h2>
          {loading && !summary ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <DailyLineChart data={summary?.daily_activity ?? []} height={220} />
          )}
        </div>
      </div>

      {/* C & D: Weekly overview + Project distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3 lg:col-span-6">
          <h2 className="text-[13px] font-semibold text-fg">Weekly overview</h2>
          {loading && !summary ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <WeeklyOverviewChart data={summary?.weekly_overview ?? []} />
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 space-y-3 lg:col-span-6">
          <h2 className="text-[13px] font-semibold text-fg">Project distribution</h2>
          {loading && !summary ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ActivityDistributionList
              items={summary?.project_distribution ?? []}
              emptyText="No project data in this period."
            />
          )}
        </div>
      </div>

      {/* E: Activity comparison */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-fg">Activity comparison</h2>
            <p className="text-xs text-fg-muted">Select up to 5 activities to compare daily hours.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activities
              .filter((a) => !a.is_archived)
              .map((act) => {
                const active = compareIds.includes(act.id)
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => toggleCompare(act.id)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                      active
                        ? 'border-border-strong bg-surface-muted font-medium text-fg'
                        : 'border-border bg-bg text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: act.color }}
                    />
                    {act.name}
                  </button>
                )
              })}
          </div>
        </div>
        <ActivityComparisonChart series={comparison?.series ?? []} />
      </div>

      {/* F: Descriptive Patterns (non-judgmental) */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-fg">Time of day distribution</h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                <span>Peak hours:</span>
                {summary.patterns.peak_hours.length > 0 ? (
                  summary.patterns.peak_hours.map((h) => (
                    <Badge key={h} className="font-mono">
                      {String(h).padStart(2, '0')}:00
                    </Badge>
                  ))
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
            <HourlyPatternChart data={summary.patterns.hourly_distribution} />
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 space-y-3 lg:col-span-5">
            <h2 className="text-[13px] font-semibold text-fg">Observed patterns</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border bg-bg px-3 py-2">
                <div className="text-[10px] uppercase text-fg-subtle">Highest-volume days</div>
                <div className="mt-0.5 font-medium text-fg">
                  {summary.patterns.highest_volume_weekdays.length > 0
                    ? summary.patterns.highest_volume_weekdays.join(', ')
                    : '—'}
                </div>
              </div>
              <div className="rounded-md border border-border bg-bg px-3 py-2">
                <div className="text-[10px] uppercase text-fg-subtle">Avg session length</div>
                <div className="mt-0.5 font-mono font-medium text-fg tabular-nums">
                  {formatDurationHuman(summary.patterns.average_session_seconds)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-fg-subtle">Most frequent activities</div>
              {summary.patterns.most_frequent_activities.length === 0 ? (
                <p className="text-xs text-fg-subtle">No sessions in this range.</p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {summary.patterns.most_frequent_activities.map((item) => (
                    <div
                      key={item.activity.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: item.activity.color }}
                        />
                        <span className="font-medium text-fg">{item.activity.name}</span>
                      </div>
                      <span className="font-mono text-fg-muted tabular-nums">
                        {item.session_count} sess · {formatDurationHuman(item.total_seconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
