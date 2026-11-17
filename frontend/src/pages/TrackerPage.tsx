import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Clock, Pause, Play, Square } from 'lucide-react'
import { sessionsApi } from '@/api/sessions'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Misc'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import {
  formatDurationHuman,
  formatTimeInZone,
  localDateTimeToUtcIso,
  todayDateStringInZone,
} from '@/services/timeFormat'
import { formatTimerClock } from '@/services/timer'
import { useApp } from '@/state/AppContext'

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function TrackerPage() {
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
    updateRunningMeta,
    notify,
    bumpDataVersion,
    reloadCatalogs,
  } = useApp()

  const tz = user?.timezone ?? 'UTC'
  const activeActivities = useMemo(() => activities.filter((a) => !a.is_archived), [activities])

  // Stopwatch start controls
  const [timerActivityId, setTimerActivityId] = useState('')
  const [timerProjectId, setTimerProjectId] = useState('')
  const [timerNote, setTimerNote] = useState('')

  // Running timer metadata editor
  const [runningProjectId, setRunningProjectId] = useState('')
  const [runningNote, setRunningNote] = useState('')

  useEffect(() => {
    if (!timerActivityId && activeActivities.length > 0) {
      setTimerActivityId(user?.tracking_preferences.default_activity_id || activeActivities[0].id)
    }
  }, [activeActivities, timerActivityId, user])

  useEffect(() => {
    if (activeSession) {
      setRunningProjectId(activeSession.project_id ?? '')
      setRunningNote(activeSession.description ?? '')
    }
  }, [activeSession])

  // Inline Manual Entry form
  const [mode, setMode] = useState<'start_end' | 'duration'>(
    user?.tracking_preferences.default_manual_mode ?? 'start_end',
  )
  const [manActivityId, setManActivityId] = useState('')
  const [manProjectId, setManProjectId] = useState('')
  const [dateStr, setDateStr] = useState(() => todayDateStringInZone(tz))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [durHours, setDurHours] = useState('1')
  const [durMins, setDurMins] = useState('0')
  const [manDesc, setManDesc] = useState('')
  const [manError, setManError] = useState<string | null>(null)
  const [manSaving, setManSaving] = useState(false)

  useEffect(() => {
    if (!manActivityId && activeActivities.length > 0) {
      setManActivityId(user?.tracking_preferences.default_activity_id || activeActivities[0].id)
    }
  }, [activeActivities, manActivityId, user])

  const manualPreview = useMemo(() => {
    if (!dateStr || !startTime) return null
    if (mode === 'start_end') {
      if (!endTime) return null
      const crossesMidnight = endTime <= startTime
      const endDate = crossesMidnight ? addDays(dateStr, 1) : dateStr
      const startIso = localDateTimeToUtcIso(dateStr, startTime, tz)
      const endIso = localDateTimeToUtcIso(endDate, endTime, tz)
      const secs = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000)
      return { startIso, endIso, secs, crossesMidnight }
    }
    const secs = Math.round((Number(durHours) || 0) * 3600 + (Number(durMins) || 0) * 60)
    const startIso = localDateTimeToUtcIso(dateStr, startTime, tz)
    const endIso = new Date(Date.parse(startIso) + secs * 1000).toISOString()
    return { startIso, endIso, secs, crossesMidnight: false }
  }, [dateStr, durHours, durMins, endTime, mode, startTime, tz])

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setManError(null)
    if (!manActivityId) {
      setManError('Select an activity.')
      return
    }
    if (!manualPreview || manualPreview.secs <= 0) {
      setManError('Duration must be greater than 0.')
      return
    }
    setManSaving(true)
    try {
      await sessionsApi.create({
        activity_id: manActivityId,
        project_id: manProjectId || null,
        started_at: manualPreview.startIso,
        ended_at: mode === 'start_end' ? manualPreview.endIso : null,
        duration_seconds: mode === 'duration' ? manualPreview.secs : null,
        description: manDesc.trim() || null,
      })
      setManDesc('')
      await reloadCatalogs()
      bumpDataVersion()
      notify('Logged manual session', 'success')
    } catch (err) {
      setManError(err instanceof Error ? err.message : 'Failed to log session')
    } finally {
      setManSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tracker"
        subtitle={`Real-time stopwatch & manual time entry (${tz})`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Live Timer Engine */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-fg">Timer engine</h2>
            {activeSession && (
              <Badge tone={activeSession.status === 'active' ? 'accent' : 'neutral'}>
                {activeSession.status === 'active' ? 'Running' : 'Paused'}
              </Badge>
            )}
          </div>

          {activeSession ? (
            <div className="space-y-5">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: activeSession.activity.color }}
                    />
                    <span className="text-base font-semibold text-fg">
                      {activeSession.activity.name}
                    </span>
                  </div>
                  <div className="text-xs text-fg-muted">
                    Started {formatTimeInZone(activeSession.started_at, tz)} ·{' '}
                    {activeSession.segments.length} segment
                    {activeSession.segments.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="font-mono text-4xl font-semibold tracking-tight text-fg tabular-nums">
                  {formatTimerClock(elapsedSeconds)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeSession.status === 'active' ? (
                  <Button variant="secondary" onClick={() => void pauseTimer()} disabled={timerBusy}>
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void resumeTimer()} disabled={timerBusy}>
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => void stopTimer(runningNote.trim() || null)}
                  disabled={timerBusy}
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop &amp; save
                </Button>
              </div>

              {/* Live metadata update */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Project">
                    <Select
                      value={runningProjectId}
                      onChange={(e) => {
                        const val = e.target.value
                        setRunningProjectId(val)
                        void updateRunningMeta({
                          project_id: val || null,
                          clear_project: !val,
                        })
                      }}
                    >
                      <option value="">No project</option>
                      {projects
                        .filter((p) => p.status !== 'archived')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Session note">
                    <div className="flex gap-1.5">
                      <Input
                        value={runningNote}
                        onChange={(e) => setRunningNote(e.target.value)}
                        placeholder="Add description…"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void updateRunningMeta({ description: runningNote })}
                      >
                        Save
                      </Button>
                    </div>
                  </Field>
                </div>

                {/* Segments breakdown */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-fg-muted">
                    Recorded segments (pauses excluded)
                  </div>
                  <div className="divide-y divide-border rounded-md border border-border bg-bg text-xs">
                    {activeSession.segments.map((seg, idx) => (
                      <div
                        key={seg.id}
                        className="flex items-center justify-between px-3 py-1.5 font-mono tabular-nums"
                      >
                        <span className="text-fg-muted">
                          #{idx + 1} · {formatTimeInZone(seg.started_at, tz)} →{' '}
                          {seg.ended_at ? formatTimeInZone(seg.ended_at, tz) : 'active'}
                        </span>
                        <span className="text-fg">
                          {seg.ended_at ? formatDurationHuman(seg.duration_seconds) : 'running'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border border-border bg-bg px-4 py-5">
                <div>
                  <div className="text-sm font-medium text-fg">Ready to track</div>
                  <div className="text-xs text-fg-muted">
                    Choose an activity below or pick a quick chip.
                  </div>
                </div>
                <div className="font-mono text-3xl font-semibold text-fg-subtle tabular-nums">
                  00:00:00
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Activity">
                  <Select
                    value={timerActivityId}
                    onChange={(e) => setTimerActivityId(e.target.value)}
                  >
                    {activeActivities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Project (optional)">
                  <Select
                    value={timerProjectId}
                    onChange={(e) => setTimerProjectId(e.target.value)}
                  >
                    <option value="">No project</option>
                    {projects
                      .filter((p) => p.status !== 'archived')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>

              <Field label="Description (optional)">
                <Input
                  value={timerNote}
                  onChange={(e) => setTimerNote(e.target.value)}
                  placeholder="What are you focusing on?"
                />
              </Field>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={timerBusy || !timerActivityId}
                onClick={async () => {
                  const ok = await startTimer({
                    activity_id: timerActivityId,
                    project_id: timerProjectId || null,
                    description: timerNote.trim() || null,
                  })
                  if (ok) setTimerNote('')
                }}
              >
                <Play className="h-4 w-4 fill-current" />
                Start timer
              </Button>

              {activeActivities.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-fg-subtle">Quick start</div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeActivities.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() =>
                          void startTimer({
                            activity_id: act.id,
                            project_id: timerProjectId || null,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-fg-muted hover:border-border-strong hover:text-fg"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: act.color }}
                        />
                        {act.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Manual Time Entry */}
        <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-fg">Manual time entry</h2>
            <Clock className="h-4 w-4 text-fg-subtle" />
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-3.5">
            <div className="grid grid-cols-2 rounded-md border border-border bg-surface-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('start_end')}
                className={`rounded py-1.5 font-medium transition-colors ${
                  mode === 'start_end' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
                }`}
              >
                Start &amp; end
              </button>
              <button
                type="button"
                onClick={() => setMode('duration')}
                className={`rounded py-1.5 font-medium transition-colors ${
                  mode === 'duration' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
                }`}
              >
                Duration
              </button>
            </div>

            <Field label="Activity">
              <Select value={manActivityId} onChange={(e) => setManActivityId(e.target.value)} required>
                {activeActivities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Project (optional)">
              <Select value={manProjectId} onChange={(e) => setManProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects
                  .filter((p) => p.status !== 'archived')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  required
                />
              </Field>
              <Field label="Start time">
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </Field>
            </div>

            {mode === 'start_end' ? (
              <Field
                label="End time"
                hint={manualPreview?.crossesMidnight ? 'Next day (+1d)' : undefined}
              >
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hours">
                  <Input
                    type="number"
                    min={0}
                    max={72}
                    value={durHours}
                    onChange={(e) => setDurHours(e.target.value)}
                  />
                </Field>
                <Field label="Minutes">
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={durMins}
                    onChange={(e) => setDurMins(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <Field label="Description (optional)">
              <Textarea
                value={manDesc}
                onChange={(e) => setManDesc(e.target.value)}
                placeholder="Notes for this session"
              />
            </Field>

            {manualPreview && manualPreview.secs > 0 && (
              <div className="flex items-center justify-between rounded-md border border-border bg-bg px-3 py-2 text-xs">
                <span className="text-fg-muted">Duration</span>
                <span className="font-mono font-medium text-fg tabular-nums">
                  {formatDurationHuman(manualPreview.secs)}
                </span>
              </div>
            )}

            {manError && (
              <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
                {manError}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={manSaving}>
              {manSaving ? 'Saving…' : 'Log manual session'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
