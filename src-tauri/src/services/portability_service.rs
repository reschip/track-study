use std::collections::HashMap;

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::db::format_utc;
use crate::error::{AppError, AppResult};
use crate::models::{ImportResultOut, UserOut};
use crate::services::session_service;
use crate::time_utils::{format_date, parse_utc};

const DEFAULT_IMPORT_COLORS: &[&str] = &[
    "#1F6FEB", "#2DA44E", "#8250DF", "#BF8700", "#CF222E", "#0969DA", "#1A7F37",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportActivityPayload {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default)]
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProjectPayload {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub activity_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSegmentPayload {
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    #[serde(default)]
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSessionPayload {
    pub activity_name: String,
    #[serde(default)]
    pub project_name: Option<String>,
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    #[serde(default)]
    pub duration_seconds: i64,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_tracking_method")]
    pub tracking_method: String,
    #[serde(default = "default_session_status")]
    pub status: String,
    #[serde(default)]
    pub segments: Vec<ExportSegmentPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportBundle {
    #[serde(default = "default_version")]
    pub version: String,
    pub exported_at: String,
    #[serde(default)]
    pub user_settings: serde_json::Value,
    #[serde(default)]
    pub activities: Vec<ExportActivityPayload>,
    #[serde(default)]
    pub projects: Vec<ExportProjectPayload>,
    #[serde(default)]
    pub sessions: Vec<ExportSessionPayload>,
}

fn default_color() -> String {
    "#1F6FEB".to_string()
}
fn default_category() -> String {
    "professional".to_string()
}
fn default_status() -> String {
    "active".to_string()
}
fn default_tracking_method() -> String {
    "manual".to_string()
}
fn default_session_status() -> String {
    "completed".to_string()
}
fn default_version() -> String {
    "1.0".to_string()
}

pub async fn build_export_bundle(pool: &SqlitePool, user: &UserOut) -> AppResult<ExportBundle> {
    let act_rows = sqlx::query(
        "SELECT name, description, color, category, is_archived FROM activities WHERE user_id = ? ORDER BY name ASC",
    )
    .bind(&user.id)
    .fetch_all(pool)
    .await?;

    let activities: Vec<ExportActivityPayload> = act_rows
        .into_iter()
        .map(|r| ExportActivityPayload {
            name: r.get("name"),
            description: r.get("description"),
            color: r.get("color"),
            category: r.get("category"),
            is_archived: r.get::<i64, _>("is_archived") != 0,
        })
        .collect();

    let proj_rows = sqlx::query(
        "SELECT id, name, description, color, start_date, end_date, status FROM projects WHERE user_id = ? ORDER BY name ASC",
    )
    .bind(&user.id)
    .fetch_all(pool)
    .await?;

    let link_rows = sqlx::query(
        "SELECT pa.project_id, a.name AS act_name
         FROM project_activities pa
         JOIN activities a ON pa.activity_id = a.id
         JOIN projects p ON pa.project_id = p.id
         WHERE p.user_id = ?
         ORDER BY a.name ASC",
    )
    .bind(&user.id)
    .fetch_all(pool)
    .await?;

    let mut act_names_by_proj: HashMap<String, Vec<String>> = HashMap::new();
    for r in link_rows {
        let pid: String = r.get("project_id");
        let name: String = r.get("act_name");
        act_names_by_proj.entry(pid).or_default().push(name);
    }

    let projects: Vec<ExportProjectPayload> = proj_rows
        .into_iter()
        .map(|r| {
            let pid: String = r.get("id");
            ExportProjectPayload {
                name: r.get("name"),
                description: r.get("description"),
                color: r.get("color"),
                start_date: r.get("start_date"),
                end_date: r.get("end_date"),
                status: r.get("status"),
                activity_names: act_names_by_proj.remove(&pid).unwrap_or_default(),
            }
        })
        .collect();

    let sess_rows = sqlx::query(
        "SELECT s.id, a.name AS act_name, p.name AS proj_name,
                s.started_at, s.ended_at, s.duration_seconds, s.description,
                s.tracking_method, s.status
         FROM time_sessions s
         JOIN activities a ON s.activity_id = a.id
         LEFT JOIN projects p ON s.project_id = p.id
         WHERE s.user_id = ? AND s.status = 'completed'
         ORDER BY s.started_at ASC",
    )
    .bind(&user.id)
    .fetch_all(pool)
    .await?;

    let seg_rows = sqlx::query(
        "SELECT seg.session_id, seg.started_at, seg.ended_at, seg.duration_seconds
         FROM time_segments seg
         JOIN time_sessions s ON seg.session_id = s.id
         WHERE s.user_id = ? AND s.status = 'completed'
         ORDER BY seg.started_at ASC",
    )
    .bind(&user.id)
    .fetch_all(pool)
    .await?;

    let mut segs_by_sess: HashMap<String, Vec<ExportSegmentPayload>> = HashMap::new();
    for r in seg_rows {
        let sid: String = r.get("session_id");
        segs_by_sess.entry(sid).or_default().push(ExportSegmentPayload {
            started_at: r.get("started_at"),
            ended_at: r.get("ended_at"),
            duration_seconds: r.get("duration_seconds"),
        });
    }

    let sessions: Vec<ExportSessionPayload> = sess_rows
        .into_iter()
        .map(|r| {
            let sid: String = r.get("id");
            ExportSessionPayload {
                activity_name: r.get("act_name"),
                project_name: r.get("proj_name"),
                started_at: r.get("started_at"),
                ended_at: r.get("ended_at"),
                duration_seconds: r.get("duration_seconds"),
                description: r.get("description"),
                tracking_method: r.get("tracking_method"),
                status: r.get("status"),
                segments: segs_by_sess.remove(&sid).unwrap_or_default(),
            }
        })
        .collect();

    Ok(ExportBundle {
        version: "1.0".to_string(),
        exported_at: format_utc(Utc::now()),
        user_settings: serde_json::json!({
            "timezone": user.timezone,
            "week_start_day": user.week_start_day,
            "theme": user.theme,
            "intensity_thresholds": user.intensity_thresholds,
        }),
        activities,
        projects,
        sessions,
    })
}

pub async fn build_export_json(pool: &SqlitePool, user: &UserOut) -> AppResult<String> {
    let bundle = build_export_bundle(pool, user).await?;
    serde_json::to_string_pretty(&bundle)
        .map_err(|e| AppError::internal(format!("Failed to serialize export JSON: {e}")))
}

pub async fn build_export_csv(pool: &SqlitePool, user: &UserOut) -> AppResult<String> {
    let rows = sqlx::query(
        "SELECT s.id, a.name AS act_name, a.category AS act_category,
                p.name AS proj_name, s.tracking_method, s.started_at,
                s.ended_at, s.duration_seconds, s.description
         FROM time_sessions s
         JOIN activities a ON s.activity_id = a.id
         LEFT JOIN projects p ON s.project_id = p.id
         WHERE s.user_id = ? AND s.status = 'completed'
         ORDER BY s.started_at DESC",
    )
    .bind(&user.id)
    .fetch_all(pool)
    .await?;

    let mut wtr = csv::Writer::from_writer(Vec::new());
    wtr.write_record([
        "session_id",
        "activity",
        "category",
        "project",
        "tracking_method",
        "started_at",
        "ended_at",
        "duration_seconds",
        "description",
    ])
    .map_err(|e| AppError::internal(format!("CSV write error: {e}")))?;

    for r in rows {
        let sid: String = r.get("id");
        let act_name: String = r.get("act_name");
        let act_cat: String = r.get("act_category");
        let proj_name: String = r.get::<Option<String>, _>("proj_name").unwrap_or_default();
        let method: String = r.get("tracking_method");
        let started_at: String = r.get("started_at");
        let ended_at: String = r.get::<Option<String>, _>("ended_at").unwrap_or_default();
        let dur: i64 = r.get("duration_seconds");
        let desc: String = r.get::<Option<String>, _>("description").unwrap_or_default();
        wtr.write_record([
            &sid,
            &act_name,
            &act_cat,
            &proj_name,
            &method,
            &started_at,
            &ended_at,
            &dur.to_string(),
            &desc,
        ])
        .map_err(|e| AppError::internal(format!("CSV write error: {e}")))?;
    }

    let bytes = wtr
        .into_inner()
        .map_err(|e| AppError::internal(format!("CSV flush error: {e}")))?;
    String::from_utf8(bytes)
        .map_err(|e| AppError::internal(format!("CSV UTF-8 error: {e}")))
}

pub async fn import_json_bundle(
    pool: &SqlitePool,
    user: &UserOut,
    bundle: ExportBundle,
) -> AppResult<ImportResultOut> {
    let mut existing_acts: HashMap<String, String> = HashMap::new();
    for r in sqlx::query("SELECT id, name FROM activities WHERE user_id = ?")
        .bind(&user.id)
        .fetch_all(pool)
        .await?
    {
        let id: String = r.get("id");
        let name: String = r.get("name");
        existing_acts.insert(name.to_lowercase(), id);
    }

    let mut existing_projs: HashMap<String, String> = HashMap::new();
    for r in sqlx::query("SELECT id, name FROM projects WHERE user_id = ?")
        .bind(&user.id)
        .fetch_all(pool)
        .await?
    {
        let id: String = r.get("id");
        let name: String = r.get("name");
        existing_projs.insert(name.to_lowercase(), id);
    }

    let mut activities_created = 0_i64;
    let mut projects_created = 0_i64;
    let mut sessions_created = 0_i64;
    let mut sessions_skipped = 0_i64;
    let mut errors: Vec<String> = Vec::new();
    let now_str = format_utc(Utc::now());

    for act_in in bundle.activities {
        let trimmed = act_in.name.trim();
        let key = trimmed.to_lowercase();
        if key.is_empty() || existing_acts.contains_key(&key) {
            continue;
        }
        let aid = Uuid::new_v4().to_string();
        let cat = if act_in.category == "professional" || act_in.category == "personal" {
            act_in.category.as_str()
        } else {
            "professional"
        };
        sqlx::query(
            "INSERT INTO activities (id, user_id, name, description, color, category, is_archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&aid)
        .bind(&user.id)
        .bind(trimmed)
        .bind(&act_in.description)
        .bind(&act_in.color)
        .bind(cat)
        .bind(if act_in.is_archived { 1_i64 } else { 0_i64 })
        .bind(&now_str)
        .bind(&now_str)
        .execute(pool)
        .await?;
        existing_acts.insert(key, aid);
        activities_created += 1;
    }

    for proj_in in bundle.projects {
        let trimmed = proj_in.name.trim();
        let key = trimmed.to_lowercase();
        if key.is_empty() || existing_projs.contains_key(&key) {
            continue;
        }
        let pid = Uuid::new_v4().to_string();
        let status = match proj_in.status.as_str() {
            "active" | "paused" | "completed" | "archived" => proj_in.status.as_str(),
            _ => "active",
        };
        let start_d = proj_in
            .start_date
            .unwrap_or_else(|| format_date(Utc::now().date_naive()));
        sqlx::query(
            "INSERT INTO projects (id, user_id, name, description, color, start_date, end_date, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&pid)
        .bind(&user.id)
        .bind(trimmed)
        .bind(&proj_in.description)
        .bind(&proj_in.color)
        .bind(&start_d)
        .bind(&proj_in.end_date)
        .bind(status)
        .bind(&now_str)
        .bind(&now_str)
        .execute(pool)
        .await?;

        for act_name in proj_in.activity_names {
            if let Some(aid) = existing_acts.get(&act_name.trim().to_lowercase()) {
                sqlx::query(
                    "INSERT OR IGNORE INTO project_activities (project_id, activity_id) VALUES (?, ?)",
                )
                .bind(&pid)
                .bind(aid)
                .execute(pool)
                .await?;
            }
        }
        existing_projs.insert(key, pid);
        projects_created += 1;
    }

    for (idx, sess_in) in bundle.sessions.into_iter().enumerate() {
        let act_trimmed = sess_in.activity_name.trim();
        let act_key = act_trimmed.to_lowercase();
        let act_id = if let Some(id) = existing_acts.get(&act_key) {
            id.clone()
        } else {
            let name = if act_trimmed.is_empty() {
                "Imported Activity"
            } else {
                act_trimmed
            };
            let aid = Uuid::new_v4().to_string();
            let color = DEFAULT_IMPORT_COLORS[existing_acts.len() % DEFAULT_IMPORT_COLORS.len()];
            sqlx::query(
                "INSERT INTO activities (id, user_id, name, color, category, is_archived, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'professional', 0, ?, ?)",
            )
            .bind(&aid)
            .bind(&user.id)
            .bind(name)
            .bind(color)
            .bind(&now_str)
            .bind(&now_str)
            .execute(pool)
            .await?;
            existing_acts.insert(name.to_lowercase(), aid.clone());
            activities_created += 1;
            aid
        };

        let start_utc = match parse_utc(&sess_in.started_at) {
            Ok(dt) => dt,
            Err(e) => {
                sessions_skipped += 1;
                errors.push(format!("Row {}: {}", idx + 1, e));
                continue;
            }
        };
        let end_utc = match &sess_in.ended_at {
            Some(end_s) if !end_s.trim().is_empty() => match parse_utc(end_s) {
                Ok(dt) => dt,
                Err(e) => {
                    sessions_skipped += 1;
                    errors.push(format!("Row {}: {}", idx + 1, e));
                    continue;
                }
            },
            _ => start_utc + Duration::seconds(sess_in.duration_seconds.max(1)),
        };

        if end_utc <= start_utc {
            sessions_skipped += 1;
            errors.push(format!("Row {}: ended_at must follow started_at", idx + 1));
            continue;
        }

        let proj_id = if let Some(ref pn) = sess_in.project_name {
            let pt = pn.trim();
            if pt.is_empty() {
                None
            } else {
                let pkey = pt.to_lowercase();
                if let Some(pid) = existing_projs.get(&pkey) {
                    Some(pid.clone())
                } else {
                    let pid = Uuid::new_v4().to_string();
                    let color =
                        DEFAULT_IMPORT_COLORS[existing_projs.len() % DEFAULT_IMPORT_COLORS.len()];
                    let sd = format_date(start_utc.date_naive());
                    sqlx::query(
                        "INSERT INTO projects (id, user_id, name, color, start_date, status, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
                    )
                    .bind(&pid)
                    .bind(&user.id)
                    .bind(pt)
                    .bind(color)
                    .bind(&sd)
                    .bind(&now_str)
                    .bind(&now_str)
                    .execute(pool)
                    .await?;
                    sqlx::query(
                        "INSERT OR IGNORE INTO project_activities (project_id, activity_id) VALUES (?, ?)",
                    )
                    .bind(&pid)
                    .bind(&act_id)
                    .execute(pool)
                    .await?;
                    existing_projs.insert(pkey, pid.clone());
                    projects_created += 1;
                    Some(pid)
                }
            }
        } else {
            None
        };

        let segs = if sess_in.segments.is_empty() {
            vec![ExportSegmentPayload {
                started_at: format_utc(start_utc),
                ended_at: Some(format_utc(end_utc)),
                duration_seconds: ((end_utc - start_utc).num_seconds()).max(1),
            }]
        } else {
            sess_in.segments
        };

        let mut parsed_segs = Vec::with_capacity(segs.len());
        let mut seg_err: Option<String> = None;
        for seg in &segs {
            let s_u = match parse_utc(&seg.started_at) {
                Ok(dt) => dt,
                Err(e) => {
                    seg_err = Some(e.to_string());
                    break;
                }
            };
            let e_u = match &seg.ended_at {
                Some(es) if !es.trim().is_empty() => match parse_utc(es) {
                    Ok(dt) => dt,
                    Err(e) => {
                        seg_err = Some(e.to_string());
                        break;
                    }
                },
                _ => end_utc,
            };
            if e_u <= s_u {
                seg_err = Some("Invalid segment range".to_string());
                break;
            }
            if let Err(e) =
                session_service::ensure_no_overlap(pool, &user.id, s_u, e_u, None, None).await
            {
                seg_err = Some(e.to_string());
                break;
            }
            let dur = ((e_u - s_u).num_milliseconds() as f64 / 1000.0)
                .round()
                .max(0.0) as i64;
            parsed_segs.push((s_u, e_u, dur));
        }

        if let Some(msg) = seg_err {
            sessions_skipped += 1;
            errors.push(format!("Row {}: {msg}", idx + 1));
            continue;
        }

        let total_secs: i64 = parsed_segs.iter().map(|(_, _, d)| *d).sum();
        let final_dur = if total_secs > 0 {
            total_secs
        } else {
            sess_in.duration_seconds.max(1)
        };
        let method = if sess_in.tracking_method == "timer" || sess_in.tracking_method == "manual" {
            sess_in.tracking_method.as_str()
        } else {
            "manual"
        };

        let sid = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO time_sessions (id, user_id, activity_id, project_id, started_at, ended_at, duration_seconds, description, tracking_method, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)",
        )
        .bind(&sid)
        .bind(&user.id)
        .bind(&act_id)
        .bind(&proj_id)
        .bind(format_utc(start_utc))
        .bind(format_utc(end_utc))
        .bind(final_dur)
        .bind(&sess_in.description)
        .bind(method)
        .bind(&now_str)
        .bind(&now_str)
        .execute(pool)
        .await?;

        for (s_u, e_u, dur) in parsed_segs {
            let seg_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO time_segments (id, session_id, started_at, ended_at, duration_seconds)
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&seg_id)
            .bind(&sid)
            .bind(format_utc(s_u))
            .bind(format_utc(e_u))
            .bind(dur)
            .execute(pool)
            .await?;
        }

        sessions_created += 1;
    }

    errors.truncate(25);
    Ok(ImportResultOut {
        activities_created,
        projects_created,
        sessions_created,
        sessions_skipped,
        errors,
    })
}

pub async fn import_csv_text(
    pool: &SqlitePool,
    user: &UserOut,
    csv_text: &str,
) -> AppResult<ImportResultOut> {
    let mut rdr = csv::Reader::from_reader(csv_text.as_bytes());
    let headers = rdr
        .headers()
        .map_err(|e| AppError::bad_request(format!("Invalid CSV header: {e}"), "invalid_csv"))?
        .clone();

    let col_idx = |name: &str| -> Option<usize> {
        headers
            .iter()
            .position(|h| h.trim().eq_ignore_ascii_case(name))
    };

    let idx_activity = col_idx("activity");
    let idx_project = col_idx("project");
    let idx_method = col_idx("tracking_method");
    let idx_started = col_idx("started_at");
    let idx_ended = col_idx("ended_at");
    let idx_dur = col_idx("duration_seconds");
    let idx_desc = col_idx("description");

    let mut sessions = Vec::new();
    let mut errors = Vec::new();
    let mut skipped = 0_i64;

    for (idx, result) in rdr.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                skipped += 1;
                errors.push(format!("CSV line {}: {e}", idx + 2));
                continue;
            }
        };
        let get_col = |ci: Option<usize>| -> String {
            ci.and_then(|i| record.get(i))
                .unwrap_or("")
                .trim()
                .to_string()
        };

        let act_name = get_col(idx_activity);
        let started_raw = get_col(idx_started);
        if act_name.is_empty() || started_raw.is_empty() {
            skipped += 1;
            errors.push(format!(
                "CSV line {}: missing activity or started_at",
                idx + 2
            ));
            continue;
        }

        let started_dt = match parse_utc(&started_raw) {
            Ok(dt) => dt,
            Err(e) => {
                skipped += 1;
                errors.push(format!("CSV line {}: {}", idx + 2, e));
                continue;
            }
        };

        let ended_raw = get_col(idx_ended);
        let mut ended_dt = if ended_raw.is_empty() {
            None
        } else {
            match parse_utc(&ended_raw) {
                Ok(dt) => Some(dt),
                Err(e) => {
                    skipped += 1;
                    errors.push(format!("CSV line {}: {}", idx + 2, e));
                    continue;
                }
            }
        };

        let dur_raw = get_col(idx_dur);
        let duration_seconds = if !dur_raw.is_empty() {
            match dur_raw.parse::<i64>() {
                Ok(v) => v,
                Err(_) => {
                    skipped += 1;
                    errors.push(format!("CSV line {}: invalid duration_seconds", idx + 2));
                    continue;
                }
            }
        } else if let Some(ed) = ended_dt {
            (ed - started_dt).num_seconds()
        } else {
            0
        };

        if ended_dt.is_none() && duration_seconds > 0 {
            ended_dt = Some(started_dt + Duration::seconds(duration_seconds));
        }

        let proj = get_col(idx_project);
        let desc = get_col(idx_desc);
        let method = get_col(idx_method);

        sessions.push(ExportSessionPayload {
            activity_name: act_name,
            project_name: if proj.is_empty() { None } else { Some(proj) },
            started_at: format_utc(started_dt),
            ended_at: ended_dt.map(format_utc),
            duration_seconds: duration_seconds.max(1),
            description: if desc.is_empty() { None } else { Some(desc) },
            tracking_method: if method.is_empty() {
                "manual".to_string()
            } else {
                method
            },
            status: "completed".to_string(),
            segments: Vec::new(),
        });
    }

    let bundle = ExportBundle {
        version: "1.0".to_string(),
        exported_at: format_utc(Utc::now()),
        user_settings: serde_json::Value::Null,
        activities: Vec::new(),
        projects: Vec::new(),
        sessions,
    };

    let mut res = import_json_bundle(pool, user, bundle).await?;
    res.sessions_skipped += skipped;
    let mut combined = errors;
    combined.extend(res.errors);
    combined.truncate(25);
    res.errors = combined;
    Ok(res)
}

