import type { DistributionItem } from '@/types'
import { formatDurationHuman } from '@/services/timeFormat'

export function ActivityDistributionList({
  items,
  emptyText = 'No sessions recorded yet.',
}: {
  items: DistributionItem[]
  emptyText?: string
}) {
  if (items.length === 0) {
    return <p className="py-4 text-xs text-fg-subtle">{emptyText}</p>
  }

  return (
    <div className="space-y-3.5">
      {items.map((item) => (
        <div key={item.id ?? item.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium text-fg">{item.name}</span>
            <div className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-fg-subtle">{item.percentage.toFixed(0)}%</span>
              <span className="w-12 text-right font-semibold text-fg">
                {formatDurationHuman(item.total_seconds)}
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(3, item.percentage)}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
