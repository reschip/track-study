import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Misc'
import { OverviewPage } from '@/pages/OverviewPage'
import { AppProvider, useApp } from '@/state/AppContext'

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
  return (
    <AppProvider>
      <AppShell>
        <ActiveView />
      </AppShell>
    </AppProvider>
  )
}
