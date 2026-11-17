import { Pause, Play, Square } from 'lucide-react'
import { formatDurationHuman } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'

function formatRingStopwatch(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rem = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(rem).padStart(2, '0')}s`
}

export function FocusRing({
  todaySeconds,
  sessionsCount,
  selectedActivityId,
  selectedProjectId,
}: {
  todaySeconds: number
  sessionsCount: number
  selectedActivityId: string
  selectedProjectId: string
}) {
  const { activeSession, elapsedSeconds, timerBusy, startTimer, pauseTimer, resumeTimer, stopTimer } =
    useApp()

  const size = 188
  const strokeWidth = 9
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  let progress = 0
  if (activeSession) {
    if (elapsedSeconds < 60) {
      progress = Math.max(0.06, elapsedSeconds / 60)
    } else {
      progress = Math.max(0.08, (elapsedSeconds % 1500) / 1500 || 1)
    }
  } else if (todaySeconds > 0) {
    progress = Math.min(1, Math.max(0.08, todaySeconds / (4 * 3600)))
  }

  const dashOffset = circumference * (1 - progress)

  const displayTime = activeSession
    ? formatRingStopwatch(elapsedSeconds)
    : formatDurationHuman(todaySeconds)

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex h-[188px] w-[188px] items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth={strokeWidth}
          />
          {progress > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          <span className="text-[28px] font-semibold leading-none tracking-tight text-fg tabular-nums">
            {displayTime}
          </span>
          <span className="mt-1.5 text-[11px] text-fg-muted tabular-nums">
            {sessionsCount} {sessionsCount === 1 ? 'session' : 'sessions'} · today
          </span>

          <div className="mt-3 flex items-center gap-2">
            {activeSession ? (
              <>
                {activeSession.status === 'active' ? (
                  <button
                    type="button"
                    disabled={timerBusy}
                    onClick={() => void pauseTimer()}
                    aria-label="Pause timer"
                    title="Pause timer (Space)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent hover:text-accent-fg disabled:opacity-50"
                  >
                    <Pause className="h-3.5 w-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={timerBusy}
                    onClick={() => void resumeTimer()}
                    aria-label="Resume timer"
                    title="Resume timer (Space)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent hover:text-accent-fg disabled:opacity-50"
                  >
                    <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={timerBusy}
                  onClick={() => void stopTimer()}
                  aria-label="Stop timer"
                  title="Stop and save session"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-fg-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!selectedActivityId || timerBusy}
                onClick={() =>
                  void startTimer({
                    activity_id: selectedActivityId,
                    project_id: selectedProjectId || null,
                  })
                }
                aria-label="Quick start selected activity"
                title="Start focus timer (Space)"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent hover:text-accent-fg disabled:opacity-40"
              >
                <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
