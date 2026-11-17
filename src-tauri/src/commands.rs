use tauri::{AppHandle, Emitter, State};

use crate::error::AppResult;
use crate::models::{
    ActivityCreate, ActivityOut, ActivityStatsOut, ActivityUpdate, AnalyticsCompareOut,
    AnalyticsSummaryOut, ContributionsOut, DayDetailOut, ImportResultOut, ManualSessionCreate,
    OverviewOut, ProjectCreate, ProjectOut, ProjectStatsOut, ProjectUpdate, SessionListOut,
    SessionListParams, SessionOut, SessionUpdate, TrackerCurrentOut, TrackerPatchRequest,
    TrackerSessionOut, TrackerStartRequest, TrackerStopRequest, UserOut, UserUpdate,
};
use crate::services::{
    activity_service, analytics_service, portability_service, project_service, session_service,
    tracker_service, user_service,
};
use crate::AppState;

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_user(state: State<'_, AppState>) -> AppResult<UserOut> {
    user_service::get_default_user(&state.pool).await
}

#[tauri::command]
pub async fn update_user(state: State<'_, AppState>, payload: UserUpdate) -> AppResult<UserOut> {
    user_service::update_user(&state.pool, payload).await
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_activities(
    state: State<'_, AppState>,
    include_archived: Option<bool>,
    category: Option<String>,
) -> AppResult<Vec<ActivityOut>> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::list_activities(
        &state.pool,
        &user,
        include_archived.unwrap_or(false),
        category.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn create_activity(
    state: State<'_, AppState>,
    payload: ActivityCreate,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::create_activity(&state.pool, &user, payload).await
}

#[tauri::command]
pub async fn get_activity_stats(
    state: State<'_, AppState>,
    id: String,
    days: Option<i64>,
) -> AppResult<ActivityStatsOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::get_activity_stats(&state.pool, &user, &id, days.unwrap_or(30)).await
}

#[tauri::command]
pub async fn update_activity(
    state: State<'_, AppState>,
    id: String,
    payload: ActivityUpdate,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::update_activity(&state.pool, &user, &id, payload).await
}

#[tauri::command]
pub async fn archive_activity(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::archive_activity(&state.pool, &user, &id, true).await
}

#[tauri::command]
pub async fn restore_activity(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::archive_activity(&state.pool, &user, &id, false).await
}

#[tauri::command]
pub async fn delete_activity(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::delete_activity(&state.pool, &user, &id).await
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
    status: Option<String>,
) -> AppResult<Vec<ProjectOut>> {
    let user = user_service::get_default_user(&state.pool).await?;
    project_service::list_projects(&state.pool, &user, status.as_deref()).await
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    payload: ProjectCreate,
) -> AppResult<ProjectOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    project_service::create_project(&state.pool, &user, payload).await
}

#[tauri::command]
pub async fn get_project_stats(
    state: State<'_, AppState>,
    id: String,
    days: Option<i64>,
) -> AppResult<ProjectStatsOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    project_service::get_project_stats(&state.pool, &user, &id, days.unwrap_or(30)).await
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    payload: ProjectUpdate,
) -> AppResult<ProjectOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    project_service::update_project(&state.pool, &user, &id, payload).await
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let user = user_service::get_default_user(&state.pool).await?;
    project_service::delete_project(&state.pool, &user, &id).await
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn tracker_current(state: State<'_, AppState>) -> AppResult<TrackerCurrentOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    tracker_service::get_current_timer(&state.pool, &user).await
}

#[tauri::command]
pub async fn tracker_start(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: TrackerStartRequest,
) -> AppResult<TrackerSessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = tracker_service::start_timer(&state.pool, &user, payload).await?;
    let _ = app.emit("timer-changed", ());
    crate::tray::refresh_tray(&app);
    Ok(res)
}

#[tauri::command]
pub async fn tracker_pause(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<TrackerSessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = tracker_service::pause_timer(&state.pool, &user).await?;
    let _ = app.emit("timer-changed", ());
    crate::tray::refresh_tray(&app);
    Ok(res)
}

