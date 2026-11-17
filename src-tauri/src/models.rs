use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackingPreferences {
    pub confirm_switch: bool,
    pub default_manual_mode: String,
    pub default_activity_id: Option<String>,
    pub default_project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserOut {
    pub id: String,
    pub email: String,
    pub name: String,
    pub timezone: String,
    pub week_start_day: String,
    pub theme: String,
    pub intensity_thresholds: [i64; 3],
    pub tracking_preferences: TrackingPreferences,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct UserUpdate {
    pub email: Option<String>,
    pub name: Option<String>,
    pub timezone: Option<String>,
    pub week_start_day: Option<String>,
    pub theme: Option<String>,
    pub intensity_thresholds: Option<[i64; 3]>,
    pub tracking_preferences: Option<TrackingPreferences>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityBrief {
    pub id: String,
    pub name: String,
    pub color: String,
    pub category: String,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectBrief {
    pub id: String,
    pub name: String,
    pub color: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub category: String,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub total_seconds: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivityCreate {
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    #[serde(default = "default_category")]
    pub category: String,
}

fn default_category() -> String {
    "professional".to_string()
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ActivityUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub category: Option<String>,
    pub is_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailySeriesPoint {
    pub date: String,
    pub total_seconds: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionItem {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
    pub total_seconds: i64,
    pub percentage: f64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityStatsOut {
    pub activity: ActivityOut,
    pub total_seconds: i64,
    pub session_count: i64,
    pub average_session_seconds: i64,
    pub last_tracked_at: Option<String>,
    pub projects: Vec<ProjectBrief>,
    pub daily_series: Vec<DailySeriesPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub activities: Vec<ActivityBrief>,
    pub total_seconds: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectCreate {
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub start_date: String,
    pub end_date: Option<String>,
    #[serde(default = "default_project_status")]
    pub status: String,
    #[serde(default)]
    pub activity_ids: Vec<String>,
}

fn default_project_status() -> String {
    "active".to_string()
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ProjectUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    #[serde(default)]
    pub clear_end_date: bool,
    pub status: Option<String>,
    pub activity_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStatsOut {
    pub project: ProjectOut,
    pub total_seconds: i64,
    pub session_count: i64,
    pub average_session_seconds: i64,
    pub daily_activity: Vec<DailySeriesPoint>,
    pub activity_distribution: Vec<DistributionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSegmentOut {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerSessionOut {
    pub id: String,
    pub activity_id: String,
    pub activity: ActivityBrief,
    pub project_id: Option<String>,
    pub project: Option<ProjectBrief>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub accumulated_seconds: i64,
    pub current_segment_started_at: Option<String>,
    pub status: String,
    pub description: Option<String>,
    pub tracking_method: String,
    pub segments: Vec<TimeSegmentOut>,
    pub server_now: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerCurrentOut {
    pub active_session: Option<TrackerSessionOut>,
    pub server_now: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TrackerStartRequest {
    pub activity_id: String,
    pub project_id: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub confirm_switch: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct TrackerPatchRequest {
    pub project_id: Option<String>,
    #[serde(default)]
    pub clear_project: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct TrackerStopRequest {
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionOut {
    pub id: String,
    pub activity_id: String,
    pub activity: ActivityBrief,
    pub project_id: Option<String>,
    pub project: Option<ProjectBrief>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
    pub description: Option<String>,
    pub tracking_method: String,
    pub status: String,
    pub segments: Vec<TimeSegmentOut>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionListOut {
    pub items: Vec<SessionOut>,
    pub total: i64,
    pub total_seconds: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManualSessionCreate {
    pub activity_id: String,
    pub project_id: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SessionUpdate {
    pub activity_id: Option<String>,
    pub project_id: Option<String>,
    #[serde(default)]
    pub clear_project: bool,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SessionListParams {
    pub activity_id: Option<String>,
    pub project_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub tracking_method: Option<String>,
    pub search: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodaySummary {
    pub date: String,
    pub total_seconds: i64,
    pub session_count: i64,
    pub activity_count: i64,
    pub project_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverviewOut {
    pub today: TodaySummary,
    pub activity_distribution: Vec<DistributionItem>,
    pub recent_sessions: Vec<SessionOut>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionDay {
    pub date: String,
    pub total_seconds: i64,
    pub session_count: i64,
    pub intensity: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionSummary {
    pub total_seconds: i64,
    pub active_days: i64,
    pub total_sessions: i64,
    pub avg_seconds_per_active_day: i64,
    pub most_tracked_activity: Option<ActivityBrief>,
    pub most_tracked_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionsOut {
    pub year: i32,
    pub start_date: String,
    pub end_date: String,
    pub thresholds: [i64; 3],
    pub days: Vec<ContributionDay>,
    pub summary: ContributionSummary,
    pub previous_year_summary: Option<ContributionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaySessionSlice {
    pub session_id: String,
    pub activity: ActivityBrief,
    pub project: Option<ProjectBrief>,
    pub session_started_at: String,
    pub session_ended_at: String,
    pub session_duration_seconds: i64,
    pub slice_started_at: String,
    pub slice_ended_at: String,
    pub slice_seconds: i64,
    pub description: Option<String>,
    pub tracking_method: String,
    pub crosses_midnight: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayDetailOut {
    pub date: String,
    pub total_seconds: i64,
    pub session_count: i64,
    pub activity_distribution: Vec<DistributionItem>,
    pub sessions: Vec<DaySessionSlice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekdayPoint {
    pub weekday_index: usize,
    pub label: String,
    pub total_seconds: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HourlyPoint {
    pub hour: usize,
    pub label: String,
    pub total_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequentActivityPoint {
    pub activity: ActivityBrief,
    pub session_count: i64,
    pub total_seconds: i64,
    pub average_session_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DescriptivePatterns {
    pub hourly_distribution: Vec<HourlyPoint>,
    pub peak_hours: Vec<usize>,
    pub highest_volume_weekdays: Vec<String>,
    pub average_session_seconds: i64,
    pub most_frequent_activities: Vec<FrequentActivityPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSummaryOut {
    pub period: String,
    pub start_date: String,
    pub end_date: String,
    pub total_seconds: i64,
    pub total_sessions: i64,
    pub active_days: i64,
    pub average_session_seconds: i64,
    pub average_daily_seconds: i64,
    pub activity_distribution: Vec<DistributionItem>,
    pub daily_activity: Vec<DailySeriesPoint>,
    pub weekly_overview: Vec<WeekdayPoint>,
    pub project_distribution: Vec<DistributionItem>,
    pub patterns: DescriptivePatterns,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityComparisonSeries {
    pub activity: ActivityBrief,
    pub total_seconds: i64,
    pub session_count: i64,
    pub daily: Vec<DailySeriesPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsCompareOut {
    pub start_date: String,
    pub end_date: String,
    pub series: Vec<ActivityComparisonSeries>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResultOut {
    pub activities_created: i64,
    pub projects_created: i64,
    pub sessions_created: i64,
    pub sessions_skipped: i64,
    pub errors: Vec<String>,
}
