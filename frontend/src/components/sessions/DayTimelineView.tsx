import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { analyticsApi } from '@/api/analytics'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Misc'
import {
  formatDurationHuman,
  formatReadableDate,
  formatTimeInZone,
  localDateTimeToUtcIso,
} from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { DayDetail } from '@/types'

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

export function DayTimelineView({
  dateStr,
  onDateChange,
  activityId,
  projectId,
}: {
  dateStr: string
  onDateChange: (d: string) => void
  activityId?: string
  projectId?: string
}) {
  const { user, dataVersion } = useApp()
  const tz = user?.timezone ?? 'UTC'
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    analyticsApi
      .dayDetail(dateStr, {
        activity_id: activityId || undefined,
        project_id: projectId || undefined,
      })
      .then((res) => {
        if (!cancelled) setDetail(res)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateStr, activityId, projectId, dataVersion])

  const dayStartMs = Date.parse(localDateTimeToUtcIso(dateStr, '00:00', tz))
  const dayEndMs = Date.parse(localDateTimeToUtcIso(shiftDate(dateStr, 1), '00:00', tz))
  const daySpanMs = Math.max(1, dayEndMs - dayStartMs)
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">24-hour timeline · {formatReadableDate(dateStr)}</h3>
          <p className="text-xs text-fg-muted tabular-nums">
            {detail ? `${formatDurationHuman(detail.total_seconds)} across ${detail.session_count} session(s)` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={() => onDateChange(shiftDate(dateStr, -1))} aria-label="Previous day">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={dateStr}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={() => onDateChange(shiftDate(dateStr, 1))} aria-label="Next day">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-44 w-full" />
      ) : (
        <div className="space-y-3">
          {/* 24h horizontal ruler & blocks */}
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[680px] space-y-2">
              <div className="grid grid-cols-12 border-b border-border pb-1 font-mono text-[10px] text-fg-subtle">
                {hours.filter((h) => h % 2 === 0).map((h) => (
                  <div key={h}>{String(h).padStart(2, '0')}:00</div>
                ))}
              </div>

              <div className="relative h-14 w-full rounded-md border border-border bg-bg">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/50"
                    style={{ left: `${(h / 24) * 100}%` }}
                  />
                ))}
                {detail?.sessions.map((s) => {
                  const sMs = Math.max(dayStartMs, Date.parse(s.slice_started_at))
                  const eMs = Math.min(dayEndMs, Date.parse(s.slice_ended_at))
                  const leftPct = ((sMs - dayStartMs) / daySpanMs) * 100
                  const widthPct = Math.max(0.6, ((eMs - sMs) / daySpanMs) * 100)
                  return (
                    <div
                      key={s.session_id}
                      title={`${s.activity.name} (${formatTimeInZone(s.slice_started_at, tz)}–${formatTimeInZone(s.slice_ended_at, tz)} · ${formatDurationHuman(s.slice_seconds)})`}
                      className="absolute top-2 bottom-2 flex items-center overflow-hidden rounded px-1.5 text-[11px] font-medium text-white"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: s.activity.color,
                      }}
                    >
                      <span className="truncate">{s.activity.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {(!detail || detail.sessions.length === 0) && (
            <p className="py-4 text-center text-xs text-fg-subtle">
              No sessions recorded on {formatReadableDate(dateStr)}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
