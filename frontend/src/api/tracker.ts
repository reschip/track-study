import { tauriInvoke } from './client'
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
  getCurrent: () => tauriInvoke<{ active_session: TrackerSession | null }>('tracker_current'),
  start: (payload: TrackerStartPayload) => tauriInvoke<TrackerSession>('tracker_start', { payload }),
  pause: () => tauriInvoke<TrackerSession>('tracker_pause'),
  resume: () => tauriInvoke<TrackerSession>('tracker_resume'),
  stop: (description?: string | null) =>
    tauriInvoke<SessionRecord>('tracker_stop', {
      payload: description !== undefined ? { description } : null,
    }),
  updateMeta: (payload: TrackerUpdateMetaPayload) =>
    tauriInvoke<TrackerSession>('tracker_patch', { payload }),
}
