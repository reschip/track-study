import { apiRequest, isTauri, tauriInvoke } from './client'
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
  get: () => (isTauri() ? tauriInvoke<User>('get_user') : apiRequest<User>('/api/user')),
  update: (payload: UserUpdatePayload) =>
    isTauri()
      ? tauriInvoke<User>('update_user', { payload })
      : apiRequest<User>('/api/user', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
}
