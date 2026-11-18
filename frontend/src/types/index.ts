export type ThemeMode = 'light' | 'dark'
export type WeekStartDay = 'monday' | 'sunday'
export type ActivityCategory = 'professional' | 'personal'
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived'
export type TrackingMethod = 'timer' | 'manual'
export type SessionStatus = 'active' | 'paused' | 'completed'
export type AnalyticsPeriod =
  | 'today'
  | 'this_week'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'this_year'
  | 'custom'

export type NavSection =
  | 'overview'
  | 'tracker'
  | 'activities'
  | 'projects'
  | 'calendar'
  | 'analytics'
  | 'history'
  | 'settings'

export interface TrackingPreferences {
  confirm_switch: boolean
  default_manual_mode: 'start_end' | 'duration'
  default_activity_id: string | null
  default_project_id: string | null
}

export interface User {
  id: string
  email: string
  name: string
  timezone: string
  week_start_day: WeekStartDay
  theme: ThemeMode
  intensity_thresholds: [number, number, number]
  tracking_preferences: TrackingPreferences
  created_at: string
  updated_at: string
}

export interface ActivityBrief {
  id: string
  name: string
  color: string
  category: ActivityCategory
  is_archived: boolean
}

export interface ProjectBrief {
  id: string
  name: string
  color: string
  status: ProjectStatus
}

export interface Activity {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  category: ActivityCategory
  is_archived: boolean
  created_at: string
  updated_at: string
  total_seconds: number
  session_count: number
}

export interface DailySeriesPoint {
  date: string
  total_seconds: number
  session_count: number
}

export interface DistributionItem {
  id: string | null
  name: string
  color: string
  total_seconds: number
  percentage: number
  session_count: number
}

export interface ActivityStats {
  activity: Activity
  total_seconds: number
  session_count: number
  average_session_seconds: number
  last_tracked_at: string | null
  projects: ProjectBrief[]
  daily_series: DailySeriesPoint[]
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  start_date: string
  end_date: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
  activities: ActivityBrief[]
  total_seconds: number
  session_count: number
}

export interface ProjectStats {
  project: Project
  total_seconds: number
  session_count: number
  average_session_seconds: number
  daily_activity: DailySeriesPoint[]
  activity_distribution: DistributionItem[]
}

export interface TimeSegment {
  id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
}

export interface TrackerSession {
  id: string
  activity_id: string
  activity: ActivityBrief
  project_id: string | null
  project: ProjectBrief | null
  started_at: string
  ended_at: string | null
  accumulated_seconds: number
  current_segment_started_at: string | null
  status: SessionStatus
  description: string | null
  tracking_method: TrackingMethod
  segments: TimeSegment[]
  server_now: string
}

export interface SessionRecord {
  id: string
  activity_id: string
  activity: ActivityBrief
  project_id: string | null
  project: ProjectBrief | null
  started_at: string
  ended_at: string | null
  duration_seconds: number
  description: string | null
  tracking_method: TrackingMethod
  status: SessionStatus
  segments: TimeSegment[]
  created_at: string
  updated_at: string
}

export interface SessionList {
  items: SessionRecord[]
  total: number
  total_seconds: number
}

export interface TodaySummary {
  date: string
  total_seconds: number
  session_count: number
  activity_count: number
  project_count: number
}

export interface OverviewData {
  today: TodaySummary
  activity_distribution: DistributionItem[]
  recent_sessions: SessionRecord[]
}

export interface ContributionDay {
  date: string
  total_seconds: number
  session_count: number
  intensity: 0 | 1 | 2 | 3 | 4
}

export interface ContributionSummary {
  total_seconds: number
  active_days: number
  total_sessions: number
  avg_seconds_per_active_day: number
  most_tracked_activity: ActivityBrief | null
  most_tracked_seconds: number
}

export interface ContributionsData {
  year: number
  start_date: string
  end_date: string
  thresholds: [number, number, number]
  days: ContributionDay[]
  summary: ContributionSummary
  previous_year_summary: ContributionSummary | null
}

export interface DaySessionSlice {
  session_id: string
  activity: ActivityBrief
  project: ProjectBrief | null
  session_started_at: string
  session_ended_at: string
  session_duration_seconds: number
  slice_started_at: string
  slice_ended_at: string
  slice_seconds: number
  description: string | null
  tracking_method: TrackingMethod
  crosses_midnight: boolean
}

export interface DayDetail {
  date: string
  total_seconds: number
  session_count: number
  activity_distribution: DistributionItem[]
  sessions: DaySessionSlice[]
}

export interface WeekdayPoint {
  weekday_index: number
  label: string
  total_seconds: number
  session_count: number
}

export interface HourlyPoint {
  hour: number
  label: string
  total_seconds: number
}

export interface FrequentActivityPoint {
  activity: ActivityBrief
  session_count: number
  total_seconds: number
  average_session_seconds: number
}

export interface DescriptivePatterns {
  hourly_distribution: HourlyPoint[]
  peak_hours: number[]
  highest_volume_weekdays: string[]
  average_session_seconds: number
  most_frequent_activities: FrequentActivityPoint[]
}

export interface AnalyticsSummary {
  period: string
  start_date: string
  end_date: string
  total_seconds: number
  total_sessions: number
  active_days: number
  average_session_seconds: number
  average_daily_seconds: number
  activity_distribution: DistributionItem[]
  daily_activity: DailySeriesPoint[]
  weekly_overview: WeekdayPoint[]
  project_distribution: DistributionItem[]
  patterns: DescriptivePatterns
}

export interface ActivityComparisonSeries {
  activity: ActivityBrief
  total_seconds: number
  session_count: number
  daily: DailySeriesPoint[]
}

export interface AnalyticsCompare {
  start_date: string
  end_date: string
  series: ActivityComparisonSeries[]
}

export interface ImportResult {
  activities_created: number
  projects_created: number
  sessions_created: number
  sessions_skipped: number
  errors: string[]
}

export interface WidgetState {
  visible: boolean
  always_on_top: boolean
}
