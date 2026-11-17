import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Edit3, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { ActivityDistributionList } from '@/components/charts/ActivityDistributionList'
import { DailyLineChart } from '@/components/charts/AnalyticsCharts'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Misc'
import { formatDurationHuman, todayDateStringInZone } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { Project, ProjectStats, ProjectStatus } from '@/types'

const PROJECT_COLORS = ['#1F6FEB', '#2DA44E', '#CF222E', '#8250DF', '#BF8700', '#0A7F8A']

export function ProjectsPage() {
  const { user, projects, activities, reloadCatalogs, notify, bumpDataVersion, dataVersion } = useApp()
  const tz = user?.timezone ?? 'UTC'

  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#1F6FEB')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('active')
  const [linkedActivityIds, setLinkedActivityIds] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(
    () => projects.filter((p) => statusFilter === 'all' || p.status === statusFilter),
    [projects, statusFilter],
  )

  useEffect(() => {
    if (!selectedId && projects.length > 0) {
      setSelectedId(projects[0].id)
    }
  }, [projects, selectedId])

  useEffect(() => {
    if (!selectedId) {
      setStats(null)
      return
    }
    let cancelled = false
    setStatsLoading(true)
    projectsApi
      .getStats(selectedId, 30)
      .then((res) => {
        if (!cancelled) setStats(res)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, dataVersion])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setColor('#1F6FEB')
    setStartDate(todayDateStringInZone(tz))
    setEndDate('')
    setStatus('active')
    setLinkedActivityIds([])
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (proj: Project) => {
    setEditing(proj)
    setName(proj.name)
    setDescription(proj.description ?? '')
    setColor(proj.color)
    setStartDate(proj.start_date)
    setEndDate(proj.end_date ?? '')
    setStatus(proj.status)
    setLinkedActivityIds(proj.activities.map((a) => a.id))
    setFormError(null)
    setFormOpen(true)
  }

  const toggleActivity = (id: string) => {
    setLinkedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      if (editing) {
        await projectsApi.update(editing.id, {
          name,
          description: description.trim() || null,
          color,
          start_date: startDate,
          end_date: endDate || null,
          clear_end_date: !endDate,
          status,
          activity_ids: linkedActivityIds,
        })
        notify(`Updated ${name}`, 'success')
      } else {
        const created = await projectsApi.create({
          name,
          description: description.trim() || null,
          color,
          start_date: startDate,
          end_date: endDate || null,
          status,
          activity_ids: linkedActivityIds,
        })
        setSelectedId(created.id)
        notify(`Created ${created.name}`, 'success')
      }
      await reloadCatalogs()
      bumpDataVersion()
      setFormOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await projectsApi.remove(deleteTarget.id)
      notify(`Deleted ${deleteTarget.name}`, 'info')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      await reloadCatalogs()
      bumpDataVersion()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete project', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        subtitle="Group related activities across initiatives without task-management overhead."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Select
          className="w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ProjectStatus)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-6 w-6" />}
              title="No projects found"
              description="Create a project to aggregate hours across multiple activities."
              action={
                <Button variant="primary" size="sm" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  Create project
                </Button>
              }
            />
          ) : (
            filtered.map((proj) => {
              const isSelected = selectedId === proj.id
              return (
                <div
                  key={proj.id}
                  onClick={() => setSelectedId(proj.id)}
                  className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${
                    isSelected
                      ? 'border-border-strong bg-surface-muted/70'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: proj.color }}
                        />
                        <h3 className="truncate text-sm font-semibold text-fg">{proj.name}</h3>
                        <Badge className="capitalize">{proj.status}</Badge>
                      </div>
                      {proj.description && (
                        <p className="line-clamp-2 text-xs text-fg-muted">{proj.description}</p>
                      )}
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(proj)}
                        className="rounded p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
                        aria-label={`Edit ${proj.name}`}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(proj)}
                        className="rounded p-1.5 text-fg-muted hover:bg-danger-subtle hover:text-danger"
                        aria-label={`Delete ${proj.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {proj.activities.slice(0, 4).map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded bg-bg px-1.5 py-0.5 text-[11px] text-fg-muted"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: a.color }}
                          />
                          {a.name}
                        </span>
                      ))}
                    </div>
                    <div className="font-mono font-medium text-fg tabular-nums">
                      {formatDurationHuman(proj.total_seconds)} · {proj.session_count} sess
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Project Detail & Statistics */}
        <div className="lg:col-span-7">
          <div className="rounded-lg border border-border bg-surface p-5 space-y-5">
            {statsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-44 w-full" />
              </div>
            ) : !stats ? (
              <p className="py-12 text-center text-xs text-fg-subtle">
                Select a project to inspect hours, session averages, and daily activity.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: stats.project.color }}
                      />
                      <h2 className="text-base font-semibold text-fg">{stats.project.name}</h2>
                      <Badge className="capitalize">{stats.project.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {stats.project.start_date}
                      {stats.project.end_date ? ` → ${stats.project.end_date}` : ' → Ongoing'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border border-border bg-bg px-3.5 py-2.5">
                    <div className="text-[11px] uppercase text-fg-subtle">Total time</div>
                    <div className="mt-0.5 font-mono text-lg font-semibold text-fg tabular-nums">
                      {formatDurationHuman(stats.total_seconds)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-bg px-3.5 py-2.5">
                    <div className="text-[11px] uppercase text-fg-subtle">Sessions</div>
                    <div className="mt-0.5 font-mono text-lg font-semibold text-fg tabular-nums">
                      {stats.session_count}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-bg px-3.5 py-2.5">
                    <div className="text-[11px] uppercase text-fg-subtle">Avg session</div>
                    <div className="mt-0.5 font-mono text-lg font-semibold text-fg tabular-nums">
                      {formatDurationHuman(stats.average_session_seconds)}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-medium text-fg-muted">
                    Daily activity (last 30 days)
                  </h3>
                  <DailyLineChart
                    data={stats.daily_activity}
                    height={200}
                    color={stats.project.color}
                  />
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-medium text-fg-muted">Activity distribution</h3>
                  <ActivityDistributionList
                    items={stats.activity_distribution}
                    emptyText="No sessions logged under this project yet."
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit project' : 'New project'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-3.5">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Master's Thesis"
              required
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Project scope or goals"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>
            <Field label="End date (optional)">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Color">
              <div className="flex items-center gap-1.5 pt-1">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      color.toUpperCase() === c ? 'border-fg scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-fg-muted">Associated activities</span>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border bg-bg p-2">
              {activities
                .filter((a) => !a.is_archived)
                .map((act) => {
                  const checked = linkedActivityIds.includes(act.id)
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => toggleActivity(act.id)}
                      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                        checked
                          ? 'border-accent bg-accent-subtle text-fg'
                          : 'border-border bg-surface text-fg-muted hover:text-fg'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: act.color }}
                      />
                      {act.name}
                    </button>
                  )
                })}
            </div>
          </div>

          {formError && (
            <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save project' : 'Create project'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        description="Deleting this project removes the project grouping while preserving all logged sessions (they remain in your history without a project)."
        confirmLabel="Delete project"
        danger
        loading={deleting}
      />
    </div>
  )
}
