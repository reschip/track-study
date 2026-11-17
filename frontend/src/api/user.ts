import { tauriInvoke } from './client'
import type { ThemeMode, TrackingPreferences, User, WeekStartDay } from '@/types'

export interface UserUpdatePayload {
  name?: string
  email?: string
  timezone?: string
  week_start_day?: WeekStartDay
  theme?: ThemeMode
  intensity_thresholds?: [number, number, number]
  tracking_preferences?: TrackingPreferences
}

export const userApi = {
  get: () => tauriInvoke<User>('get_user'),
  update: (payload: UserUpdatePayload) => tauriInvoke<User>('update_user', { payload }),
}
