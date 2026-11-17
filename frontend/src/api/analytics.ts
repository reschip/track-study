import { apiRequest, isTauri, tauriInvoke } from './client'
import type {
  AnalyticsCompare,
  AnalyticsPeriod,
  AnalyticsSummary,
  ContributionsData,
  DayDetail,
  OverviewData,
} from '@/types'

export const analyticsApi = {
  overview: () =>
    isTauri()
      ? tauriInvoke<OverviewData>('analytics_overview')
      : apiRequest<OverviewData>('/api/analytics/overview'),
  contributions: (params: { year?: number; activity_id?: string; project_id?: string } = {}) => {
    if (isTauri()) {
      return tauriInvoke<ContributionsData>('analytics_contributions', {
        year: params.year,
        activityId: params.activity_id,
        projectId: params.project_id,
      })
    }
    const search = new URLSearchParams()
    if (params.year) search.set('year', String(params.year))
    if (params.activity_id) search.set('activity_id', params.activity_id)
    if (params.project_id) search.set('project_id', params.project_id)
    const qs = search.toString()
    return apiRequest<ContributionsData>(`/api/analytics/contributions${qs ? `?${qs}` : ''}`)
  },
  dayDetail: (dateStr: string, params: { activity_id?: string; project_id?: string } = {}) => {
    if (isTauri()) {
      return tauriInvoke<DayDetail>('analytics_day_detail', {
        date: dateStr,
        activityId: params.activity_id,
        projectId: params.project_id,
      })
    }
    const search = new URLSearchParams()
    if (params.activity_id) search.set('activity_id', params.activity_id)
    if (params.project_id) search.set('project_id', params.project_id)
    const qs = search.toString()
    return apiRequest<DayDetail>(`/api/analytics/day/${dateStr}${qs ? `?${qs}` : ''}`)
  },
  summary: (params: {
    period: AnalyticsPeriod
    start_date?: string
    end_date?: string
    activity_id?: string
    project_id?: string
  }) => {
    if (isTauri()) {
      return tauriInvoke<AnalyticsSummary>('analytics_summary', {
        period: params.period,
        startDate: params.start_date,
        endDate: params.end_date,
        activityId: params.activity_id,
        projectId: params.project_id,
      })
    }
    const search = new URLSearchParams()
    search.set('period', params.period)
    if (params.start_date) search.set('start_date', params.start_date)
    if (params.end_date) search.set('end_date', params.end_date)
    if (params.activity_id) search.set('activity_id', params.activity_id)
    if (params.project_id) search.set('project_id', params.project_id)
    return apiRequest<AnalyticsSummary>(`/api/analytics/summary?${search.toString()}`)
  },
  compare: (params: {
    activity_ids: string[]
    period: AnalyticsPeriod
    start_date?: string
    end_date?: string
  }) => {
    if (isTauri()) {
      return tauriInvoke<AnalyticsCompare>('analytics_compare', {
        activityIds: params.activity_ids,
        period: params.period,
        startDate: params.start_date,
        endDate: params.end_date,
      })
    }
    const search = new URLSearchParams()
    params.activity_ids.forEach((id) => search.append('activity_ids', id))
    search.set('period', params.period)
    if (params.start_date) search.set('start_date', params.start_date)
    if (params.end_date) search.set('end_date', params.end_date)
    return apiRequest<AnalyticsCompare>(`/api/analytics/compare?${search.toString()}`)
  },
}
