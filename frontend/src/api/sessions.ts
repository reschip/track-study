import { tauriInvoke } from './client'
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
  list: (params: SessionListParams = {}) => tauriInvoke<SessionList>('list_sessions', { params }),
  create: (payload: ManualSessionPayload) =>
    tauriInvoke<SessionRecord>('create_manual_session', { payload }),
  update: (id: string, payload: SessionUpdatePayload) =>
    tauriInvoke<SessionRecord>('update_session', { id, payload }),
  remove: (id: string) => tauriInvoke<void>('delete_session', { id }),
}
