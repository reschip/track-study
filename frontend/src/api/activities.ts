import { tauriInvoke } from './client'
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
  list: (params?: { include_archived?: boolean; category?: ActivityCategory }) =>
    tauriInvoke<Activity[]>('list_activities', {
      includeArchived: params?.include_archived,
      category: params?.category,
    }),
  create: (payload: ActivityCreatePayload) => tauriInvoke<Activity>('create_activity', { payload }),
  getStats: (id: string, days = 30) => tauriInvoke<ActivityStats>('get_activity_stats', { id, days }),
  update: (id: string, payload: ActivityUpdatePayload) =>
    tauriInvoke<Activity>('update_activity', { id, payload }),
  archive: (id: string) => tauriInvoke<Activity>('archive_activity', { id }),
  restore: (id: string) => tauriInvoke<Activity>('restore_activity', { id }),
  remove: (id: string) => tauriInvoke<void>('delete_activity', { id }),
}
