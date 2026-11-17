import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Keyboard, Pause, Play, Plus, Search, Square } from 'lucide-react'
import { useApp } from '@/state/AppContext'
import type { NavSection } from '@/types'

const NAV_COMMANDS: { id: NavSection; label: string }[] = [
  { id: 'overview', label: 'Focus (Close drawers)' },
  { id: 'history', label: 'Open History drawer' },
  { id: 'analytics', label: 'Open Insights drawer' },
  { id: 'activities', label: 'Manage: Activities' },
  { id: 'projects', label: 'Manage: Projects' },
  { id: 'settings', label: 'Manage: Settings' },
]

export function CommandPalette() {
  const {
    commandOpen,
    setCommandOpen,
    activities,
    activeSession,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    setActiveNav,
    setManualModalOpen,
    setShortcutsOpen,
  } = useApp()

  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!commandOpen) return
    setQuery('')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandOpen, setCommandOpen])

  const activeActivities = useMemo(
    () => activities.filter((a) => !a.is_archived),
    [activities],
  )

  const q = query.trim().toLowerCase()

  const matchedActivities = useMemo(
    () =>
      activeActivities
        .filter((a) => !q || a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
        .slice(0, 6),
    [activeActivities, q],
  )

  const matchedNav = useMemo(
    () => NAV_COMMANDS.filter((n) => !q || n.label.toLowerCase().includes(q)),
    [q],
  )

  if (!commandOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-20 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setCommandOpen(false)
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Start an activity, open a drawer, or log manual time…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5 space-y-2">
          {activeSession && (
            <div>
              <div className="px-2 py-1 text-[11px] font-medium text-fg-subtle">Current timer</div>
              {activeSession.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCommandOpen(false)
                    void pauseTimer()
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-surface-muted"
                >
                  <Pause className="h-3.5 w-3.5 text-fg-muted" />
                  Pause {activeSession.activity.name}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCommandOpen(false)
                    void resumeTimer()
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-surface-muted"
                >
                  <Play className="h-3.5 w-3.5 text-accent" />
                  Resume {activeSession.activity.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(false)
                  void stopTimer()
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-danger hover:bg-danger-subtle"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop &amp; save {activeSession.activity.name}
              </button>
            </div>
          )}

          <div>
            <div className="px-2 py-1 text-[11px] font-medium text-fg-subtle">Quick actions</div>
            <button
              type="button"
              onClick={() => {
                setCommandOpen(false)
                setManualModalOpen(true)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-surface-muted"
            >
              <Plus className="h-3.5 w-3.5 text-accent" />
              <span>Log manual time entry</span>
              <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                N
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                setCommandOpen(false)
                setShortcutsOpen(true)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-surface-muted"
            >
              <Keyboard className="h-3.5 w-3.5 text-fg-muted" />
              <span>Show keyboard shortcuts cheat-sheet</span>
              <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                ?
              </kbd>
            </button>
          </div>

          {matchedActivities.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-medium text-fg-subtle">Start timer</div>
              {matchedActivities.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => {
                    setCommandOpen(false)
                    void startTimer({ activity_id: act.id })
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: act.color }}
                    />
                    <span>Start {act.name}</span>
                  </span>
                  <span className="text-[11px] capitalize text-fg-subtle">{act.category}</span>
                </button>
              ))}
            </div>
          )}

          {matchedNav.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-medium text-fg-subtle">Navigation</div>
              {matchedNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveNav(item.id)
                    setCommandOpen(false)
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-surface-muted"
                >
                  <span>{item.label}</span>
                  <ArrowRight className="h-3 w-3 text-fg-subtle" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
