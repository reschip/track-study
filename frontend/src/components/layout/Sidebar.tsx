import {
  Activity as ActivityIcon,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  History,
  Keyboard,
  LayoutDashboard,
  Settings,
  Timer,
  X,
} from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { useApp } from '@/state/AppContext'
import type { NavSection } from '@/types'

const MAIN_NAV: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tracker', label: 'Tracker', icon: Timer },
  { id: 'activities', label: 'Activities', icon: ActivityIcon },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'history', label: 'History', icon: History },
]

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { activeNav, setActiveNav, user, setShortcutsOpen } = useApp()

  const navigate = (id: NavSection) => {
    setActiveNav(id)
    onCloseMobile()
  }

  const initials = (user?.name ?? 'A')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-surface">
      <div>
        {/* Brand header */}
        <div
          className={cn(
            'flex h-12 items-center border-b border-border px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <button
            type="button"
            onClick={() => navigate('overview')}
            className="flex items-center gap-2 text-left focus:outline-none"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-white">
              A
            </span>
            {!collapsed && (
              <div className="leading-tight">
                <div className="text-[13px] font-semibold tracking-tight text-fg">Activity</div>
              </div>
            )}
          </button>

          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden rounded p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg md:inline-flex"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg md:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {collapsed && (
          <div className="hidden justify-center border-b border-border py-1.5 md:flex">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Primary nav */}
        <nav className="space-y-0.5 p-2" aria-label="Main navigation">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-surface-muted text-fg'
                    : 'text-fg-muted hover:bg-surface-muted/60 hover:text-fg',
                )}
              >
                <Icon
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-fg-subtle')}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom section: Settings & User Profile */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          title={collapsed ? 'Keyboard shortcuts (?)' : undefined}
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors text-fg-muted hover:bg-surface-muted/60 hover:text-fg',
            collapsed && 'justify-center px-0',
          )}
        >
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 shrink-0 text-fg-subtle" />
            {!collapsed && <span>Shortcuts</span>}
          </div>
          {!collapsed && (
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
              ?
            </kbd>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('settings')}
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
            collapsed && 'justify-center px-0',
            activeNav === 'settings'
              ? 'bg-surface-muted text-fg'
              : 'text-fg-muted hover:bg-surface-muted/60 hover:text-fg',
          )}
        >
          <Settings
            className={cn(
              'h-4 w-4 shrink-0',
              activeNav === 'settings' ? 'text-accent' : 'text-fg-subtle',
            )}
          />
          {!collapsed && <span>Settings</span>}
        </button>

        <button
          type="button"
          onClick={() => navigate('settings')}
          title={user ? `${user.name} (${user.timezone})` : 'Profile'}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted/60',
            collapsed && 'justify-center px-0',
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-[10px] font-semibold text-fg">
            {initials}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-fg">
                {user?.name ?? 'Loading…'}
              </div>
              <div className="truncate text-[10px] text-fg-subtle">
                {user?.timezone ?? 'UTC'}
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border transition-all duration-200 md:block',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        {navContent}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={onCloseMobile} />
          <aside className="relative z-10 w-60 border-r border-border bg-surface">
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
