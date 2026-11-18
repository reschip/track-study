import { Flame, Maximize2, Pause, Pin, PinOff, Play, Square, X } from 'lucide-react'
import { windowsApi } from '@/api/windows'
import { useCompactFocusSummary } from '@/components/widgets/useCompactFocusSummary'
import { cn } from '@/components/ui/cn'
import { formatDurationHuman } from '@/services/timeFormat'
import { formatTimerClock } from '@/services/timer'
import { useApp } from '@/state/AppContext'

export function DesktopWidget() {
  const {
    user,
    activeSession,
    elapsedSeconds,
    timerBusy,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    widgetState,
    setWidgetAlwaysOnTop,
  } = useApp()

  const { currentStreak, todayLiveSeconds, quickActivities } = useCompactFocusSummary()

  const isRunning = activeSession?.status === 'active'
  const defaultProjectId = user?.tracking_preferences.default_project_id ?? null

  return (
    <div className="h-screen w-screen p-1.5 select-none">
      <div className="flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl border border-border-strong bg-surface px-3 py-2 text-fg shadow-md">
        {/* Compact Draggable Header */}
        <div
          data-tauri-drag-region
          className="flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing"
        >
          <div data-tauri-drag-region className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                activeSession ? (isRunning ? 'animate-pulse' : 'opacity-60') : 'bg-fg-subtle',
              )}
              style={activeSession ? { backgroundColor: activeSession.activity.color } : undefined}
            />
            {activeSession ? (
              <span
                data-tauri-drag-region
                className="truncate text-[11px] font-medium text-fg-muted"
              >
                {activeSession.activity.name}
                {activeSession.project ? ` · ${activeSession.project.name}` : ''}
              </span>
            ) : (
              <span
                data-tauri-drag-region
                className="truncate text-[11px] font-medium text-fg-muted tabular-nums"
              >
                Today {formatDurationHuman(todayLiveSeconds)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {!activeSession && (
              <span className="mr-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-fg-subtle tabular-nums">
                <Flame className="h-2.5 w-2.5 text-accent" />
                {currentStreak}d
              </span>
            )}
            <button
              type="button"
              onClick={() => void setWidgetAlwaysOnTop(!widgetState.always_on_top)}
              title={widgetState.always_on_top ? 'Unpin from top' : 'Keep always on top'}
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors',
                widgetState.always_on_top
                  ? 'text-accent hover:bg-accent-subtle'
                  : 'text-fg-subtle hover:bg-surface-muted hover:text-fg',
              )}
            >
              {widgetState.always_on_top ? (
                <Pin className="h-3 w-3" />
              ) : (
                <PinOff className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void windowsApi.openMain()}
              title="Open Activity"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => void windowsApi.setWidgetVisible(false)}
              title="Hide widget"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        {activeSession ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              <div className="font-mono text-[26px] font-semibold leading-none tracking-tight text-fg tabular-nums">
                {formatTimerClock(elapsedSeconds)}
              </div>
              <div className="mt-1 text-[10px] font-medium text-fg-subtle">
                {isRunning ? 'Running' : 'Paused'} · Today {formatDurationHuman(todayLiveSeconds)}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={timerBusy}
                onClick={() => void (isRunning ? pauseTimer() : resumeTimer())}
                title={isRunning ? 'Pause timer' : 'Resume timer'}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50',
                  isRunning
                    ? 'bg-surface-muted text-fg hover:bg-border'
                    : 'bg-accent text-accent-fg hover:bg-accent-hover',
                )}
              >
                {isRunning ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
                )}
              </button>
              <button
                type="button"
                disabled={timerBusy}
                onClick={() => void stopTimer()}
                title="Stop & save"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger-subtle text-danger transition-colors hover:opacity-85 disabled:opacity-50"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {quickActivities.slice(0, 3).map((act) => (
              <button
                key={act.id}
                type="button"
                disabled={timerBusy}
                onClick={() =>
                  void startTimer({
                    activity_id: act.id,
                    project_id: defaultProjectId,
                  })
                }
                title={`Start ${act.name}`}
                className="group flex min-w-0 items-center gap-1.5 rounded-xl border border-border bg-bg px-2 py-2 text-left text-[11px] font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-muted disabled:opacity-50"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: act.color }}
                />
                <span className="truncate">{act.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
