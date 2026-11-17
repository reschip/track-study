import { useCallback, useEffect, useMemo, useState } from 'react'
import { analyticsApi } from '@/api/analytics'
import { ContributionHeatmap } from '@/components/charts/ContributionHeatmap'
import { DayDetailPanel } from '@/components/charts/DayDetailDrawer'
import { ActiveTimerWidget } from '@/components/tracker/ActiveTimerWidget'
import { FocusRing } from '@/components/tracker/FocusRing'
import { ManualEntryModal } from '@/components/tracker/ManualEntryModal'
import { Button } from '@/components/ui/Button'
import { todayDateStringInZone } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { ContributionsData, OverviewData } from '@/types'

export function OverviewPage() {
  const { user, activities, projects, dataVersion } = useApp()
  const tz = user?.timezone ?? 'UTC'
  const todayStr = useMemo(() => todayDateStringInZone(tz), [tz])

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [heatmap, setHeatmap] = useState<ContributionsData | null>(null)
  const [year, setYear] = useState<number>(() => Number(todayDateStringInZone(tz).slice(0, 4)))
  const [activityId, setActivityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [quickActivityId, setQuickActivityId] = useState('')
  const [quickProjectId, setQuickProjectId] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(() => todayDateStringInZone(tz))
  const [manualForDay, setManualForDay] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedDay((prev) => prev ?? todayStr)
  }, [todayStr])

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [ov, hm] = await Promise.all([
        analyticsApi.overview(),
        analyticsApi.contributions({
          year,
          activity_id: activityId || undefined,
          project_id: projectId || undefined,
        }),
      ])
      setOverview(ov)
      setHeatmap(hm)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load focus workspace')
    }
  }, [year, activityId, projectId, dataVersion])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const today = overview?.today
  const sessionsCount = today?.session_count ?? 0

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3.5 py-2.5 text-xs text-danger">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      )}

      {/* Top Hero: Editorial Prompt + Floating Spotlight Bar */}
      <ActiveTimerWidget
        selectedActivityId={quickActivityId}
        onSelectActivityId={setQuickActivityId}
        selectedProjectId={quickProjectId}
        onSelectProjectId={setQuickProjectId}
      />

      {/* Middle 2-Column Section: Circular Focus Ring + Consistency Heatmap */}
      <section
        aria-label="Focus progress and annual consistency"
        className="grid grid-cols-1 items-center gap-8 min-[920px]:grid-cols-[200px_minmax(0,1fr)]"
      >
        <FocusRing
          todaySeconds={today?.total_seconds ?? 0}
          sessionsCount={sessionsCount}
          selectedActivityId={quickActivityId}
          selectedProjectId={quickProjectId}
        />

        <div className="min-w-0 min-[920px]:border-l min-[920px]:border-border/70 min-[920px]:pl-8">
          <ContributionHeatmap
            data={heatmap}
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
            embedded
          />
        </div>
      </section>

      {/* Bottom Open 2-Column Log: Activity breakdown + Sessions on this day */}
      <section
        aria-label="Daily activity breakdown and sessions"
        className="border-t border-border/80 pt-6"
      >
        <DayDetailPanel
          dateStr={selectedDay}
          activityId={activityId}
          projectId={projectId}
          onResetToToday={
            selectedDay && selectedDay !== todayStr
              ? () => {
                  setYear(Number(todayStr.slice(0, 4)))
                  setSelectedDay(todayStr)
                }
              : undefined
          }
          onAddManualForDay={(d) => setManualForDay(d)}
          embedded
        />
      </section>

      <ManualEntryModal
        open={manualForDay !== null}
        onClose={() => setManualForDay(null)}
        defaultDate={manualForDay ?? undefined}
      />
    </div>
  )
}
