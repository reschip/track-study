use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, Rect, Runtime, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};

use crate::models::WidgetStateOut;

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const POPOVER_WINDOW_LABEL: &str = "popover";
pub const WIDGET_WINDOW_LABEL: &str = "widget";

const POPOVER_WIDTH: f64 = 336.0;
const POPOVER_HEIGHT: f64 = 448.0;
const WIDGET_WIDTH: f64 = 272.0;
const WIDGET_HEIGHT: f64 = 116.0;
const WIDGET_STATE_FILE: &str = "widget_state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedWidgetState {
    visible: bool,
    always_on_top: bool,
    x: Option<f64>,
    y: Option<f64>,
}

impl Default for PersistedWidgetState {
    fn default() -> Self {
        Self {
            visible: false,
            always_on_top: true,
            x: None,
            y: None,
        }
    }
}

static LAST_POPOVER_HIDE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static WIDGET_PERSIST_STATE: OnceLock<Mutex<(PersistedWidgetState, u64, Option<PathBuf>)>> =
    OnceLock::new();

fn last_popover_hide_lock() -> &'static Mutex<Option<Instant>> {
    LAST_POPOVER_HIDE.get_or_init(|| Mutex::new(None))
}

fn widget_persist_lock() -> &'static Mutex<(PersistedWidgetState, u64, Option<PathBuf>)> {
    WIDGET_PERSIST_STATE.get_or_init(|| Mutex::new((PersistedWidgetState::default(), 0, None)))
}

fn widget_state_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(WIDGET_STATE_FILE))
}

fn load_persisted_widget_state<R: Runtime>(app: &AppHandle<R>) -> PersistedWidgetState {
    let path_opt = widget_state_path(app);
    let loaded = path_opt
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<PersistedWidgetState>(&raw).ok())
        .unwrap_or_default();

    if let Ok(mut guard) = widget_persist_lock().lock() {
        *guard = (loaded.clone(), 0, path_opt);
    }
    loaded
}

fn write_persisted_snapshot(path: &PathBuf, state: &PersistedWidgetState) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, json);
    }
}

fn persist_widget_immediate(mutate: impl FnOnce(&mut PersistedWidgetState)) {
    let snapshot = if let Ok(mut guard) = widget_persist_lock().lock() {
        mutate(&mut guard.0);
        guard.1 = guard.1.wrapping_add(1);
        guard.2.clone().map(|path| (path, guard.0.clone()))
    } else {
        None
    };

    if let Some((path, state)) = snapshot {
        write_persisted_snapshot(&path, &state);
    }
}

fn persist_widget_position_debounced(x: f64, y: f64) {
    let scheduled = if let Ok(mut guard) = widget_persist_lock().lock() {
        guard.0.x = Some(x);
        guard.0.y = Some(y);
        guard.1 = guard.1.wrapping_add(1);
        let generation = guard.1;
        guard.2.clone().map(|path| (path, generation))
    } else {
        None
    };

    if let Some((path, generation)) = scheduled {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            let to_write = if let Ok(guard) = widget_persist_lock().lock() {
                if guard.1 == generation {
                    Some(guard.0.clone())
                } else {
                    None
                }
            } else {
                None
            };
            if let Some(state) = to_write {
                write_persisted_snapshot(&path, &state);
            }
        });
    }
}

fn position_fits_any_monitor<R: Runtime>(
    win: &tauri::WebviewWindow<R>,
    x: f64,
    y: f64,
) -> bool {
    let Ok(monitors) = win.available_monitors() else {
        return false;
    };
    monitors.into_iter().any(|m| {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        x >= pos.x - 40.0
            && x <= pos.x + size.width - 40.0
            && y >= pos.y
            && y <= pos.y + size.height - 40.0
    })
}

fn mark_popover_hidden_now() {
    if let Ok(mut guard) = last_popover_hide_lock().lock() {
        *guard = Some(Instant::now());
    }
}

