import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Flame,
  Pause,
  PictureInPicture2,
  Play,
  Square,
} from 'lucide-react'
import { windowsApi } from '@/api/windows'
import { useCompactFocusSummary } from '@/components/widgets/useCompactFocusSummary'
import { cn } from '@/components/ui/cn'
import { formatDurationHuman } from '@/services/timeFormat'
import { formatTimerClock } from '@/services/timer'
import { useApp } from '@/state/AppContext'

export function MenuBarPopover() {
  const {
    user,
    projects,
    activeSession,
    elapsedSeconds,
    timerBusy,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    pendingSwitch,
    confirmSwitch,
    cancelSwitch,
    widgetState,
    toggleWidget,
  } = useApp()

  const {
    overview,
    currentStreak,
    todayLiveSeconds,
    todaySessionsCount,
    quickActivities,
  } = useCompactFocusSummary()

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => user?.tracking_preferences.default_project_id ?? '',
  )

  useEffect(() => {
    if (user?.tracking_preferences.default_project_id && !selectedProjectId) {
      setSelectedProjectId(user.tracking_preferences.default_project_id)
    }
  }, [user?.tracking_preferences.default_project_id, selectedProjectId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void windowsApi.hidePopover()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const isRunning = activeSession?.status === 'active'
  const topToday = overview?.activity_distribution.slice(0, 3) ?? []
  const availableProjects = projects.filter((p) => p.status !== 'archived')

  return (
    <div className="h-screen w-screen p-2 select-none">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface text-fg shadow-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight text-fg">Activity</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted tabular-nums">
              <Flame className="h-3 w-3 text-accent" />
              {currentStreak}d
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void toggleWidget()}
              title={widgetState.visible ? 'Hide desktop widget' : 'Show desktop widget'}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors',
                widgetState.visible
                  ? 'bg-accent-subtle text-accent'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
              <span>Widget</span>
            </button>
            <button
              type="button"
              onClick={() => void windowsApi.openMain()}
              title="Open full workspace"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Active / Idle Timer Card */}
        <div className="p-3.5">
          {pendingSwitch ? (
            <div className="rounded-xl border border-border-strong bg-surface-muted p-3">
              <p className="text-xs font-medium text-fg">
                Switch timer to <span className="font-semibold">{pendingSwitch.nextActivityName}</span>?
              </p>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                Your current session will be saved first.
              </p>
              <div className="mt-2.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={cancelSwitch}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:bg-surface hover:text-fg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={timerBusy}
                  onClick={() => void confirmSwitch()}
                  className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  Switch
                </button>
              </div>
            </div>
          ) : activeSession ? (
            <div className="rounded-xl border border-border bg-bg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        isRunning && 'animate-pulse',
                      )}
                      style={{ backgroundColor: activeSession.activity.color }}
                    />
                    <span className="truncate text-xs font-semibold text-fg">
                      {activeSession.activity.name}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate pl-3.5 text-[11px] text-fg-muted">
                    {activeSession.project?.name ?? (isRunning ? 'Running now' : 'Paused')}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                  {isRunning ? 'Live' : 'Paused'}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="font-mono text-2xl font-semibold tracking-tight text-fg tabular-nums">
                  {formatTimerClock(elapsedSeconds)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={timerBusy}
                    onClick={() => void (isRunning ? pauseTimer() : resumeTimer())}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-muted px-2.5 text-xs font-medium text-fg transition-colors hover:bg-border disabled:opacity-50"
                  >
                    {isRunning ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span>Resume</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={timerBusy}
                    onClick={() => void stopTimer()}
                    title="Stop & save session"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-danger-subtle text-danger transition-colors hover:opacity-85 disabled:opacity-50"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border-strong bg-bg px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-fg">Ready to focus</span>
                <span className="text-[11px] text-fg-subtle">Pick an activity below</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Start Grid */}
        <div className="px-3.5 pb-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Quick start
            </span>
            {availableProjects.length > 0 && (
              <select
                aria-label="Quick start project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="max-w-[150px] truncate rounded-md border border-border bg-bg px-1.5 py-0.5 text-[11px] text-fg-muted outline-none focus:border-accent"
              >
                <option value="">No project</option>
                {availableProjects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {quickActivities.slice(0, 6).map((act) => {
              const isCurrent = activeSession?.activity_id === act.id
              return (
                <button
                  key={act.id}
                  type="button"
                  disabled={timerBusy || isCurrent}
                  onClick={() =>
                    void startTimer({
                      activity_id: act.id,
                      project_id: selectedProjectId || null,
                    })
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                    isCurrent
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border bg-bg text-fg hover:border-border-strong hover:bg-surface-muted',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: act.color }}
                  />
                  <span className="truncate font-medium">{act.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Today Summary Footer */}
        <div className="mt-auto border-t border-border bg-bg px-3.5 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-fg-muted">Today</span>
            <span className="text-xs font-semibold text-fg tabular-nums">
              {formatDurationHuman(todayLiveSeconds)}
              <span className="ml-1.5 font-normal text-fg-subtle">
                · {todaySessionsCount} {todaySessionsCount === 1 ? 'session' : 'sessions'}
              </span>
            </span>
          </div>

          {topToday.length > 0 && (
            <div className="mt-2 space-y-1">
              {topToday.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate text-fg-muted">{item.name}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-fg-subtle tabular-nums">
                    {formatDurationHuman(item.total_seconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
