import { useCallback, useEffect, useMemo, useState } from 'react'
import { analyticsApi } from '@/api/analytics'
import { computeStreakStats } from '@/services/streak'
import { todayDateStringInZone } from '@/services/timeFormat'
import { useApp } from '@/state/AppContext'
import type { Activity, OverviewData } from '@/types'

export function useCompactFocusSummary() {
  const { user, activities, activeSession, elapsedSeconds, dataVersion } = useApp()
  const tz = user?.timezone ?? 'UTC'
  const todayStr = useMemo(() => todayDateStringInZone(tz), [tz])
  const currentYear = useMemo(() => Number(todayStr.slice(0, 4)), [todayStr])

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [currentStreak, setCurrentStreak] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [ov, hm] = await Promise.all([
        analyticsApi.overview(),
        analyticsApi.contributions({ year: currentYear }),
      ])
      setOverview(ov)
      const streak = computeStreakStats(hm.days, todayStr)
      setCurrentStreak(streak.currentStreak)
    } catch {
      // Auxiliary views silently retry on next state update
    }
  }, [currentYear, todayStr])

  useEffect(() => {
    void refresh()
  }, [refresh, dataVersion])

  const quickActivities = useMemo<Activity[]>(() => {
    const active = activities.filter((a) => !a.is_archived)
    const defaultId = user?.tracking_preferences.default_activity_id
    if (!defaultId) return active
    return [...active].sort((a, b) => {
      if (a.id === defaultId) return -1
      if (b.id === defaultId) return 1
      return 0
    })
  }, [activities, user?.tracking_preferences.default_activity_id])

  const todayCompletedSeconds = overview?.today.total_seconds ?? 0
  const todayLiveSeconds = todayCompletedSeconds + (activeSession ? elapsedSeconds : 0)

  return {
    overview,
    currentStreak,
    todayCompletedSeconds,
    todayLiveSeconds,
    todaySessionsCount: overview?.today.session_count ?? 0,
    quickActivities,
    refresh,
  }
}
