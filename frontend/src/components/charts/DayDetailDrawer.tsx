import { useEffect, useState } from 'react'
import { Calendar, Clock, Play, Plus, RotateCcw, X } from 'lucide-react'
import { analyticsApi } from '@/api/analytics'
import { ActivityDistributionList } from '@/components/charts/ActivityDistributionList'
import { Badge, Skeleton } from '@/components/ui/Misc'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { formatDurationHuman, formatReadableDate, formatTimeInZone } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { DayDetail } from '@/types'

export function DayDetailPanel({
  dateStr,
  activityId,
  projectId,
  onClose,
  onResetToToday,
  onAddManualForDay,
  embedded = false,
}: {
  dateStr: string | null
  activityId?: string
  projectId?: string
  onClose?: () => void
  onResetToToday?: () => void
  onAddManualForDay?: (dateStr: string) => void
  embedded?: boolean
}) {
  const { user, dataVersion, startTimer, timerBusy } = useApp()
  const tz = user?.timezone ?? 'UTC'
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!dateStr) {
      setFetching(false)
      return
    }
    let cancelled = false
    setFetching(true)
    analyticsApi
      .dayDetail(dateStr, {
        activity_id: activityId || undefined,
        project_id: projectId || undefined,
      })
      .then((res) => {
        if (!cancelled) setDetail(res)
      })
      .finally(() => {
        if (!cancelled) setFetching(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateStr, activityId, projectId, dataVersion])

  if (!dateStr) {
    return (
      <div
        className={cn(
          'flex h-[340px] flex-col items-center justify-center px-4 py-8 text-center md:h-[252px]',
          !embedded && 'rounded-lg border border-border bg-surface',
        )}
      >
        <Calendar className="mb-2 h-5 w-5 text-fg-subtle" />
        <p className="text-xs font-medium text-fg">No day selected</p>
        <p className="mt-0.5 text-xs text-fg-subtle">
          Click any cell in the contribution graph above to inspect its sessions.
        </p>
      </div>
    )
  }

  const displayDetail = detail
  const showInitialSkeleton = fetching && !displayDetail

  return (
    <div
      className={cn(
        'flex h-[340px] flex-col md:h-[252px]',
        !embedded && 'rounded-lg border border-border bg-surface p-4 sm:p-5',
      )}
    >
      {(!embedded || onResetToToday || fetching) && (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            {!embedded && (
              <h3 className="text-sm font-semibold text-fg">{formatReadableDate(dateStr)}</h3>
            )}
            {embedded && onResetToToday && (
              <span className="font-medium text-fg">{formatReadableDate(dateStr)}</span>
            )}
            {displayDetail && !embedded && (
              <span className="tabular-nums">
                · {formatDurationHuman(displayDetail.total_seconds)} across {displayDetail.session_count}{' '}
                session{displayDetail.session_count === 1 ? '' : 's'}
              </span>
            )}
            {fetching && <span className="text-[11px] text-fg-subtle">Updating…</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {onResetToToday && (
              <Button size="sm" variant="ghost" onClick={onResetToToday}>
                <RotateCcw className="h-3 w-3" />
                Today
              </Button>
            )}
            {!embedded && onAddManualForDay && (
              <Button size="sm" variant="outline" onClick={() => onAddManualForDay(dateStr)}>
                <Plus className="h-3.5 w-3.5" />
                Log time
              </Button>
            )}
            {onClose && (
              <Button size="icon" variant="ghost" onClick={onClose} aria-label="Clear day selection">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div
        className={`min-h-0 flex-1 transition-opacity duration-150 ${
          fetching && displayDetail ? 'opacity-65' : 'opacity-100'
        }`}
      >
        {showInitialSkeleton ? (
          <div className="space-y-2.5 pt-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !displayDetail || displayDetail.sessions.length === 0 ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-xs text-fg-subtle">
            <span>No activity logged on {formatReadableDate(dateStr)}.</span>
            {onAddManualForDay && (
              <Button size="sm" variant="outline" onClick={() => onAddManualForDay(dateStr)}>
                <Plus className="h-3.5 w-3.5" />
                Log time for this day
              </Button>
            )}
          </div>
        ) : (
          <div className="grid h-full grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-5 md:grid-cols-12 md:grid-rows-1 md:gap-10">
            <div className="flex min-h-0 flex-col md:col-span-5">
              <h4 className="mb-3 shrink-0 text-[13px] font-semibold text-fg">
                Activity breakdown
              </h4>
              <div className="max-h-24 min-h-0 flex-1 overflow-y-auto pr-1 md:max-h-none">
                <ActivityDistributionList items={displayDetail.activity_distribution} />
              </div>
            </div>
            <div className="flex min-h-0 flex-col md:col-span-7">
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                <h4 className="text-[13px] font-semibold text-fg">
                  Sessions on this day
                </h4>
                {embedded && onAddManualForDay && (
                  <button
                    type="button"
                    onClick={() => onAddManualForDay(dateStr)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle transition-colors hover:text-accent"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add</span>
                  </button>
                )}
              </div>
              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto',
                  !embedded && 'rounded-md border border-border',
                )}
              >
                <div className="divide-y divide-border/70">
                  {displayDetail.sessions.map((s) => (
                    <div
                      key={s.session_id}
                      className="group flex items-center justify-between gap-3 py-2.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.activity.color }}
                        />
                        <span className="max-w-[130px] shrink-0 truncate font-medium text-fg">
                          {s.activity.name}
                        </span>
                        {s.description && (
                          <span className="min-w-0 truncate text-fg-subtle">· {s.description}</span>
                        )}
                        {s.project && (
                          <Badge className="min-w-0 max-w-[110px] text-[10px]">
                            <span className="truncate">{s.project.name}</span>
                          </Badge>
                        )}
                        {s.crosses_midnight && (
                          <Badge tone="accent" className="text-[10px]">
                            Midnight split
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-right tabular-nums">
                        <span className="hidden items-center gap-1 text-fg-subtle sm:flex">
                          <Clock className="h-3 w-3" />
                          {formatTimeInZone(s.slice_started_at, tz)}–{formatTimeInZone(s.slice_ended_at, tz)}
                        </span>
                        <span className="font-semibold text-fg">
                          {formatDurationHuman(s.slice_seconds)}
                        </span>
                        <button
                          type="button"
                          disabled={timerBusy}
                          onClick={() =>
                            void startTimer({
                              activity_id: s.activity.id,
                              project_id: s.project?.id ?? null,
                              description: s.description ?? null,
                            })
                          }
                          title={`Start ${s.activity.name}`}
                          aria-label={`Restart ${s.activity.name}`}
                          className="rounded p-1 text-fg-subtle transition-colors hover:bg-surface-muted hover:text-accent disabled:opacity-50"
                        >
                          <Play className="h-3 w-3 fill-current" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
