import type { ReactNode } from 'react'
import { cn } from './cn'

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode
  className?: string
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent-subtle text-accent border-accent/20'
      : tone === 'danger'
        ? 'bg-danger-subtle text-danger border-danger/20'
        : 'bg-surface-muted text-fg-muted border-border'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none',
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-muted', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="mb-2.5 text-fg-subtle">{icon}</div>}
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-fg-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
