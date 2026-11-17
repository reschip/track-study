import { describe, expect, it } from 'vitest'
import { computeStreakStats } from './streak'
import type { ContributionDay } from '@/types'

describe('computeStreakStats', () => {
  it('returns zeros for empty or null days', () => {
    expect(computeStreakStats([])).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
      totalDays: 0,
    })
  })

  it('calculates longest and current streaks accurately', () => {
    const days: ContributionDay[] = [
      { date: '2026-11-01', total_seconds: 3600, session_count: 1, intensity: 2 },
      { date: '2026-11-02', total_seconds: 3600, session_count: 1, intensity: 2 },
      { date: '2026-11-03', total_seconds: 3600, session_count: 1, intensity: 2 },
      { date: '2026-11-04', total_seconds: 0, session_count: 0, intensity: 0 },
      { date: '2026-11-05', total_seconds: 1800, session_count: 1, intensity: 1 },
      { date: '2026-11-06', total_seconds: 1800, session_count: 1, intensity: 1 },
    ]

    const stats = computeStreakStats(days, '2026-11-06')
    expect(stats.longestStreak).toBe(3)
    expect(stats.currentStreak).toBe(2)
    expect(stats.totalActiveDays).toBe(5)
    expect(stats.totalDays).toBe(6)
  })

  it('preserves current streak when today is not yet tracked but yesterday was active', () => {
    const days: ContributionDay[] = [
      { date: '2026-11-10', total_seconds: 1800, session_count: 1, intensity: 1 },
      { date: '2026-11-11', total_seconds: 1800, session_count: 1, intensity: 1 },
      { date: '2026-11-12', total_seconds: 0, session_count: 0, intensity: 0 },
    ]

    const stats = computeStreakStats(days, '2026-11-12')
    expect(stats.currentStreak).toBe(2) // streak is alive from yesterday
  })
})
