import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Misc'
import { DesktopWidget } from '@/components/widgets/DesktopWidget'
import { MenuBarPopover } from '@/components/widgets/MenuBarPopover'
import { OverviewPage } from '@/pages/OverviewPage'
import { AppProvider, useApp } from '@/state/AppContext'

type ViewMode = 'main' | 'popover' | 'widget'

function getViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'main'
  const view = new URLSearchParams(window.location.search).get('view')
  if (view === 'popover' || view === 'widget') return view
  return 'main'
}

function ActiveView() {
  const { loadingBoot } = useApp()

  if (loadingBoot) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-36 w-full" />
      </div>
    )
  }

  return <OverviewPage />
}

export default function App() {
  const viewMode = getViewMode()

  useEffect(() => {
    const transparent = viewMode === 'popover' || viewMode === 'widget'
    document.documentElement.classList.toggle('transparent-window', transparent)
    return () => {
      document.documentElement.classList.remove('transparent-window')
    }
  }, [viewMode])

  if (viewMode === 'popover') {
    return (
      <AppProvider>
        <MenuBarPopover />
      </AppProvider>
    )
  }

  if (viewMode === 'widget') {
    return (
      <AppProvider>
        <DesktopWidget />
      </AppProvider>
    )
  }

  return (
    <AppProvider>
      <AppShell>
        <ActiveView />
      </AppShell>
    </AppProvider>
  )
}
