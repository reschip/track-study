import { useEffect, useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { analyticsApi } from '@/api/analytics'
import { ContributionHeatmap } from '@/components/charts/ContributionHeatmap'
import { DayDetailPanel } from '@/components/charts/DayDetailDrawer'
import { PageHeader } from '@/components/layout/AppShell'
import { ManualEntryModal } from '@/components/tracker/ManualEntryModal'
import { Badge, Skeleton } from '@/components/ui/Misc'
import { computeStreakStats } from '@/services/streak'
import { formatDurationHuman, formatHoursDecimal, todayDateStringInZone } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { ContributionsData } from '@/types'

function pctDelta(current: number, prev: number | undefined): string | null {
  if (prev === undefined || prev === 0) return null
  const diff = Math.round(((current - prev) / prev) * 100)
  return `${diff >= 0 ? '+' : ''}${diff}% vs ${new Date().getFullYear() - 1}`
}

export function CalendarPage() {
  const { user, activities, projects, dataVersion } = useApp()
  const tz = user?.timezone ?? 'UTC'

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [activityId, setActivityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState<ContributionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(() => todayDateStringInZone(tz))
  const [manualForDay, setManualForDay] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    analyticsApi
      .contributions({
        year,
        activity_id: activityId || undefined,
        project_id: projectId || undefined,
      })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year, activityId, projectId, dataVersion])

  const summary = data?.summary
  const prev = data?.previous_year_summary
  const streakStats = useMemo(() => computeStreakStats(data?.days, selectedDay ?? undefined), [data?.days, selectedDay])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        subtitle="Annual consistency matrix based on recorded hours in your configured timezone."
      />

      <ContributionHeatmap
        data={data}
        year={year}
        onYearChange={setYear}
        activityId={activityId}
        onActivityChange={setActivityId}
        projectId={projectId}
        onProjectChange={setProjectId}
        activities={activities}
        projects={projects}
        weekStartDay={user?.week_start_day ?? 'monday'}
        selectedDate={selectedDay}
        onSelectDate={(d) => setSelectedDay(d)}
      />

      {/* Period Summary Strip below calendar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] font-medium uppercase text-fg-subtle">Total hours</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? <Skeleton className="h-6 w-16" /> : formatHoursDecimal(summary?.total_seconds ?? 0)}
          </div>
          {summary && prev && (
            <div className="mt-0.5 text-[11px] text-fg-subtle">
              {pctDelta(summary.total_seconds, prev.total_seconds) ?? '—'} vs {year - 1}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] font-medium uppercase text-fg-subtle">Active days</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? <Skeleton className="h-6 w-12" /> : summary?.active_days ?? 0}
          </div>
          {streakStats.currentStreak > 0 ? (
            <div className="mt-0.5 flex items-center gap-1 font-medium text-[11px] text-accent">
              <Flame className="h-3 w-3 fill-current text-accent" />
              <span>{streakStats.currentStreak}d streak (best: {streakStats.longestStreak}d)</span>
            </div>
          ) : summary && prev ? (
            <div className="mt-0.5 text-[11px] text-fg-subtle">
              {prev.active_days} days in {year - 1}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] font-medium uppercase text-fg-subtle">Total sessions</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? <Skeleton className="h-6 w-12" /> : summary?.total_sessions ?? 0}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-[11px] font-medium uppercase text-fg-subtle">Avg / active day</div>
          <div className="mt-1 font-mono text-xl font-semibold text-fg tabular-nums">
            {loading && !summary ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              formatDurationHuman(summary?.avg_seconds_per_active_day ?? 0)
            )}
          </div>
        </div>

        <div className="col-span-2 rounded-lg border border-border bg-surface px-4 py-3 sm:col-span-1">
          <div className="text-[11px] font-medium uppercase text-fg-subtle">Top activity</div>
          <div className="mt-1.5">
            {summary?.most_tracked_activity ? (
              <div className="space-y-0.5">
                <Badge>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: summary.most_tracked_activity.color }}
                  />
                  {summary.most_tracked_activity.name}
                </Badge>
                <div className="font-mono text-[11px] text-fg-muted tabular-nums">
                  {formatDurationHuman(summary.most_tracked_seconds)}
                </div>
              </div>
            ) : (
              <span className="text-xs text-fg-subtle">—</span>
            )}
          </div>
        </div>
      </div>

      <DayDetailPanel
        dateStr={selectedDay}
        activityId={activityId}
        projectId={projectId}
        onClose={() => setSelectedDay(null)}
        onAddManualForDay={(d) => setManualForDay(d)}
      />

      <ManualEntryModal
        open={Boolean(manualForDay)}
        onClose={() => setManualForDay(null)}
        defaultDate={manualForDay ?? undefined}
        defaultActivityId={activityId || undefined}
        defaultProjectId={projectId || undefined}
      />
    </div>
  )
}
