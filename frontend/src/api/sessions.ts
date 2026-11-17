import { apiRequest, isTauri, tauriInvoke } from './client'
import type { SessionList, SessionRecord, TrackingMethod } from '@/types'

export interface ManualSessionPayload {
  activity_id: string
  project_id?: string | null
  started_at: string
  ended_at?: string | null
  duration_seconds?: number | null
  description?: string | null
}

export interface SessionUpdatePayload {
  activity_id?: string
  project_id?: string | null
  clear_project?: boolean
  started_at?: string
  ended_at?: string
  duration_seconds?: number
  description?: string | null
}

export interface SessionListParams {
  activity_id?: string
  project_id?: string
  start_date?: string
  end_date?: string
  tracking_method?: TrackingMethod
  search?: string
  sort?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export const sessionsApi = {
  list: (params: SessionListParams = {}) => {
    if (isTauri()) {
      return tauriInvoke<SessionList>('list_sessions', { params })
    }
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== '') {
        search.set(key, String(val))
      }
    })
    const qs = search.toString()
    return apiRequest<SessionList>(`/api/sessions${qs ? `?${qs}` : ''}`)
  },
  create: (payload: ManualSessionPayload) =>
    isTauri()
      ? tauriInvoke<SessionRecord>('create_manual_session', { payload })
      : apiRequest<SessionRecord>('/api/sessions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  update: (id: string, payload: SessionUpdatePayload) =>
    isTauri()
      ? tauriInvoke<SessionRecord>('update_session', { id, payload })
      : apiRequest<SessionRecord>(`/api/sessions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
  remove: (id: string) =>
    isTauri()
      ? tauriInvoke<void>('delete_session', { id })
      : apiRequest<void>(`/api/sessions/${id}`, { method: 'DELETE' }),
}
