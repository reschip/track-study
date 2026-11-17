import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, History as HistoryIcon, Plus } from 'lucide-react'
import { sessionsApi } from '@/api/sessions'
import { PageHeader } from '@/components/layout/AppShell'
import { DayTimelineView } from '@/components/sessions/DayTimelineView'
import { EditSessionModal } from '@/components/sessions/EditSessionModal'
import { SessionRow } from '@/components/sessions/SessionRow'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState, Skeleton } from '@/components/ui/Misc'
import {
  formatDateInZone,
  formatDurationHuman,
  formatReadableDate,
  todayDateStringInZone,
} from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { SessionRecord, TrackingMethod } from '@/types'

export function HistoryPage() {
  const {
    user,
    activities,
    projects,
    dataVersion,
    bumpDataVersion,
    reloadCatalogs,
    notify,
    setManualModalOpen,
    startTimer,
  } = useApp()
  const tz = user?.timezone ?? 'UTC'

  const [viewMode, setViewMode] = useState<'feed' | 'timeline'>('feed')
  const [timelineDate, setTimelineDate] = useState(() => todayDateStringInZone(tz))

  const [activityId, setActivityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [method, setMethod] = useState<'all' | TrackingMethod>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'desc' | 'asc'>('desc')

  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<SessionRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SessionRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    sessionsApi
      .list({
        activity_id: activityId || undefined,
        project_id: projectId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        tracking_method: method === 'all' ? undefined : method,
        search: search.trim() || undefined,
        sort,
        limit: 500,
      })
      .then((res) => {
        if (cancelled) return
        setSessions(res.items)
        setTotalSeconds(res.total_seconds)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activityId, projectId, startDate, endDate, method, search, sort, dataVersion])

  const groupedByDay = useMemo(() => {
    const groups: { date: string; totalSeconds: number; items: SessionRecord[] }[] = []
    const byDate = new Map<string, SessionRecord[]>()
    for (const s of sessions) {
      const d = formatDateInZone(s.started_at, tz)
      const list = byDate.get(d) ?? []
      list.push(s)
      byDate.set(d, list)
    }
    for (const [date, items] of byDate.entries()) {
      groups.push({
        date,
        totalSeconds: items.reduce((acc, x) => acc + x.duration_seconds, 0),
        items,
      })
    }
    return groups
  }, [sessions, tz])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await sessionsApi.remove(deleteTarget.id)
      notify('Deleted session', 'info')
      setDeleteTarget(null)
      await reloadCatalogs()
      bumpDataVersion()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete session', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="History"
        subtitle={`${sessions.length} session(s) · ${formatDurationHuman(totalSeconds)} total`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('feed')}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium ${
                  viewMode === 'feed' ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <HistoryIcon className="h-3.5 w-3.5" />
                Feed
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium ${
                  viewMode === 'timeline' ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Timeline
              </button>
            </div>
            <Button variant="primary" size="sm" onClick={() => setManualModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Log time
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          placeholder="Search notes, activity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter by activity"
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
        >
          <option value="">All activities</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}{a.is_archived ? ' (archived)' : ''}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          type="date"
          aria-label="End date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <div className="flex gap-1.5">
          <Select
            aria-label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value as 'all' | TrackingMethod)}
          >
            <option value="all">All methods</option>
            <option value="timer">Timer</option>
            <option value="manual">Manual</option>
          </Select>
          <Select
            aria-label="Sort order"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'desc' | 'asc')}
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </Select>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <DayTimelineView
          dateStr={timelineDate}
          onDateChange={setTimelineDate}
          activityId={activityId}
          projectId={projectId}
        />
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : groupedByDay.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-6 w-6" />}
          title="No matching sessions"
          description="Try clearing a filter or start tracking time."
          action={
            <Button variant="outline" size="sm" onClick={() => setManualModalOpen(true)}>
              Log manual session
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {groupedByDay.map((group) => (
            <div
              key={group.date}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="flex items-center justify-between border-b border-border bg-surface-muted/50 px-3.5 py-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setTimelineDate(group.date)
                    setViewMode('timeline')
                  }}
                  className="font-semibold text-fg hover:underline"
                >
                  {formatReadableDate(group.date)}
                </button>
                <span className="font-mono font-medium text-fg-muted tabular-nums">
                  {group.items.length} session{group.items.length === 1 ? '' : 's'} ·{' '}
                  {formatDurationHuman(group.totalSeconds)}
                </span>
              </div>
              <div className="divide-y divide-border">
                {group.items.map((sess) => (
                  <SessionRow
                    key={sess.id}
                    session={sess}
                    timeZone={tz}
                    onRestart={(s) =>
                      void startTimer({
                        activity_id: s.activity_id,
                        project_id: s.project_id,
                        description: s.description,
                      })
                    }
                    onEdit={(s) => setEditing(s)}
                    onDelete={(s) => setDeleteTarget(s)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EditSessionModal session={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Delete session?"
        description={
          deleteTarget
            ? `Remove ${deleteTarget.activity.name} (${formatDurationHuman(deleteTarget.duration_seconds)}) from your history? This updates all analytics.`
            : ''
        }
        confirmLabel="Delete session"
        danger
        loading={deleting}
      />
    </div>
  )
}
