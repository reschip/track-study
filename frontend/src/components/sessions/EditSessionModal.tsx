import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { sessionsApi } from '@/api/sessions'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import {
  formatDateInZone,
  formatDurationHuman,
  formatTimeInZone,
  localDateTimeToUtcIso,
} from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { SessionRecord } from '@/types'

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function EditSessionModal({
  session,
  onClose,
}: {
  session: SessionRecord | null
  onClose: () => void
}) {
  const { user, activities, projects, notify, bumpDataVersion, reloadCatalogs } = useApp()
  const tz = user?.timezone ?? 'UTC'

  const [activityId, setActivityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!session) return
    setError(null)
    setActivityId(session.activity_id)
    setProjectId(session.project_id ?? '')
    setDateStr(formatDateInZone(session.started_at, tz))
    setStartTime(formatTimeInZone(session.started_at, tz))
    setEndTime(session.ended_at ? formatTimeInZone(session.ended_at, tz) : formatTimeInZone(session.started_at, tz))
    setDescription(session.description ?? '')
  }, [session, tz])

  const preview = useMemo(() => {
    if (!session || !dateStr || !startTime || !endTime) return null
    const crossesMidnight = endTime <= startTime
    const endDate = crossesMidnight ? addDays(dateStr, 1) : dateStr
    const startIso = localDateTimeToUtcIso(dateStr, startTime, tz)
    const endIso = localDateTimeToUtcIso(endDate, endTime, tz)
    const secs = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000)
    return { startIso, endIso, secs, crossesMidnight }
  }, [dateStr, endTime, session, startTime, tz])

  if (!session) return null

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!preview || preview.secs <= 0) {
      setError('End time must produce a positive duration.')
      return
    }
    setSaving(true)
    try {
      const origDate = formatDateInZone(session.started_at, tz)
      const origStart = formatTimeInZone(session.started_at, tz)
      const origEnd = session.ended_at ? formatTimeInZone(session.ended_at, tz) : origStart
      const timingEdited = dateStr !== origDate || startTime !== origStart || endTime !== origEnd

      await sessionsApi.update(session.id, {
        activity_id: activityId,
        project_id: projectId || null,
        clear_project: !projectId,
        ...(timingEdited ? { started_at: preview.startIso, ended_at: preview.endIso } : {}),
        description: description.trim() || null,
      })
      await reloadCatalogs()
      bumpDataVersion()
      notify('Session updated', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={Boolean(session)}
      onClose={onClose}
      title="Edit session"
      description={`Times shown in ${tz}`}
    >
      <form onSubmit={handleSave} className="space-y-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Activity">
            <Select value={activityId} onChange={(e) => setActivityId(e.target.value)} required>
              {activities
                .filter((a) => !a.is_archived || a.id === session.activity_id)
                .map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.name}{act.is_archived ? ' (archived)' : ''}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">
            <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
          </Field>
          <Field label="Start">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field
            label="End"
            hint={preview?.crossesMidnight ? '+1d' : undefined}
          >
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Session notes"
          />
        </Field>

        {preview && preview.secs > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-muted px-3 py-2 text-xs">
            <span className="text-fg-muted">
              {session.segments.length > 1
                ? 'Note: editing times normalizes paused segments'
                : 'Duration'}
            </span>
            <span className="font-mono font-medium text-fg tabular-nums">
              {formatDurationHuman(preview.secs)}
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
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
