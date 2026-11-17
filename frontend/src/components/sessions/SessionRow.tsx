import { Clock, Edit3, PenLine, Play, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Misc'
import { formatDateInZone, formatDurationHuman, formatTimeInZone } from '@/services/timeFormat'
import type { SessionRecord } from '@/types'

export function SessionRow({
  session,
  timeZone,
  showDate = false,
  onEdit,
  onDelete,
  onRestart,
}: {
  session: SessionRecord
  timeZone: string
  showDate?: boolean
  onEdit?: (session: SessionRecord) => void
  onDelete?: (session: SessionRecord) => void
  onRestart?: (session: SessionRecord) => void
}) {
  const startDate = formatDateInZone(session.started_at, timeZone)
  const endDate = session.ended_at ? formatDateInZone(session.ended_at, timeZone) : startDate
  const crossesMidnight = Boolean(session.ended_at && endDate !== startDate)

  return (
    <div className="group flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-surface-muted/60">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: session.activity.color }}
          />
          <span className="font-medium text-fg">{session.activity.name}</span>
          {session.project && (
            <Badge>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: session.project.color }}
              />
              {session.project.name}
            </Badge>
          )}
          <Badge className="gap-1 text-[10px]">
            {session.tracking_method === 'timer' ? (
              <Clock className="h-2.5 w-2.5" />
            ) : (
              <PenLine className="h-2.5 w-2.5" />
            )}
            {session.tracking_method}
          </Badge>
          {crossesMidnight && (
            <Badge tone="accent" className="text-[10px]">
              +1d
            </Badge>
          )}
        </div>
        {session.description && (
          <p className="truncate text-xs text-fg-muted">{session.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right font-mono text-xs tabular-nums">
          <div className="text-fg-muted">
            {showDate && <span className="mr-1.5 text-fg-subtle">{startDate}</span>}
            {formatTimeInZone(session.started_at, timeZone)}
            {session.ended_at ? ` – ${formatTimeInZone(session.ended_at, timeZone)}` : ''}
          </div>
        </div>
        <div className="w-16 text-right font-mono text-xs font-semibold text-fg tabular-nums">
          {formatDurationHuman(session.duration_seconds)}
        </div>
        {(onRestart || onEdit || onDelete) && (
          <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
            {onRestart && (
              <button
                type="button"
                onClick={() => onRestart(session)}
                className="rounded p-1 text-fg-muted hover:bg-accent-subtle hover:text-accent"
                aria-label={`Restart timer for ${session.activity.name}`}
                title={`Restart timer for ${session.activity.name}`}
              >
                <Play className="h-3 w-3 fill-current text-accent" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(session)}
                className="rounded p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                aria-label="Edit session"
                title="Edit session"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(session)}
                className="rounded p-1 text-fg-muted hover:bg-danger-subtle hover:text-danger"
                aria-label="Delete session"
                title="Delete session"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
