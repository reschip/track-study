pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod services;
pub mod time_utils;
pub mod tray;
pub mod windows;

use sqlx::SqlitePool;
use tauri::{Manager, WindowEvent};

pub struct AppState {
    pub pool: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
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
            windows::init_auxiliary_windows(app)?;
            tray::init_tray(app)?;
            tray::refresh_widget_menu_label(app.handle());

            if std::env::args().any(|arg| arg == "--autostart")
                && let Some(win) = app.get_webview_window(windows::MAIN_WINDOW_LABEL)
            {
                let _ = win.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == windows::MAIN_WINDOW_LABEL
                && let WindowEvent::CloseRequested { api, .. } = event
            {
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
            commands::export_data_to_file,
            commands::import_data,
            commands::open_main_window,
            commands::hide_popover_window,
            commands::toggle_widget_window,
            commands::set_widget_visible,
            commands::get_widget_state,
            commands::set_widget_always_on_top,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                windows::open_main(app_handle);
            }
        });
}
