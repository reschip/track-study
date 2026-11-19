import { Suspense, lazy, useEffect } from 'react'
import { Skeleton } from '@/components/ui/Misc'
import { AppProvider, useApp } from '@/state/AppContext'

const AppShell = lazy(() =>
  import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })),
)
const OverviewPage = lazy(() =>
  import('@/pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
)
const DesktopWidget = lazy(() =>
  import('@/components/widgets/DesktopWidget').then((m) => ({ default: m.DesktopWidget })),
)
const MenuBarPopover = lazy(() =>
  import('@/components/widgets/MenuBarPopover').then((m) => ({ default: m.MenuBarPopover })),
)

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

  return (
    <Suspense fallback={null}>
      <OverviewPage />
    </Suspense>
  )
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
        <Suspense fallback={null}>
          <MenuBarPopover />
        </Suspense>
      </AppProvider>
    )
  }

  if (viewMode === 'widget') {
    return (
      <AppProvider>
        <Suspense fallback={null}>
          <DesktopWidget />
        </Suspense>
      </AppProvider>
    )
  }

  return (
    <AppProvider>
      <Suspense fallback={null}>
        <AppShell>
          <ActiveView />
        </AppShell>
      </Suspense>
    </AppProvider>
  )
}
