# AGENTS.md

Guía rápida del proyecto **Activity** para agentes de código.

## Stack y arquitectura
- **App de escritorio (macOS)**: Tauri v2 (`src-tauri/`) + React/Vite/TypeScript/Tailwind (`frontend/`).
- **Persistencia local**: SQLite vía `sqlx` (`src-tauri/migrations/0001_init.sql`), almacenada en `app_data_dir()/activity.db`.
- **Comunicación UI ↔ Backend**: comandos `#[tauri::command]` invocados desde `frontend/src/api/` usando `tauriInvoke()` (`@tauri-apps/api/core`) en `frontend/src/api/client.ts`.

## Estructura del proyecto
```text
activity_tracker/
├── AGENTS.md
├── README.md
├── frontend/
│   └── src/
│       ├── api/          # Clientes invoke (activities, analytics, portability, projects, sessions, tracker, user, windows)
│       ├── components/   # charts/, layout/, sessions/, tracker/, ui/, widgets/
│       ├── pages/        # Overview, Activities, Projects, Analytics, History, Settings
│       ├── services/     # timer, streak, timeFormat (+ tests Vitest)
│       ├── state/        # AppContext.tsx (estado global + listeners "timer-changed", "workspace-changed", "widget-state-changed")
│       └── types/        # index.ts (contratos TS)
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    ├── migrations/
    │   └── 0001_init.sql
    └── src/
        ├── lib.rs        # Setup SQLite, AppState, plugins, ventanas auxiliares, tray y handlers
        ├── commands.rs   # 40 comandos #[tauri::command]
        ├── db.rs         # Pool SQLite y seed limpio
        ├── models.rs     # DTOs Rust
        ├── error.rs      # AppError
        ├── time_utils.rs # Timezones y split por medianoche
        ├── tray.rs       # Menú bar tray de macOS
        ├── windows.rs    # Popover del tray y Desktop Widget flotante persistente
        └── services/     # activity, analytics, portability, project, session, tracker, user
```

## Mapa de archivos clave
- `src-tauri/tauri.conf.json`: configuración Tauri (`devUrl: http://localhost:5174`, bundle `com.activity.tracker`).
- `src-tauri/src/lib.rs`: inicialización de SQLite, `AppState`, plugins (`dialog`, `autostart`), ventanas auxiliares, tray y registro de comandos.
- `src-tauri/src/commands.rs`: los 40 comandos Tauri expuestos al frontend.
- `src-tauri/src/windows.rs`: gestión del Menu Bar Popover (`popover`) y Desktop Widget (`widget`, posición/visibilidad/pin persistidos en `widget_state.json`).
- `src-tauri/src/db.rs`: pool SQLite, migraciones y seed inicial limpio (1 usuario, 12 actividades, 4 proyectos, 0 sesiones).
- `src-tauri/src/models.rs` y `src-tauri/src/error.rs`: DTOs y `AppError` (`{ message, code, status }`).
- `src-tauri/src/time_utils.rs`: manejo de zonas horarias y división de intervalos por medianoche local.
- `src-tauri/src/tray.rs`: ícono y menú en la barra de menú de macOS (actualización cada 1s + ocultar al cerrar ventana).
- `src-tauri/src/services/`: lógica de negocio (`user_service`, `activity_service`, `project_service`, `tracker_service`, `session_service`, `analytics_service`, `portability_service`).
- `frontend/src/state/AppContext.tsx`: estado global, reloj en vivo y listener de evento `"timer-changed"`.
- `frontend/src/types/index.ts`: contratos TypeScript espejados con `src-tauri/src/models.rs`.

## Comandos frecuentes
> Nota: si `$HOME/.cargo/bin` no está en el `PATH` de tu shell, antepón `export PATH="$HOME/.cargo/bin:$PATH"`.

- **Tests Frontend + Build**:
  ```bash
  cd frontend && npm run test && npm run build
  ```
- **Tests y lints Rust**:
  ```bash
  cd src-tauri && cargo test && cargo clippy
  ```
- **Desarrollo nativo (hot-reload en :5174, ejecutar desde la raíz)**:
  ```bash
  ./frontend/node_modules/.bin/tauri dev
  ```
- **Build `.app` de macOS**:
  ```bash
  ./frontend/node_modules/.bin/tauri build --bundles app
  ```

## Convenciones críticas
1. **Timestamps en SQLite**: guardar y comparar fechas UTC formateadas con `db::format_utc` (RFC3339 con micros y sufijo `Z`).
2. **Integridad de sesiones**: solo puede haber 1 sesión activa (`running`/`paused`) por usuario y 1 segmento abierto por sesión (enforced por índices parciales en SQLite); evitar solapamientos con `session_service::ensure_no_overlap`.
3. **Sincronización Tray ↔ UI**: cualquier mutación del timer en `commands.rs` o `tray.rs` debe emitir `"timer-changed"` y refrescar el tray (`tray::refresh_tray`).
4. **Seed limpio**: no sembrar sesiones de ejemplo; mantener únicamente el catálogo inicial.
5. **Contratos**: al modificar un DTO en `src-tauri/src/models.rs`, actualizar su equivalente en `frontend/src/types/index.ts`.