fn popover_just_hidden() -> bool {
    if let Ok(guard) = last_popover_hide_lock().lock()
        && let Some(ts) = *guard
    {
        return ts.elapsed() < Duration::from_millis(220);
    }
    false
}

fn ensure_popover_window<R: Runtime>(
    app: &AppHandle<R>,
) -> tauri::Result<tauri::WebviewWindow<R>> {
    if let Some(win) = app.get_webview_window(POPOVER_WINDOW_LABEL) {
        return Ok(win);
    }

    let popover = WebviewWindowBuilder::new(
        app,
        POPOVER_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=popover".into()),
    )
    .title("Activity Quick Control")
    .inner_size(POPOVER_WIDTH, POPOVER_HEIGHT)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()?;

    let popover_handle = popover.clone();
    popover.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            if popover_handle.is_visible().unwrap_or(false) {
                mark_popover_hidden_now();
                let _ = popover_handle.hide();
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            mark_popover_hidden_now();
            let _ = popover_handle.hide();
        }
        _ => {}
    });

    Ok(popover)
}

fn ensure_widget_window<R: Runtime>(
    app: &AppHandle<R>,
) -> tauri::Result<tauri::WebviewWindow<R>> {
    if let Some(win) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        return Ok(win);
    }

    let persisted = widget_persist_lock()
        .lock()
        .map(|g| g.0.clone())
        .unwrap_or_default();

    let widget = WebviewWindowBuilder::new(
        app,
        WIDGET_WINDOW_LABEL,
        WebviewUrl::App("index.html?view=widget".into()),
    )
    .title("Activity Widget")
    .inner_size(WIDGET_WIDTH, WIDGET_HEIGHT)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .always_on_top(persisted.always_on_top)
    .skip_taskbar(true)
    .visible(false)
    .build()?;

    if let (Some(px), Some(py)) = (persisted.x, persisted.y)
        && position_fits_any_monitor(&widget, px, py)
    {
        let _ = widget.set_position(LogicalPosition::new(px, py));
    } else if let Ok(Some(monitor)) = widget.primary_monitor() {
        let scale = monitor.scale_factor();
        let m_pos = monitor.position().to_logical::<f64>(scale);
        let m_size = monitor.size().to_logical::<f64>(scale);
        let x = (m_pos.x + m_size.width - WIDGET_WIDTH - 24.0).max(m_pos.x + 12.0);
        let y = m_pos.y + 44.0;
        let _ = widget.set_position(LogicalPosition::new(x, y));
    }

    let widget_handle = widget.clone();
    widget.on_window_event(move |event| match event {
        WindowEvent::Moved(pos) => {
            if widget_handle.is_visible().unwrap_or(false) {
                let scale = widget_handle.scale_factor().unwrap_or(1.0);
                let logical = pos.to_logical::<f64>(scale);
                persist_widget_position_debounced(logical.x, logical.y);
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = widget_handle.hide();
            persist_widget_immediate(|s| s.visible = false);
            let app = widget_handle.app_handle();
            emit_widget_state(app);
            crate::tray::refresh_widget_menu_label(app);
        }
        _ => {}
    });

    Ok(widget)
}

pub fn init_auxiliary_windows<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let persisted = load_persisted_widget_state(app.handle());
    if persisted.visible {
        let widget = ensure_widget_window(app.handle())?;
        let _ = widget.show();
    }
    Ok(())
}