#[tauri::command]
pub async fn tracker_resume(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<TrackerSessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = tracker_service::resume_timer(&state.pool, &user).await?;
    let _ = app.emit("timer-changed", ());
    crate::tray::refresh_tray(&app);
    Ok(res)
}

#[tauri::command]
pub async fn tracker_stop(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: Option<TrackerStopRequest>,
) -> AppResult<SessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = tracker_service::stop_timer(&state.pool, &user, payload).await?;
    let _ = app.emit("timer-changed", ());
    crate::tray::refresh_tray(&app);
    Ok(res)
}

#[tauri::command]
pub async fn tracker_patch(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: TrackerPatchRequest,
) -> AppResult<TrackerSessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = tracker_service::update_current_metadata(&state.pool, &user, payload).await?;
    let _ = app.emit("timer-changed", ());
    crate::tray::refresh_tray(&app);
    Ok(res)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    params: Option<SessionListParams>,
) -> AppResult<SessionListOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    session_service::list_sessions(&state.pool, &user, params.unwrap_or_default()).await
}

#[tauri::command]
pub async fn create_manual_session(
    state: State<'_, AppState>,
    payload: ManualSessionCreate,
) -> AppResult<SessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    session_service::create_manual_session(&state.pool, &user, payload).await
}

#[tauri::command]
pub async fn update_session(
    state: State<'_, AppState>,
    id: String,
    payload: SessionUpdate,
) -> AppResult<SessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    session_service::update_session(&state.pool, &user, &id, payload).await
}

#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let user = user_service::get_default_user(&state.pool).await?;
    session_service::delete_session(&state.pool, &user, &id).await
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn analytics_overview(state: State<'_, AppState>) -> AppResult<OverviewOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    analytics_service::get_overview(&state.pool, &user).await
}

#[tauri::command]
pub async fn analytics_contributions(
    state: State<'_, AppState>,
    year: Option<i32>,
    activity_id: Option<String>,
    project_id: Option<String>,
) -> AppResult<ContributionsOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    analytics_service::get_contributions(
        &state.pool,
        &user,
        year,
        activity_id.as_deref(),
        project_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn analytics_day_detail(
    state: State<'_, AppState>,
    date: String,
    activity_id: Option<String>,
    project_id: Option<String>,
) -> AppResult<DayDetailOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    analytics_service::get_day_detail(
        &state.pool,
        &user,
        &date,
        activity_id.as_deref(),
        project_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn analytics_summary(
    state: State<'_, AppState>,
    period: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    activity_id: Option<String>,
    project_id: Option<String>,
) -> AppResult<AnalyticsSummaryOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    analytics_service::get_analytics_summary(
        &state.pool,
        &user,
        period.as_deref().unwrap_or("last_30_days"),
        start_date.as_deref(),
        end_date.as_deref(),
        activity_id.as_deref(),
        project_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn analytics_compare(
    state: State<'_, AppState>,
    activity_ids: Vec<String>,
    period: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> AppResult<AnalyticsCompareOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    analytics_service::get_activity_comparison(
        &state.pool,
        &user,
        &activity_ids,
        period.as_deref().unwrap_or("last_30_days"),
        start_date.as_deref(),
        end_date.as_deref(),
    )
    .await
}

// ---------------------------------------------------------------------------
// Portability
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn export_data(state: State<'_, AppState>, format: String) -> AppResult<String> {
    let user = user_service::get_default_user(&state.pool).await?;
    if format.eq_ignore_ascii_case("csv") {
        portability_service::build_export_csv(&state.pool, &user).await
    } else {
        portability_service::build_export_json(&state.pool, &user).await
    }
}

#[tauri::command]
pub async fn import_data(
    state: State<'_, AppState>,
    filename: String,
    content: String,
) -> AppResult<ImportResultOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    portability_service::import_content(&state.pool, &user, &filename, &content).await
}