pub async fn import_content(
    pool: &SqlitePool,
    user: &UserOut,
    filename: &str,
    content: &str,
) -> AppResult<ImportResultOut> {
    let trimmed = content.trim_start();
    let is_json = filename.to_lowercase().ends_with(".json") || trimmed.starts_with('{');
    if is_json {
        let bundle: ExportBundle = serde_json::from_str(content)
            .map_err(|e| AppError::bad_request(format!("Invalid JSON export bundle: {e}"), "invalid_json"))?;
        import_json_bundle(pool, user, bundle).await
    } else {
        import_csv_text(pool, user, content).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_pool_from_url, seed_catalog_if_empty};
    use crate::models::ManualSessionCreate;
    use crate::services::{activity_service, user_service};

    #[tokio::test]
    async fn json_and_csv_export_import_roundtrip_and_overlap_skip() {
        let pool = init_pool_from_url("sqlite::memory:").await.unwrap();
        seed_catalog_if_empty(&pool).await.unwrap();
        let user = user_service::get_default_user(&pool).await.unwrap();
        let activities = activity_service::list_activities(&pool, &user, true, None)
            .await
            .unwrap();

        session_service::create_manual_session(
            &pool,
            &user,
            ManualSessionCreate {
                activity_id: activities[0].id.clone(),
                project_id: None,
                started_at: "2026-10-01T10:00:00Z".to_string(),
                ended_at: Some("2026-10-01T11:00:00Z".to_string()),
                duration_seconds: None,
                description: Some("Exported".to_string()),
            },
        )
        .await
        .unwrap();

        let json_str = build_export_json(&pool, &user).await.unwrap();
        let csv_str = build_export_csv(&pool, &user).await.unwrap();
        assert!(csv_str.contains("Exported"));

        // Re-importing same JSON into a fresh DB creates the session; importing again skips overlap
        let pool2 = init_pool_from_url("sqlite::memory:").await.unwrap();
        let user2 = user_service::get_default_user(&pool2).await.unwrap();
        let res1 = import_content(&pool2, &user2, "backup.json", &json_str)
            .await
            .unwrap();
        assert_eq!(res1.sessions_created, 1);
        assert_eq!(res1.sessions_skipped, 0);

        let res2 = import_content(&pool2, &user2, "backup.csv", &csv_str)
            .await
            .unwrap();
        assert_eq!(res2.sessions_created, 0);
        assert_eq!(res2.sessions_skipped, 1);
    }
}
