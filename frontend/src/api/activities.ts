import { apiRequest, isTauri, tauriInvoke } from './client'
import type { Activity, ActivityCategory, ActivityStats } from '@/types'

export interface ActivityCreatePayload {
  name: string
  description?: string | null
  color: string
  category: ActivityCategory
}

export interface ActivityUpdatePayload {
  name?: string
  description?: string | null
  color?: string
  category?: ActivityCategory
  is_archived?: boolean
}

export const activitiesApi = {
  list: (params?: { include_archived?: boolean; category?: ActivityCategory }) => {
    if (isTauri()) {
      return tauriInvoke<Activity[]>('list_activities', {
        includeArchived: params?.include_archived,
        category: params?.category,
      })
    }
    const search = new URLSearchParams()
    if (params?.include_archived !== undefined) {
      search.set('include_archived', String(params.include_archived))
    }
    if (params?.category) {
      search.set('category', params.category)
    }
    const qs = search.toString()
    return apiRequest<Activity[]>(`/api/activities${qs ? `?${qs}` : ''}`)
  },
  create: (payload: ActivityCreatePayload) =>
    isTauri()
      ? tauriInvoke<Activity>('create_activity', { payload })
      : apiRequest<Activity>('/api/activities', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  getStats: (id: string, days = 30) =>
    isTauri()
      ? tauriInvoke<ActivityStats>('get_activity_stats', { id, days })
      : apiRequest<ActivityStats>(`/api/activities/${id}?days=${days}`),
  update: (id: string, payload: ActivityUpdatePayload) =>
    isTauri()
      ? tauriInvoke<Activity>('update_activity', { id, payload })
      : apiRequest<Activity>(`/api/activities/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
  archive: (id: string) =>
    isTauri()
      ? tauriInvoke<Activity>('archive_activity', { id })
      : apiRequest<Activity>(`/api/activities/${id}/archive`, { method: 'POST' }),
  restore: (id: string) =>
    isTauri()
      ? tauriInvoke<Activity>('restore_activity', { id })
      : apiRequest<Activity>(`/api/activities/${id}/restore`, { method: 'POST' }),
  remove: (id: string) =>
    isTauri()
      ? tauriInvoke<void>('delete_activity', { id })
      : apiRequest<void>(`/api/activities/${id}`, { method: 'DELETE' }),
}
