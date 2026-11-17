import { apiRequest, isTauri, tauriInvoke } from './client'
import type { SessionRecord, TrackerSession } from '@/types'

export interface TrackerStartPayload {
  activity_id: string
  project_id?: string | null
  description?: string | null
  confirm_switch?: boolean
}

export interface TrackerUpdateMetaPayload {
  project_id?: string | null
  clear_project?: boolean
  description?: string | null
}

export const trackerApi = {
  getCurrent: () =>
    isTauri()
      ? tauriInvoke<{ active_session: TrackerSession | null }>('tracker_current')
      : apiRequest<{ active_session: TrackerSession | null }>('/api/tracker/current'),
  start: (payload: TrackerStartPayload) =>
    isTauri()
      ? tauriInvoke<TrackerSession>('tracker_start', { payload })
      : apiRequest<TrackerSession>('/api/tracker/start', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  pause: () =>
    isTauri()
      ? tauriInvoke<TrackerSession>('tracker_pause')
      : apiRequest<TrackerSession>('/api/tracker/pause', { method: 'POST' }),
  resume: () =>
    isTauri()
      ? tauriInvoke<TrackerSession>('tracker_resume')
      : apiRequest<TrackerSession>('/api/tracker/resume', { method: 'POST' }),
  stop: (description?: string | null) =>
    isTauri()
      ? tauriInvoke<SessionRecord>('tracker_stop', {
          payload: description !== undefined ? { description } : null,
        })
      : apiRequest<SessionRecord>('/api/tracker/stop', {
          method: 'POST',
          body: JSON.stringify(description !== undefined ? { description } : {}),
        }),
  updateMeta: (payload: TrackerUpdateMetaPayload) =>
    isTauri()
      ? tauriInvoke<TrackerSession>('tracker_patch', { payload })
      : apiRequest<TrackerSession>('/api/tracker/current', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
}
