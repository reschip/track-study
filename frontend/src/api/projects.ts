import { apiRequest, isTauri, tauriInvoke } from './client'
import type { Project, ProjectStats, ProjectStatus } from '@/types'

export interface ProjectCreatePayload {
  name: string
  description?: string | null
  color: string
  start_date: string
  end_date?: string | null
  status: ProjectStatus
  activity_ids: string[]
}

export interface ProjectUpdatePayload {
  name?: string
  description?: string | null
  color?: string
  start_date?: string
  end_date?: string | null
  clear_end_date?: boolean
  status?: ProjectStatus
  activity_ids?: string[]
}

export const projectsApi = {
  list: (status?: ProjectStatus) => {
    if (isTauri()) {
      return tauriInvoke<Project[]>('list_projects', { status })
    }
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return apiRequest<Project[]>(`/api/projects${qs}`)
  },
  create: (payload: ProjectCreatePayload) =>
    isTauri()
      ? tauriInvoke<Project>('create_project', { payload })
      : apiRequest<Project>('/api/projects', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  getStats: (id: string, days = 30) =>
    isTauri()
      ? tauriInvoke<ProjectStats>('get_project_stats', { id, days })
      : apiRequest<ProjectStats>(`/api/projects/${id}?days=${days}`),
  update: (id: string, payload: ProjectUpdatePayload) =>
    isTauri()
      ? tauriInvoke<Project>('update_project', { id, payload })
      : apiRequest<Project>(`/api/projects/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
  remove: (id: string) =>
    isTauri()
      ? tauriInvoke<void>('delete_project', { id })
      : apiRequest<void>(`/api/projects/${id}`, { method: 'DELETE' }),
}
