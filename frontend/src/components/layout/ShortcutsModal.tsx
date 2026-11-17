import { Dialog } from '@/components/ui/Dialog'

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  items: ShortcutItem[]
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Timer & Tracking',
    items: [
      { keys: ['Space'], description: 'Start, Pause or Resume active timer' },
      { keys: ['⌘', '.'], description: 'Stop active timer and save session' },
      { keys: ['N'], description: 'Open manual time entry dialog' },
      { keys: ['1', '–', '5'], description: 'Start favorite activity immediately' },
    ],
  },
  {
    title: 'Navigation (Press G, then key)',
    items: [
      { keys: ['G', 'O'], description: 'Return to Focus view' },
      { keys: ['G', 'H'], description: 'Open History drawer' },
      { keys: ['G', 'A'], description: 'Open Insights drawer' },
      { keys: ['G', 'S'], description: 'Open Manage / Settings drawer' },
    ],
  },
  {
    title: 'General',
    items: [
      { keys: ['⌘', 'K'], description: 'Open command palette & search' },
      { keys: ['?'], description: 'Toggle this keyboard shortcuts cheat-sheet' },
      { keys: ['Esc'], description: 'Close any modal or dialog' },
    ],
  },
]

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Navigate and track without taking your hands off the keyboard."
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 p-4">
        {SHORTCUT_SECTIONS.map((sec) => (
          <div key={sec.title} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {sec.title}
            </h3>
            <div className="divide-y divide-border rounded-lg border border-border bg-surface-muted/30">
              {sec.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                >
                  <span className="text-fg-muted">{item.description}</span>
                  <div className="flex items-center gap-1 font-mono">
                    {item.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="inline-flex min-w-[20px] items-center justify-center rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-fg shadow-xs"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[11px] text-fg-subtle">
        <span>Shortcuts are inactive while typing inside form inputs.</span>
        <span>
          Press <kbd className="font-mono text-fg">Esc</kbd> to close
        </span>
      </div>
    </Dialog>
  )
}

