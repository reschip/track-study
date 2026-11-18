use std::time::Duration;

use chrono::Utc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::services::{tracker_service, user_service};
use crate::time_utils::parse_utc;
use crate::AppState;

const TRAY_ID: &str = "main-tray";

struct TrayMenuState<R: Runtime> {
    widget_item: MenuItem<R>,
    toggle_item: MenuItem<R>,
    stop_item: MenuItem<R>,
}

fn format_mm_ss(total_secs: i64) -> String {
    let s = total_secs.max(0);
    let hours = s / 3600;
    let mins = (s % 3600) / 60;
    let secs = s % 60;
    if hours > 0 {
        format!("{hours}:{mins:02}:{secs:02}")
    } else {
        format!("{mins:02}:{secs:02}")
    }
}

pub fn init_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Activity", true, None::<&str>)?;
    let widget_item =
        MenuItem::with_id(app, "widget", "Show Desktop Widget", true, None::<&str>)?;
    let sep_top = PredefinedMenuItem::separator(app)?;
    let toggle_item = MenuItem::with_id(app, "toggle", "No Active Timer", false, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "Stop Timer", false, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Activity", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &widget_item,
            &sep_top,
            &toggle_item,
            &stop_item,
            &sep,
            &quit_item,
        ],
    )?;

    app.manage(TrayMenuState {
        widget_item: widget_item.clone(),
        toggle_item: toggle_item.clone(),
        stop_item: stop_item.clone(),
    });

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Activity — Click to open quick control, right-click for menu")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                crate::windows::toggle_popover_at(tray.app_handle(), Some(rect));
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                crate::windows::open_main(app);
            }
            "widget" => {
                crate::windows::toggle_widget(app);
            }
            "toggle" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    if let Ok(user) = user_service::get_default_user(&state.pool).await
                        && let Ok(curr) = tracker_service::get_current_timer(&state.pool, &user).await
                            && let Some(sess) = curr.active_session {
                                if sess.status == "active" {
                                    let _ = tracker_service::pause_timer(&state.pool, &user).await;
                                } else {
                                    let _ = tracker_service::resume_timer(&state.pool, &user).await;
                                }
                                let _ = handle.emit("timer-changed", ());
                                update_tray_now(&handle).await;
                            }
                });
            }
            "stop" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    if let Ok(user) = user_service::get_default_user(&state.pool).await {
                        let _ = tracker_service::stop_timer(&state.pool, &user, None).await;
                        let _ = handle.emit("timer-changed", ());
                        update_tray_now(&handle).await;
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        });

    let tray_icon = tauri::include_image!("icons/tray-icon.png");
    builder = builder.icon(tray_icon).icon_as_template(true);

    builder.build(app)?;

    // Start 1-second background ticker to keep macOS menu bar timer live
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            update_tray_now(&handle).await;
        }
    });

    Ok(())
}

pub fn refresh_tray<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        update_tray_now(&handle).await;
    });
}

pub fn refresh_widget_menu_label<R: Runtime>(app: &AppHandle<R>) {
    let state = crate::windows::get_widget_state(app);
    let menu_state = app.state::<TrayMenuState<R>>();
    let label = if state.visible {
        "Hide Desktop Widget"
    } else {
        "Show Desktop Widget"
    };
    let _ = menu_state.widget_item.set_text(label);
}

async fn update_tray_now<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let state = app.state::<AppState>();
    let menu_state = app.state::<TrayMenuState<R>>();

    let Ok(user) = user_service::get_default_user(&state.pool).await else {
        return;
    };
    let Ok(curr) = tracker_service::get_current_timer(&state.pool, &user).await else {
        return;
    };

    match curr.active_session {
        Some(sess) => {
            let mut total = sess.accumulated_seconds;
            if sess.status == "active"
                && let Some(seg_start_str) = sess.current_segment_started_at.as_deref()
                    && let Ok(seg_start) = parse_utc(seg_start_str) {
                        let delta = (Utc::now() - seg_start).num_seconds().max(0);
                        total += delta;
                    }
            let clock = format_mm_ss(total);
            let prefix = if sess.status == "active" { "●" } else { "⏸" };
            let title = format!(" {prefix} {} · {clock}", sess.activity.name);
            let _ = tray.set_title(Some(&title));

            let toggle_label = if sess.status == "active" {
                format!("Pause {}", sess.activity.name)
            } else {
                format!("Resume {}", sess.activity.name)
            };
            let _ = menu_state.toggle_item.set_text(&toggle_label);
            let _ = menu_state.toggle_item.set_enabled(true);
            let _ = menu_state.stop_item.set_enabled(true);
        }
        None => {
            let _ = tray.set_title(None::<&str>);
            let _ = menu_state.toggle_item.set_text("No Active Timer");
            let _ = menu_state.toggle_item.set_enabled(false);
            let _ = menu_state.stop_item.set_enabled(false);
        }
    }
}
