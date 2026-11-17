import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { sessionsApi } from '@/api/sessions'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import {
  formatDurationHuman,
  localDateTimeToUtcIso,
  todayDateStringInZone,
} from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function ManualEntryModal({
  open,
  onClose,
  defaultDate,
  defaultActivityId,
  defaultProjectId,
}: {
  open: boolean
  onClose: () => void
  defaultDate?: string
  defaultActivityId?: string
  defaultProjectId?: string
}) {
  const { user, activities, projects, notify, bumpDataVersion, reloadCatalogs } = useApp()
  const tz = user?.timezone ?? 'UTC'
  const activeActivities = useMemo(() => activities.filter((a) => !a.is_archived), [activities])

  const [mode, setMode] = useState<'start_end' | 'duration'>(
    user?.tracking_preferences.default_manual_mode ?? 'start_end',
  )
  const [activityId, setActivityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [durationHours, setDurationHours] = useState('1')
  const [durationMinutes, setDurationMinutes] = useState('0')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setMode(user?.tracking_preferences.default_manual_mode ?? 'start_end')
    setDateStr(defaultDate || todayDateStringInZone(tz))
    setActivityId(
      defaultActivityId ||
        user?.tracking_preferences.default_activity_id ||
        activeActivities[0]?.id ||
        '',
    )
    setProjectId(defaultProjectId || user?.tracking_preferences.default_project_id || '')
    setStartTime('09:00')
    setEndTime('10:00')
    setDurationHours('1')
    setDurationMinutes('0')
    setDescription('')
  }, [open, defaultDate, defaultActivityId, defaultProjectId, tz, user, activeActivities])

  const computedPreview = useMemo(() => {
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
    const hrs = Math.max(0, Number(durationHours) || 0)
    const mins = Math.max(0, Number(durationMinutes) || 0)
    const secs = Math.round(hrs * 3600 + mins * 60)
    const startIso = localDateTimeToUtcIso(dateStr, startTime, tz)
    const endIso = new Date(Date.parse(startIso) + secs * 1000).toISOString()
    return { startIso, endIso, secs, crossesMidnight: false }
  }, [dateStr, durationHours, durationMinutes, endTime, mode, startTime, tz])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!activityId) {
      setError('Select an activity.')
      return
    }
    if (!computedPreview || computedPreview.secs <= 0) {
      setError('Duration must be greater than 0 minutes.')
      return
    }

    setSubmitting(true)
    try {
      await sessionsApi.create({
        activity_id: activityId,
        project_id: projectId || null,
        started_at: computedPreview.startIso,
        ended_at: mode === 'start_end' ? computedPreview.endIso : null,
        duration_seconds: mode === 'duration' ? computedPreview.secs : null,
        description: description.trim() || null,
      })
      await reloadCatalogs()
      bumpDataVersion()
      notify('Logged manual session', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save manual entry')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Log manual time"
      description={`Times are interpreted in ${tz}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 rounded-md border border-border bg-surface-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('start_end')}
            className={`rounded py-1.5 font-medium transition-colors ${
              mode === 'start_end' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Start &amp; end time
          </button>
          <button
            type="button"
            onClick={() => setMode('duration')}
            className={`rounded py-1.5 font-medium transition-colors ${
              mode === 'duration' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            Direct duration
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Activity">
            <Select value={activityId} onChange={(e) => setActivityId(e.target.value)} required>
              {activeActivities.length === 0 && <option value="">No active activities</option>}
              {activeActivities.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Project (optional)">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
            hint={computedPreview?.crossesMidnight ? 'Crosses midnight (+1d)' : undefined}
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
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              />
            </Field>
            <Field label="Minutes">
              <Input
                type="number"
                min={0}
                max={59}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </Field>
          </div>
        )}

        <Field label="Description (optional)">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
          />
        </Field>

        {computedPreview && computedPreview.secs > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-muted px-3 py-2 text-xs">
            <span className="text-fg-muted">Total duration</span>
            <span className="font-mono font-medium text-fg tabular-nums">
              {formatDurationHuman(computedPreview.secs)}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || activeActivities.length === 0}>
            {submitting ? 'Saving…' : 'Save session'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
