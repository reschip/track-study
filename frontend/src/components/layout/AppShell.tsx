import type { ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { GlobalTimerBar } from '@/components/layout/GlobalTimerBar'
import { ShortcutsModal } from '@/components/layout/ShortcutsModal'
import { WorkspaceDrawer } from '@/components/layout/WorkspaceDrawer'
import { ManualEntryModal } from '@/components/tracker/ManualEntryModal'
import { SwitchSessionDialog } from '@/components/tracker/SwitchSessionDialog'
import { cn } from '@/components/ui/cn'
import { useApp } from '@/state/AppContext'
import type { NavSection } from '@/types'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

const RAIL_ITEMS: { id: NavSection; label: string; match: (nav: NavSection) => boolean }[] = [
  {
    id: 'overview',
    label: 'Focus',
    match: (n) => n === 'overview' || n === 'tracker' || n === 'calendar',
  },
  { id: 'history', label: 'History', match: (n) => n === 'history' },
  { id: 'analytics', label: 'Insights', match: (n) => n === 'analytics' },
  {
    id: 'activities',
    label: 'Manage',
    match: (n) => n === 'activities' || n === 'projects' || n === 'settings',
  },
]

export function AppShell({ children }: { children: ReactNode }) {
  const {
    activeNav,
    setActiveNav,
    manualModalOpen,
    setManualModalOpen,
    shortcutsOpen,
    setShortcutsOpen,
    toasts,
    dismissToast,
  } = useApp()

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <GlobalTimerBar />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-10 pt-2 sm:px-8 md:flex-row md:gap-8">
        {/* Mobile minimal nav */}
        <nav
          aria-label="Workspace navigation"
          className="mb-4 flex items-center gap-1.5 overflow-x-auto md:hidden"
        >
          {RAIL_ITEMS.map((item) => {
            const active = item.match(activeNav)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id === 'overview' ? 'overview' : active ? 'overview' : item.id)}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-accent-subtle text-accent'
                    : 'text-fg-muted hover:bg-surface-muted/60 hover:text-fg',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Desktop ultra-clean borderless left rail */}
        <aside aria-label="Workspace navigation" className="hidden w-32 shrink-0 flex-col gap-1 pt-1 md:flex">
          {RAIL_ITEMS.map((item) => {
            const active = item.match(activeNav)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id === 'overview' ? 'overview' : active ? 'overview' : item.id)}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-accent-subtle text-accent'
                    : 'text-fg-muted hover:bg-surface-muted/60 hover:text-fg',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <WorkspaceDrawer />

      <ManualEntryModal open={manualModalOpen} onClose={() => setManualModalOpen(false)} />
      <SwitchSessionDialog />
      <CommandPalette />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Subtle Toast Stack */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-fg shadow-md"
          >
            {t.tone === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-accent" />}
            {t.tone === 'error' && <XCircle className="h-3.5 w-3.5 text-danger" />}
            {t.tone === 'info' && <Info className="h-3.5 w-3.5 text-fg-muted" />}
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="ml-1 text-fg-subtle hover:text-fg"
              aria-label="Dismiss notification"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
