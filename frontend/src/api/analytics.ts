import { tauriInvoke } from './client'
import type {
  AnalyticsCompare,
  AnalyticsPeriod,
  AnalyticsSummary,
  ContributionsData,
  DayDetail,
  OverviewData,
} from '@/types'

export const analyticsApi = {
  overview: () => tauriInvoke<OverviewData>('analytics_overview'),
  contributions: (params: { year?: number; activity_id?: string; project_id?: string } = {}) =>
    tauriInvoke<ContributionsData>('analytics_contributions', {
      year: params.year,
      activityId: params.activity_id,
      projectId: params.project_id,
    }),
  dayDetail: (dateStr: string, params: { activity_id?: string; project_id?: string } = {}) =>
    tauriInvoke<DayDetail>('analytics_day_detail', {
      date: dateStr,
      activityId: params.activity_id,
      projectId: params.project_id,
    }),
  summary: (params: {
    period: AnalyticsPeriod
    start_date?: string
    end_date?: string
    activity_id?: string
    project_id?: string
  }) =>
    tauriInvoke<AnalyticsSummary>('analytics_summary', {
      period: params.period,
      startDate: params.start_date,
      endDate: params.end_date,
      activityId: params.activity_id,
      projectId: params.project_id,
    }),
  compare: (params: {
    activity_ids: string[]
    period: AnalyticsPeriod
    start_date?: string
    end_date?: string
  }) =>
    tauriInvoke<AnalyticsCompare>('analytics_compare', {
      activityIds: params.activity_ids,
      period: params.period,
      startDate: params.start_date,
      endDate: params.end_date,
    }),
}
