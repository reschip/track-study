import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Misc'
import { cn } from '@/components/ui/cn'
import { formatTimeInZone } from '@/services/timeFormat'
import { formatTimerClock } from '@/services/timer'
import { useApp } from '@/state/AppContext'

export function ActiveTimerWidget({
  compact = false,
  selectedActivityId,
  onSelectActivityId,
  selectedProjectId,
  onSelectProjectId,
}: {
  compact?: boolean
  selectedActivityId?: string
  onSelectActivityId?: (id: string) => void
  selectedProjectId?: string
  onSelectProjectId?: (id: string) => void
}) {
  const {
    user,
    activities,
    projects,
    activeSession,
    elapsedSeconds,
    timerBusy,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    setActiveNav,
  } = useApp()

  const tz = user?.timezone ?? 'UTC'

  const activeActivities = useMemo(
    () => activities.filter((a) => !a.is_archived),
    [activities],
  )
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'active'),
    [projects],
  )

  const [internalActivityId, setInternalActivityId] = useState('')
  const [internalProjectId, setInternalProjectId] = useState('')
  const [note, setNote] = useState('')

  const activityId = selectedActivityId !== undefined ? selectedActivityId : internalActivityId
  const setActivityId = onSelectActivityId ?? setInternalActivityId
  const projectId = selectedProjectId !== undefined ? selectedProjectId : internalProjectId
  const setProjectId = onSelectProjectId ?? setInternalProjectId

  useEffect(() => {
    if (activeActivities.length === 0) {
      if (activityId) setActivityId('')
      return
    }
    if (!activityId || !activeActivities.some((a) => a.id === activityId)) {
      setActivityId(activeActivities[0].id)
    }
  }, [activeActivities, activityId, setActivityId])

  useEffect(() => {
    if (projectId && !activeProjects.some((p) => p.id === projectId)) {
      setProjectId('')
    }
  }, [activeProjects, projectId, setProjectId])

  const selectedActivity = activeActivities.find((a) => a.id === activityId) ?? null

  const handleStart = async (e: FormEvent) => {
    e.preventDefault()
    if (!activityId || timerBusy) return
    const ok = await startTimer({
      activity_id: activityId,
      project_id: projectId || null,
      description: note.trim() || null,
    })
    if (ok) {
      setNote('')
    }
  }

  return (
    <section aria-label="Focus prompt and timer" className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          <span>Focus</span>
          <span
            className={cn(
              'h-2 w-2 rounded-full bg-accent',
              activeSession?.status === 'active' && 'animate-pulse',
            )}
          />
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">
          {activeSession ? (
            <span>
              {activeSession.activity.name}
              {activeSession.project && (
                <span className="font-normal text-fg-muted"> · {activeSession.project.name}</span>
              )}
            </span>
          ) : (
            <span>
              What are you working on?{' '}
              <span className="font-light text-fg-subtle" aria-hidden="true">
                |
              </span>
            </span>
          )}
        </h1>
      </div>

      {activeSession ? (
        <div
          className={cn(
            'flex flex-col justify-between gap-3 rounded-2xl border bg-surface px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:flex-row sm:items-center',
            activeSession.status === 'active' ? 'border-accent/40' : 'border-border',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: activeSession.activity.color }}
            />
            <span className="truncate text-xs text-fg-muted">
              Started {formatTimeInZone(activeSession.started_at, tz)}
              {activeSession.description ? ` · ${activeSession.description}` : ''}
            </span>
            {activeSession.status === 'paused' && <Badge tone="neutral">Paused</Badge>}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2.5 sm:justify-end">
            <span className="font-mono text-sm font-semibold text-fg tabular-nums">
              {formatTimerClock(elapsedSeconds)}
            </span>
            <div className="flex items-center gap-1.5">
              {activeSession.status === 'active' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={timerBusy}
                  onClick={() => void pauseTimer()}
                >
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pause</span>
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={timerBusy}
                  onClick={() => void resumeTimer()}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Resume</span>
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                disabled={timerBusy}
                onClick={() => void stopTimer()}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </Button>
            </div>
          </div>
        </div>
      ) : activeActivities.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-fg-muted">
          <span>No active activities yet. Create one to start focusing.</span>
          <Button size="sm" variant="secondary" onClick={() => setActiveNav('activities')}>
            Manage activities
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleStart}
          aria-label="Start focus timer"
          className="rounded-2xl border border-border bg-surface p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-border-strong sm:px-2.5 sm:py-1.5"
        >
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex min-w-0 shrink-0 items-center gap-2 pl-1.5 sm:w-36">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedActivity?.color ?? 'var(--accent)' }}
              />
              <Select
                aria-label="Activity"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className="border-transparent bg-transparent pl-1 font-medium text-fg hover:bg-surface-muted/60"
              >
                {activeActivities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            <span className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

            <div className="shrink-0 sm:w-36">
              <Select
                aria-label="Project (optional)"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="border-transparent bg-transparent font-medium text-fg-muted hover:bg-surface-muted/60"
              >
                <option value="">No project</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <span className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              aria-label="Session note"
              className="h-9 min-w-0 flex-1 rounded-xl bg-transparent px-2 text-xs text-fg placeholder:text-fg-subtle focus:bg-surface-muted/35 focus:outline-none"
            />

            <button
              type="submit"
              disabled={!activityId || timerBusy}
              aria-label="Start focus timer"
              title="Start focus timer"
              className={cn(
                'flex h-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50',
                compact ? 'w-full sm:w-9' : 'w-full sm:w-9',
              )}
            >
              <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
