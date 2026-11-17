import { tauriInvoke } from './client'
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
  list: (status?: ProjectStatus) => tauriInvoke<Project[]>('list_projects', { status }),
  create: (payload: ProjectCreatePayload) => tauriInvoke<Project>('create_project', { payload }),
  getStats: (id: string, days = 30) => tauriInvoke<ProjectStats>('get_project_stats', { id, days }),
  update: (id: string, payload: ProjectUpdatePayload) =>
    tauriInvoke<Project>('update_project', { id, payload }),
  remove: (id: string) => tauriInvoke<void>('delete_project', { id }),
}