pub fn open_main<R: Runtime>(app: &AppHandle<R>) {
    hide_popover(app);
    if let Some(win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn hide_popover<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window(POPOVER_WINDOW_LABEL)
        && win.is_visible().unwrap_or(false)
    {
        mark_popover_hidden_now();
        let _ = win.hide();
    }
}

pub fn toggle_popover_at<R: Runtime>(app: &AppHandle<R>, tray_rect: Option<Rect>) {
    if let Some(win) = app.get_webview_window(POPOVER_WINDOW_LABEL)
        && win.is_visible().unwrap_or(false)
    {
        mark_popover_hidden_now();
        let _ = win.hide();
        return;
    }

    // Avoid immediately reopening when the tray click itself triggered blur->hide
    if popover_just_hidden() {
        return;
    }

    let Ok(win) = ensure_popover_window(app) else {
        return;
    };

    if let Some(rect) = tray_rect {
        let scale = win.scale_factor().unwrap_or(1.0);
        let tray_pos = rect.position.to_logical::<f64>(scale);
        let tray_size = rect.size.to_logical::<f64>(scale);

        let mut x = tray_pos.x + (tray_size.width / 2.0) - (POPOVER_WIDTH / 2.0);
        let mut y = tray_pos.y + tray_size.height + 6.0;

        let monitor_opt = app
            .monitor_from_point(
                tray_pos.x * scale + (tray_size.width * scale) / 2.0,
                tray_pos.y * scale,
            )
            .ok()
            .flatten()
            .or_else(|| win.primary_monitor().ok().flatten());

        if let Some(monitor) = monitor_opt {
            let m_scale = monitor.scale_factor();
            let m_pos = monitor.position().to_logical::<f64>(m_scale);
            let m_size = monitor.size().to_logical::<f64>(m_scale);
            let min_x = m_pos.x + 8.0;
            let max_x = m_pos.x + m_size.width - POPOVER_WIDTH - 8.0;
            x = x.clamp(min_x, max_x.max(min_x));
            let max_y = m_pos.y + m_size.height - POPOVER_HEIGHT - 8.0;
            y = y.clamp(m_pos.y + 8.0, max_y.max(m_pos.y + 8.0));
        }

        let _ = win.set_position(LogicalPosition::new(x, y));
    } else if let Ok(Some(monitor)) = win.primary_monitor() {
        let scale = monitor.scale_factor();
        let m_pos = monitor.position().to_logical::<f64>(scale);
        let m_size = monitor.size().to_logical::<f64>(scale);
        let x = m_pos.x + m_size.width - POPOVER_WIDTH - 16.0;
        let y = m_pos.y + 36.0;
        let _ = win.set_position(LogicalPosition::new(x, y));
    }

    let _ = win.show();
    let _ = win.set_focus();
}

pub fn get_widget_state<R: Runtime>(app: &AppHandle<R>) -> WidgetStateOut {
    if let Some(win) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        WidgetStateOut {
            visible: win.is_visible().unwrap_or(false),
            always_on_top: win.is_always_on_top().unwrap_or(true),
        }
    } else {
        let always_on_top = widget_persist_lock()
            .lock()
            .map(|g| g.0.always_on_top)
            .unwrap_or(true);
        WidgetStateOut {
            visible: false,
            always_on_top,
        }
    }
}

pub fn set_widget_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> WidgetStateOut {
    if visible {
        if let Ok(win) = ensure_widget_window(app) {
            let _ = win.show();
            let _ = win.set_focus();
        }
    } else if let Some(win) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        let _ = win.hide();
    }
    persist_widget_immediate(|s| s.visible = visible);
    emit_widget_state(app);
    crate::tray::refresh_widget_menu_label(app);
    get_widget_state(app)
}

pub fn toggle_widget<R: Runtime>(app: &AppHandle<R>) -> WidgetStateOut {
    let currently_visible = get_widget_state(app).visible;
    set_widget_visible(app, !currently_visible)
}

pub fn set_widget_always_on_top<R: Runtime>(
    app: &AppHandle<R>,
    always_on_top: bool,
) -> WidgetStateOut {
    if let Some(win) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        let _ = win.set_always_on_top(always_on_top);
    }
    persist_widget_immediate(|s| s.always_on_top = always_on_top);
    emit_widget_state(app);
    get_widget_state(app)
}

pub fn emit_widget_state<R: Runtime>(app: &AppHandle<R>) {
    let state = get_widget_state(app);
    let _ = app.emit("widget-state-changed", state);
}
