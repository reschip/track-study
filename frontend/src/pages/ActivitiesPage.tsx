import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  BarChart2,
  Edit3,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { activitiesApi } from '@/api/activities'
import { ApiError } from '@/api/client'
import { DailyLineChart } from '@/components/charts/AnalyticsCharts'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Misc'
import { formatDurationHuman, formatReadableDate } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { Activity, ActivityCategory, ActivityStats } from '@/types'

const COLOR_SWATCHES = [
  '#1F6FEB',
  '#2DA44E',
  '#8250DF',
  '#0969DA',
  '#0E8A16',
  '#BF8700',
  '#CF222E',
  '#0A7F8A',
  '#D97706',
  '#6E7781',
]

export function ActivitiesPage() {
  const { activities, reloadCatalogs, startTimer, notify, bumpDataVersion, dataVersion } = useApp()

  const [categoryFilter, setCategoryFilter] = useState<'all' | ActivityCategory>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<ActivityCategory>('professional')
  const [color, setColor] = useState('#1F6FEB')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    if (!selectedId && activities.length > 0) {
      setSelectedId(activities[0].id)
    }
  }, [activities, selectedId])

  useEffect(() => {
    if (!selectedId) {
      setStats(null)
      return
    }
    let cancelled = false
    setStatsLoading(true)
    activitiesApi
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activities.filter((a) => {
      if (!showArchived && a.is_archived) return false
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false
      if (q && !a.name.toLowerCase().includes(q) && !(a.description ?? '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [activities, categoryFilter, search, showArchived])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setCategory('professional')
    setColor('#1F6FEB')
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (act: Activity) => {
    setEditing(act)
    setName(act.name)
    setDescription(act.description ?? '')
    setCategory(act.category)
    setColor(act.color)
    setFormError(null)
    setFormOpen(true)
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      if (editing) {
        await activitiesApi.update(editing.id, {
          name,
          description: description.trim() || null,
          category,
          color,
        })
        notify(`Updated ${name}`, 'success')
      } else {
        const created = await activitiesApi.create({
          name,
          description: description.trim() || null,
          category,
          color,
        })
        setSelectedId(created.id)
        notify(`Created ${created.name}`, 'success')
      }
      await reloadCatalogs()
      bumpDataVersion()
      setFormOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save activity')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async (act: Activity) => {
    try {
      if (act.is_archived) {
        await activitiesApi.restore(act.id)
        notify(`Restored ${act.name}`, 'success')
      } else {
        await activitiesApi.archive(act.id)
        notify(`Archived ${act.name}`, 'info')
      }
      await reloadCatalogs()
      bumpDataVersion()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await activitiesApi.remove(deleteTarget.id)
      notify(`Deleted ${deleteTarget.name}`, 'info')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      await reloadCatalogs()
      bumpDataVersion()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'activity_has_sessions') {
        notify(err.message, 'error')
      } else {
        notify(err instanceof Error ? err.message : 'Failed to delete activity', 'error')
      }
    } finally {
      setDeleting(false)
    }
  }

  const grouped = useMemo(() => {
    const pro = filtered.filter((a) => a.category === 'professional')
    const per = filtered.filter((a) => a.category === 'personal')
    return { pro, per }
  }, [filtered])

  const renderGroup = (title: string, items: Activity[]) => {
    if (items.length === 0) return null
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {title} ({items.length})
          </h3>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {items.map((act) => {
            const isSelected = selectedId === act.id
            return (
              <div
                key={act.id}
                onClick={() => setSelectedId(act.id)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 transition-colors ${
                  isSelected ? 'bg-surface-muted/90' : 'hover:bg-surface-muted/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: act.color }}
                    />
                    <span className="truncate text-[13px] font-medium text-fg">{act.name}</span>
                    {act.is_archived && <Badge>Archived</Badge>}
                  </div>
                  {act.description && (
                    <p className="mt-0.5 truncate pl-4.5 text-xs text-fg-subtle">
                      {act.description}
                    </p>
                  )}
                </div>

                <div
                  className="flex shrink-0 items-center gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-right font-mono text-xs tabular-nums">
                    <div className="font-medium text-fg">
                      {formatDurationHuman(act.total_seconds)}
                    </div>
                    <div className="text-[10px] text-fg-subtle">{act.session_count} sess</div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    {!act.is_archived && (
                      <button
                        type="button"
                        onClick={() => void startTimer({ activity_id: act.id })}
                        className="rounded p-1.5 text-accent hover:bg-accent-subtle"
                        title="Start timer"
                        aria-label={`Start ${act.name}`}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(act)}
                      className="rounded p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
                      title="Edit activity"
                      aria-label={`Edit ${act.name}`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleArchiveToggle(act)}
                      className="rounded p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
                      title={act.is_archived ? 'Restore' : 'Archive'}
                      aria-label={act.is_archived ? `Restore ${act.name}` : `Archive ${act.name}`}
                    >
                      {act.is_archived ? (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(act)}
                      className="rounded p-1.5 text-fg-muted hover:bg-danger-subtle hover:text-danger"
                      title="Delete activity"
                      aria-label={`Delete ${act.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activities"
        subtitle="Manage professional & personal activities while keeping full historical integrity."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New activity
          </Button>
        }
      />

      {/* Filter strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search activities…"
            className="w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="w-40"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | ActivityCategory)}
          >
            <option value="all">All categories</option>
            <option value="professional">Professional</option>
            <option value="personal">Personal</option>
          </Select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-border accent-accent"
          />
          Show archived
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          {filtered.length === 0 ? (
            <EmptyState
              title="No matching activities"
              description="Create a new activity or adjust your category and archive filters."
              action={
                <Button variant="primary" size="sm" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  Create activity
                </Button>
              }
            />
          ) : (
            <>
              {renderGroup('Professional', grouped.pro)}
              {renderGroup('Personal', grouped.per)}
            </>
          )}
        </div>

        {/* Individual Activity Stats */}
        <div className="lg:col-span-5">
          <div className="sticky top-5 rounded-lg border border-border bg-surface p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-fg-subtle" />
                <h2 className="text-[13px] font-semibold text-fg">Activity insights</h2>
              </div>
              {stats && (
                <Badge>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: stats.activity.color }}
                  />
                  {stats.activity.name}
                </Badge>
              )}
            </div>

            {statsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : !stats ? (
              <p className="py-10 text-center text-xs text-fg-subtle">
                Select an activity on the left to inspect its statistics.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-border bg-bg px-3 py-2">
                    <div className="text-[10px] uppercase text-fg-subtle">Total</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-fg tabular-nums">
                      {formatDurationHuman(stats.total_seconds)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-bg px-3 py-2">
                    <div className="text-[10px] uppercase text-fg-subtle">Sessions</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-fg tabular-nums">
                      {stats.session_count}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-bg px-3 py-2">
                    <div className="text-[10px] uppercase text-fg-subtle">Average</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-fg tabular-nums">
                      {formatDurationHuman(stats.average_session_seconds)}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-fg-muted">
                  Last tracked:{' '}
                  <span className="text-fg">
                    {stats.last_tracked_at
                      ? formatReadableDate(stats.last_tracked_at.slice(0, 10))
                      : 'Never'}
                  </span>
                </div>

                {stats.projects.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-fg-subtle">Associated projects</div>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.projects.map((p) => (
                        <Badge key={p.id}>
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-fg-subtle">
                    Last 30 days trend
                  </div>
                  <DailyLineChart
                    data={stats.daily_series}
                    height={170}
                    color={stats.activity.color}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit activity' : 'New activity'}
      >
        <form onSubmit={handleSave} className="space-y-3.5">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Distributed Systems"
              required
            />
          </Field>

          <Field label="Category">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ActivityCategory)}
            >
              <option value="professional">Professional</option>
              <option value="personal">Personal</option>
            </Select>
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    color.toUpperCase() === swatch
                      ? 'scale-110 border-fg'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: swatch }}
                  aria-label={`Color ${swatch}`}
                />
              ))}
              <Input
                type="color"
                className="h-7 w-10 cursor-pointer p-0.5"
                value={color}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
              />
            </div>
          </Field>

          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief focus notes"
            />
          </Field>

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
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create activity'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Safe Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        description={
          deleteTarget && deleteTarget.session_count > 0
            ? `This activity has ${deleteTarget.session_count} logged session(s). Associated sessions are never deleted automatically, so deleting is blocked. Archive it instead to hide it from active pickers while preserving history.`
            : 'This permanently removes the activity. This action cannot be undone.'
        }
        confirmLabel="Delete permanently"
        danger
        loading={deleting}
        extraAction={
          deleteTarget && deleteTarget.session_count > 0 && !deleteTarget.is_archived ? (
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                const target = deleteTarget
                setDeleteTarget(null)
                await handleArchiveToggle(target)
              }}
            >
              Archive instead
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
