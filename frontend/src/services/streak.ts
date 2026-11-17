import type { ContributionDay } from '@/types'

export interface StreakStats {
  currentStreak: number
  longestStreak: number
  totalActiveDays: number
  totalDays: number
}

/**
 * Computes current streak and longest streak from ordered contribution days.
 * If today has not been tracked yet, but yesterday was active, the streak is considered
 * alive and maintained so the user can continue it today.
 */
export function computeStreakStats(
  days: ContributionDay[] | undefined,
  todayStr?: string,
): StreakStats {
  if (!days || days.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
      totalDays: 0,
    }
  }

  // Create quick lookup by date string
  const dayMap = new Map<string, ContributionDay>()
  let totalActiveDays = 0

  for (const day of days) {
    dayMap.set(day.date, day)
    if (day.total_seconds > 0) {
      totalActiveDays += 1
    }
  }

  // Calculate longest streak in the sequence
  let longestStreak = 0
  let run = 0

  for (const day of days) {
    if (day.total_seconds > 0) {
      run += 1
      if (run > longestStreak) {
        longestStreak = run
      }
    } else {
      run = 0
    }
  }

  // Calculate current streak relative to today (default to today's date, not the last day of the calendar year)
  const targetDateStr = todayStr ?? new Date().toISOString().slice(0, 10)
  let currentStreak = 0

  const todayDay = dayMap.get(targetDateStr)
  const isTodayActive = Boolean(todayDay && todayDay.total_seconds > 0)

  // Determine starting point for walk-back
  let checkDate: Date
  const [y, m, d] = targetDateStr.split('-').map(Number)
  const baseDate = new Date(Date.UTC(y, m - 1, d))

  if (isTodayActive) {
    currentStreak += 1
    checkDate = new Date(baseDate.getTime() - 86400000)
  } else {
    // Check if yesterday was active
    checkDate = new Date(baseDate.getTime() - 86400000)
  }

  // Walk backwards day-by-day
  while (true) {
    const iso = checkDate.toISOString().slice(0, 10)
    const entry = dayMap.get(iso)
    if (entry && entry.total_seconds > 0) {
      currentStreak += 1
      checkDate = new Date(checkDate.getTime() - 86400000)
    } else {
      break
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalActiveDays,
    totalDays: days.length,
  }
}
