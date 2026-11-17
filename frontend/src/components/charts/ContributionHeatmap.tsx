import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { cn } from '@/components/ui/cn'
import { computeStreakStats } from '@/services/streak'
import {
  formatDurationHuman,
  formatReadableDate,
  formatThresholdLabel,
} from '@/services/timeFormat'
import type { Activity, ContributionDay, ContributionsData, Project, WeekStartDay } from '@/types'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getDayOfWeekIndex(dateStr: string, weekStart: WeekStartDay): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun..6=Sat
  if (weekStart === 'sunday') return jsDay
  return (jsDay + 6) % 7 // 0=Mon..6=Sun
}

function intensityBg(level: 0 | 1 | 2 | 3 | 4): string {
  return `var(--contrib-${level})`
}

export function ContributionHeatmap({
  data,
  year,
  onYearChange,
  activityId,
  onActivityChange,
  projectId,
  onProjectChange,
  activities,
  projects,
  weekStartDay = 'monday',
  selectedDate,
  onSelectDate,
  embedded = false,
}: {
  data: ContributionsData | null
  year: number
  onYearChange: (year: number) => void
  activityId: string
  onActivityChange: (id: string) => void
  projectId: string
  onProjectChange: (id: string) => void
  activities: Activity[]
  projects: Project[]
  weekStartDay?: WeekStartDay
  selectedDate?: string | null
  onSelectDate: (dateStr: string) => void
  compact?: boolean
  embedded?: boolean
}) {
  const [hovered, setHovered] = useState<ContributionDay | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const hasActiveFilter = Boolean(activityId || projectId)
  const scrollRef = useRef<HTMLDivElement>(null)

  const grid = useMemo(() => {
    if (!data?.days.length) {
      return {
        weeks: [] as (ContributionDay | null)[][],
        monthByCol: new Map<number, string>(),
      }
    }

    const firstRow = getDayOfWeekIndex(data.days[0].date, weekStartDay)
    const cells: (ContributionDay | null)[] = Array(firstRow).fill(null)
    for (const day of data.days) {
      cells.push(day)
    }
    while (cells.length % 7 !== 0) {
      cells.push(null)
    }

    const weeks: (ContributionDay | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7))
    }

    const monthByCol = new Map<number, string>()
    let lastMonth = -1
    weeks.forEach((week, colIdx) => {
      const firstReal = week.find((c) => c !== null)
      if (!firstReal) return
      const m = Number(firstReal.date.slice(5, 7)) - 1
      if (m !== lastMonth) {
        monthByCol.set(colIdx, MONTH_NAMES[m])
        lastMonth = m
      }
    })

    return { weeks, monthByCol }
  }, [data, weekStartDay])

  const rowLabels =
    weekStartDay === 'sunday'
      ? ['', 'Mon', '', 'Wed', '', 'Fri', '']
      : ['Mon', '', 'Wed', '', 'Fri', '', '']

  const thresholds = data?.thresholds ?? [1800, 5400, 10800]
  const legendTooltips = [
    '0m',
    `< ${formatThresholdLabel(thresholds[0])}`,
    `${formatThresholdLabel(thresholds[0])} – ${formatThresholdLabel(thresholds[1])}`,
    `${formatThresholdLabel(thresholds[1])} – ${formatThresholdLabel(thresholds[2])}`,
    `${formatThresholdLabel(thresholds[2])}+`,
  ]

  const currentYear = new Date().getFullYear()
  const colCount = Math.max(1, grid.weeks.length)

  const streakStats = useMemo(() => {
    return computeStreakStats(data?.days, selectedDate ?? undefined)
  }, [data?.days, selectedDate])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollWidth > el.clientWidth) {
      el.scrollLeft = el.scrollWidth
    }
  }, [colCount, year])

  return (
    <div
      className={cn(
        'space-y-3.5',
        !embedded && 'rounded-lg border border-border bg-surface p-4 sm:p-5',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">
            Consistency
          </h2>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-fg-muted">
            {streakStats.currentStreak > 0 && (
              <span
                className="inline-flex items-center rounded-full bg-accent-subtle px-2.5 py-0.5 text-[11px] font-medium text-accent"
                title={
                  streakStats.longestStreak > streakStats.currentStreak
                    ? `Best streak: ${streakStats.longestStreak} days`
                    : undefined
                }
              >
                {streakStats.currentStreak} day streak
              </span>
            )}
            {streakStats.currentStreak > 0 && data && (
              <span className="text-border-strong" aria-hidden="true">
                |
              </span>
            )}
            {data && (
              <span className="whitespace-nowrap tabular-nums">
                {formatDurationHuman(data.summary.total_seconds)} in {year}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label="Filter consistency graph"
            title="Filter by activity or project"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
              filtersOpen || hasActiveFilter
                ? 'border-border-strong bg-surface text-fg'
                : 'border-border bg-surface/70 text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span className="hidden sm:inline">Filter</span>
            {hasActiveFilter && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>

          <div className="flex shrink-0 items-center rounded-full border border-border bg-surface px-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => onYearChange(year - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-mono text-xs font-medium text-fg tabular-nums">
              {year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => onYearChange(year + 1)}
              disabled={year >= currentYear}
              aria-label="Next year"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg/60 px-2.5 py-2">
          <Select
            aria-label="Filter contribution graph by activity"
            className="h-7 min-w-[140px] flex-1 text-xs sm:w-44 sm:flex-none"
            value={activityId}
            onChange={(e) => onActivityChange(e.target.value)}
          >
            <option value="">All activities</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.is_archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter contribution graph by project"
            className="h-7 min-w-[140px] flex-1 text-xs sm:w-44 sm:flex-none"
            value={projectId}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          {hasActiveFilter && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-fg-muted"
              onClick={() => {
                onActivityChange('')
                onProjectChange('')
              }}
            >
              <X className="h-3 w-3" />
              <span>Clear</span>
            </Button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-x-auto pb-2 sm:overflow-visible sm:pb-0"
      >
        <div className="min-w-[540px] space-y-1.5 px-0.5 sm:min-w-0">
          {/* Aligned month labels */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-6 shrink-0 sm:w-7" />
            <div
              className="grid min-w-0 flex-1 gap-[2px] text-[10px] text-fg-subtle sm:text-[11px] lg:gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
            >
              {grid.weeks.map((_, colIdx) => (
                <div key={colIdx} className="relative h-4 overflow-visible">
                  {grid.monthByCol.has(colIdx) && (
                    <span className="absolute top-0 left-0 whitespace-nowrap">
                      {grid.monthByCol.get(colIdx)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Weekday labels + responsive full-width heatmap grid */}
          <div className="flex items-stretch gap-1.5 sm:gap-2">
            <div className="grid w-6 shrink-0 grid-rows-7 gap-[2px] text-[9px] leading-none text-fg-subtle sm:w-7 sm:text-[10px] lg:gap-[3px]">
              {rowLabels.map((lbl, idx) => (
                <div key={idx} className="relative min-h-0 overflow-visible">
                  {lbl && (
                    <span className="absolute inset-y-0 right-0.5 flex items-center whitespace-nowrap">
                      {lbl}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div
              className="grid min-w-0 flex-1 gap-[2px] lg:gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
            >
              {grid.weeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-rows-7 gap-[2px] lg:gap-[3px]">
                  {week.map((day, dIdx) => {
                    if (!day) {
                      return <div key={`empty-${wIdx}-${dIdx}`} className="aspect-square w-full" />
                    }
                    const isSelected = selectedDate === day.date
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => onSelectDate(day.date)}
                        onMouseEnter={() => setHovered(day)}
                        onMouseLeave={() => setHovered((cur) => (cur?.date === day.date ? null : cur))}
                        aria-label={`${formatReadableDate(day.date)}: ${formatDurationHuman(day.total_seconds)}`}
                        className={`aspect-square w-full rounded-[2px] border focus:outline-none focus:ring-1 focus:ring-accent ${
                          isSelected
                            ? 'border-fg ring-1 ring-fg'
                            : 'border-black/5 dark:border-white/5 hover:border-fg-muted'
                        }`}
                        style={{ backgroundColor: intensityBg(day.intensity) }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed-height single-line footer status + legend */}
      <div
        className={cn(
          'flex flex-col gap-2 text-[11px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between',
          !embedded && 'border-t border-border/60 pt-3',
        )}
      >
        <div className="flex h-5 min-w-0 flex-1 items-center">
          {hovered ? (
            <span className="truncate tabular-nums text-fg">
              <strong>{formatReadableDate(hovered.date)}</strong> —{' '}
              {hovered.total_seconds > 0
                ? `${formatDurationHuman(hovered.total_seconds)} (${hovered.session_count} session${hovered.session_count === 1 ? '' : 's'})`
                : 'No tracked activity'}
            </span>
          ) : (
            <span className="truncate">
              {!embedded && 'Click any cell to inspect.'}
              {streakStats.totalActiveDays > 0 && (
                <span className={!embedded ? 'ml-2 text-fg-subtle' : 'text-fg-subtle'}>
                  {!embedded ? '· ' : ''}
                  {streakStats.totalActiveDays} active days in {year}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              title={legendTooltips[lvl]}
              className="inline-block h-2.5 w-2.5 rounded-[2px] border border-black/5 dark:border-white/5"
              style={{ backgroundColor: intensityBg(lvl) }}
            />
          ))}
          <span>More</span>
          <span className="ml-1 hidden text-fg-subtle lg:inline">
            ({legendTooltips[1]} / {legendTooltips[2]} / {legendTooltips[3]} / {legendTooltips[4]})
          </span>
        </div>
      </div>
    </div>
  )
}
