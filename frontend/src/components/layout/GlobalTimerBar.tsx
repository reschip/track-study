import { Calendar, ChevronDown, Keyboard, Moon, PictureInPicture2, Plus, Search, Sun } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { formatReadableDate, todayDateStringInZone } from '@/services/timeFormat'
import { formatTimerClock } from '@/services/timer'
import { useApp } from '@/state/AppContext'

export function GlobalTimerBar() {
  const {
    user,
    activeSession,
    elapsedSeconds,
    setManualModalOpen,
    setCommandOpen,
    setShortcutsOpen,
    theme,
    setTheme,
    setActiveNav,
    widgetState,
    toggleWidget,
  } = useApp()

  const tz = user?.timezone ?? 'UTC'
  const todayLabel = formatReadableDate(todayDateStringInZone(tz))

  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        {/* Left: Monogram aligned with left rail + Brand aligned with main content */}
        <div className="flex items-center md:gap-8">
          <button
            type="button"
            onClick={() => setActiveNav('overview')}
            className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-80 md:w-32 md:shrink-0"
            title="Focus home"
          >
            <span className="text-lg font-bold tracking-tight text-fg">A</span>
            <span className="text-[17px] font-semibold tracking-tight text-fg md:hidden">
              Activity
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav('overview')}
            className="hidden text-[18px] font-semibold tracking-tight text-fg transition-opacity hover:opacity-80 md:inline-block"
          >
            Activity
          </button>
        </div>

        {/* Right: Quiet date button, + Log time pill, and subtle utilities */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {activeSession && (
            <button
              type="button"
              onClick={() => setActiveNav('overview')}
              className="hidden items-center gap-2 rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent lg:inline-flex"
              title="Active timer running"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: activeSession.activity.color }}
              />
              <span className="max-w-[110px] truncate">{activeSession.activity.name}</span>
              <span className="font-mono tabular-nums">{formatTimerClock(elapsedSeconds)}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="hidden items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted/70 hover:text-fg sm:inline-flex"
            title="Quick jump & search (⌘K)"
          >
            <Calendar className="h-3.5 w-3.5 text-fg-subtle" />
            <span>{todayLabel}</span>
            <ChevronDown className="h-3 w-3 text-fg-subtle" />
          </button>

          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            aria-label="Log manual time"
            title="Log manual time (N)"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover sm:px-3.5 sm:py-2"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log time</span>
          </button>

          <div className="flex items-center gap-0.5 pl-0.5">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-muted/70 hover:text-fg"
              title="Command palette (⌘K)"
              aria-label="Open command palette"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void toggleWidget()}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                widgetState.visible
                  ? 'bg-accent-subtle text-accent'
                  : 'text-fg-subtle hover:bg-surface-muted/70 hover:text-fg',
              )}
              title={widgetState.visible ? 'Hide desktop widget' : 'Show desktop widget'}
              aria-label="Toggle desktop widget"
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-muted/70 hover:text-fg sm:inline-flex"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-muted/70 hover:text-fg"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
