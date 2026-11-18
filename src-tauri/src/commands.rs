use tauri::{AppHandle, Emitter, State};

use crate::error::AppResult;
use crate::models::{
    ActivityCreate, ActivityOut, ActivityStatsOut, ActivityUpdate, AnalyticsCompareOut,
    AnalyticsSummaryOut, ContributionsOut, DayDetailOut, ImportResultOut, ManualSessionCreate,
    OverviewOut, ProjectCreate, ProjectOut, ProjectStatsOut, ProjectUpdate, SessionListOut,
    SessionListParams, SessionOut, SessionUpdate, TrackerCurrentOut, TrackerPatchRequest,
    TrackerSessionOut, TrackerStartRequest, TrackerStopRequest, UserOut, UserUpdate,
    WidgetStateOut,
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
pub async fn update_user(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: UserUpdate,
) -> AppResult<UserOut> {
    let res = user_service::update_user(&state.pool, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
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
    app: AppHandle,
    state: State<'_, AppState>,
    payload: ActivityCreate,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = activity_service::create_activity(&state.pool, &user, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
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
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: ActivityUpdate,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = activity_service::update_activity(&state.pool, &user, &id, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

#[tauri::command]
pub async fn archive_activity(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = activity_service::archive_activity(&state.pool, &user, &id, true).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

#[tauri::command]
pub async fn restore_activity(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ActivityOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = activity_service::archive_activity(&state.pool, &user, &id, false).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

#[tauri::command]
pub async fn delete_activity(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let user = user_service::get_default_user(&state.pool).await?;
    activity_service::delete_activity(&state.pool, &user, &id).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
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
    app: AppHandle,
    state: State<'_, AppState>,
    payload: ProjectCreate,
) -> AppResult<ProjectOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = project_service::create_project(&state.pool, &user, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
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
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: ProjectUpdate,
) -> AppResult<ProjectOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = project_service::update_project(&state.pool, &user, &id, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

#[tauri::command]
pub async fn delete_project(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let user = user_service::get_default_user(&state.pool).await?;
    project_service::delete_project(&state.pool, &user, &id).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
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
    app: AppHandle,
    state: State<'_, AppState>,
    payload: ManualSessionCreate,
) -> AppResult<SessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = session_service::create_manual_session(&state.pool, &user, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

#[tauri::command]
pub async fn update_session(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    payload: SessionUpdate,
) -> AppResult<SessionOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = session_service::update_session(&state.pool, &user, &id, payload).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

#[tauri::command]
pub async fn delete_session(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let user = user_service::get_default_user(&state.pool).await?;
    session_service::delete_session(&state.pool, &user, &id).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
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
pub async fn export_data_to_file(
    app: AppHandle,
    state: State<'_, AppState>,
    format: String,
) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    let user = user_service::get_default_user(&state.pool).await?;
    let is_csv = format.eq_ignore_ascii_case("csv");
    let content = if is_csv {
        portability_service::build_export_csv(&state.pool, &user).await?
    } else {
        portability_service::build_export_json(&state.pool, &user).await?
    };

    let ext = if is_csv { "csv" } else { "json" };
    let default_name = format!("activity-export.{ext}");
    let filter_name = if is_csv { "CSV" } else { "JSON" };

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Export Activity Data")
        .set_file_name(&default_name)
        .add_filter(filter_name, &[ext])
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let Some(file_path) = rx.await.ok().flatten() else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|e| crate::error::AppError::internal(format!("Invalid export path: {e}")))?;
    std::fs::write(&path, content)
        .map_err(|e| crate::error::AppError::internal(format!("Failed to write export file: {e}")))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    state: State<'_, AppState>,
    filename: String,
    content: String,
) -> AppResult<ImportResultOut> {
    let user = user_service::get_default_user(&state.pool).await?;
    let res = portability_service::import_content(&state.pool, &user, &filename, &content).await?;
    let _ = app.emit("workspace-changed", ());
    Ok(res)
}

// ---------------------------------------------------------------------------
// Auxiliary Windows (Popover & Desktop Widget)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn open_main_window(app: AppHandle) {
    crate::windows::open_main(&app);
}

#[tauri::command]
pub fn hide_popover_window(app: AppHandle) {
    crate::windows::hide_popover(&app);
}

#[tauri::command]
pub fn toggle_widget_window(app: AppHandle) -> WidgetStateOut {
    crate::windows::toggle_widget(&app)
}

#[tauri::command]
pub fn set_widget_visible(app: AppHandle, visible: bool) -> WidgetStateOut {
    crate::windows::set_widget_visible(&app, visible)
}

#[tauri::command]
pub fn get_widget_state(app: AppHandle) -> WidgetStateOut {
    crate::windows::get_widget_state(&app)
}

#[tauri::command]
pub fn set_widget_always_on_top(app: AppHandle, always_on_top: bool) -> WidgetStateOut {
    crate::windows::set_widget_always_on_top(&app, always_on_top)
}

#[tauri::command]
pub fn get_autostart_enabled(app: AppHandle) -> AppResult<bool> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| crate::error::AppError::internal(format!("Failed to read autostart state: {e}")))
}

#[tauri::command]
pub fn set_autostart_enabled(app: AppHandle, enabled: bool) -> AppResult<bool> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    if enabled {
        mgr.enable()
            .map_err(|e| crate::error::AppError::internal(format!("Failed to enable autostart: {e}")))?;
    } else {
        mgr.disable()
            .map_err(|e| crate::error::AppError::internal(format!("Failed to disable autostart: {e}")))?;
    }
    mgr.is_enabled()
        .map_err(|e| crate::error::AppError::internal(format!("Failed to read autostart state: {e}")))
}
