import { Suspense, lazy, useEffect } from 'react'
import { BarChart3, FolderCog, History, X } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { useApp } from '@/state/AppContext'
import type { NavSection } from '@/types'

const ActivitiesPage = lazy(() =>
  import('@/pages/ActivitiesPage').then((m) => ({ default: m.ActivitiesPage })),
)
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const ProjectsPage = lazy(() =>
  import('@/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

type DrawerKind = 'history' | 'analytics' | 'manage'

const MANAGE_TABS: { id: Extract<NavSection, 'activities' | 'projects' | 'settings'>; label: string }[] = [
  { id: 'activities', label: 'Activities' },
  { id: 'projects', label: 'Projects' },
  { id: 'settings', label: 'Settings' },
]

function resolveDrawerKind(nav: NavSection): DrawerKind | null {
  if (nav === 'history') return 'history'
  if (nav === 'analytics') return 'analytics'
  if (nav === 'activities' || nav === 'projects' || nav === 'settings') return 'manage'
  return null
}

export function WorkspaceDrawer() {
  const {
    activeNav,
    setActiveNav,
    commandOpen,
    manualModalOpen,
    shortcutsOpen,
    pendingSwitch,
  } = useApp()

  const kind = resolveDrawerKind(activeNav)

  useEffect(() => {
    if (!kind) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (commandOpen || manualModalOpen || shortcutsOpen || pendingSwitch) return
      // Avoid closing the drawer when a nested Dialog / ConfirmDialog is open inside the page.
      if (document.querySelector('[role="dialog"]')) return
      setActiveNav('overview')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind, commandOpen, manualModalOpen, shortcutsOpen, pendingSwitch, setActiveNav])

  if (!kind) return null

  const close = () => setActiveNav('overview')

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      data-workspace-drawer={kind}
    >
      <aside
        aria-label={kind === 'history' ? 'History drawer' : kind === 'analytics' ? 'Insights drawer' : 'Manage drawer'}
        className="flex h-full w-full max-w-4xl flex-col border-l border-border bg-bg shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {kind === 'history' && (
              <div className="flex items-center gap-2 text-xs font-medium text-fg">
                <History className="h-3.5 w-3.5 text-fg-subtle" />
                <span>History</span>
              </div>
            )}
            {kind === 'analytics' && (
              <div className="flex items-center gap-2 text-xs font-medium text-fg">
                <BarChart3 className="h-3.5 w-3.5 text-fg-subtle" />
                <span>Insights</span>
              </div>
            )}
            {kind === 'manage' && (
              <div className="flex items-center gap-2.5">
                <span className="hidden items-center gap-1.5 text-xs font-medium text-fg-subtle sm:inline-flex">
                  <FolderCog className="h-3.5 w-3.5" />
                  Manage
                </span>
                <div
                  role="tablist"
                  aria-label="Manage sections"
                  className="inline-flex rounded-md border border-border bg-surface-muted/70 p-0.5"
                >
                  {MANAGE_TABS.map((tab) => {
                    const active = activeNav === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveNav(tab.id)}
                        className={cn(
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'bg-surface text-fg shadow-2xs'
                            : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={close}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            aria-label="Close drawer"
          >
            <kbd className="hidden rounded border border-border px-1 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline">
              Esc
            </kbd>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <Suspense fallback={<div className="py-8 text-center text-xs text-fg-muted">Loading…</div>}>
            {activeNav === 'history' && <HistoryPage />}
            {activeNav === 'analytics' && <AnalyticsPage />}
            {activeNav === 'activities' && <ActivitiesPage />}
            {activeNav === 'projects' && <ProjectsPage />}
            {activeNav === 'settings' && <SettingsPage />}
          </Suspense>
        </div>
      </aside>
    </div>
  )
}
