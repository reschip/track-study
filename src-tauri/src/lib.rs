pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod services;
pub mod time_utils;
pub mod tray;

use sqlx::SqlitePool;
use tauri::{Manager, WindowEvent};

pub struct AppState {
    pub pool: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db_path = data_dir.join("activity.db");

            let pool = tauri::async_runtime::block_on(async {
                let pool = db::init_pool_at_path(&db_path).await?;
                db::seed_catalog_if_empty(&pool).await?;
                Ok::<SqlitePool, error::AppError>(pool)
            })
            .expect("failed to initialize SQLite database");

            app.manage(AppState { pool });
            tray::init_tray(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_user,
            commands::update_user,
            commands::list_activities,
            commands::create_activity,
            commands::get_activity_stats,
            commands::update_activity,
            commands::archive_activity,
            commands::restore_activity,
            commands::delete_activity,
            commands::list_projects,
            commands::create_project,
            commands::get_project_stats,
            commands::update_project,
            commands::delete_project,
            commands::tracker_current,
            commands::tracker_start,
            commands::tracker_pause,
            commands::tracker_resume,
            commands::tracker_stop,
            commands::tracker_patch,
            commands::list_sessions,
            commands::create_manual_session,
            commands::update_session,
            commands::delete_session,
            commands::analytics_overview,
            commands::analytics_contributions,
            commands::analytics_day_detail,
            commands::analytics_summary,
            commands::analytics_compare,
            commands::export_data,
            commands::import_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
