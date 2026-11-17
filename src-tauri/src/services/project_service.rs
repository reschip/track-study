use std::collections::{HashMap, HashSet};

use chrono::{Duration, NaiveDate, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::db::format_utc;
use crate::error::{AppError, AppResult};
use crate::models::{
    ActivityBrief, DailySeriesPoint, DistributionItem, ProjectCreate, ProjectOut, ProjectStatsOut,
    ProjectUpdate, UserOut,
};
use crate::time_utils::{
    format_date, local_date_of, parse_date, parse_utc, split_interval_by_local_day,
};

#[derive(Debug, Clone)]
pub struct ProjectRow {
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
}

impl ProjectRow {
    pub fn from_row(row: &sqlx::sqlite::SqliteRow) -> Self {
        Self {
            id: row.get("id"),
            user_id: row.get("user_id"),
            name: row.get("name"),
            description: row.get("description"),
            color: row.get("color"),
            start_date: row.get("start_date"),
            end_date: row.get("end_date"),
            status: row.get("status"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }
}

fn validate_project_status(status: &str) -> AppResult<()> {
    if !matches!(status, "active" | "paused" | "completed" | "archived") {
        return Err(AppError::unprocessable(
            "Invalid project status",
            "invalid_project_status",
        ));
    }
    Ok(())
}

pub async fn get_project_or_404(
    pool: &SqlitePool,
    user_id: &str,
    project_id: &str,
) -> AppResult<ProjectRow> {
    let row = sqlx::query(
        r#"
        SELECT id, user_id, name, description, color, start_date, end_date, status, created_at, updated_at
        FROM projects
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Project not found"))?;

    Ok(ProjectRow::from_row(&row))
}

async fn validate_activity_ids(
    pool: &SqlitePool,
    user_id: &str,
    ids: &[String],
) -> AppResult<Vec<String>> {
    let mut unique = Vec::new();
    let mut seen = HashSet::new();
    for id in ids {
        if seen.insert(id.clone()) {
            unique.push(id.clone());
        }
    }
    if unique.is_empty() {
        return Ok(unique);
    }

    let valid_ids: HashSet<String> = sqlx::query_scalar(
        "SELECT id FROM activities WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .collect();

    if !unique.iter().all(|id| valid_ids.contains(id)) {
        return Err(AppError::unprocessable(
            "One or more activity_ids are invalid",
            "invalid_activity_ids",
        ));
    }
    Ok(unique)
}

async fn load_linked_activities_map(
    pool: &SqlitePool,
    user_id: &str,
) -> AppResult<HashMap<String, Vec<ActivityBrief>>> {
    let rows = sqlx::query(
        r#"
        SELECT pa.project_id, a.id, a.name, a.color, a.category, a.is_archived
        FROM project_activities pa
        JOIN activities a ON a.id = pa.activity_id
        WHERE a.user_id = ?
        ORDER BY lower(a.name) ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<String, Vec<ActivityBrief>> = HashMap::new();
    for r in rows {
        let pid: String = r.get("project_id");
        map.entry(pid).or_default().push(ActivityBrief {
            id: r.get("id"),
            name: r.get("name"),
            color: r.get("color"),
            category: r.get("category"),
            is_archived: r.get::<i64, _>("is_archived") != 0,
        });
    }
    Ok(map)
}

async fn project_aggregates(
    pool: &SqlitePool,
    user_id: &str,
) -> AppResult<HashMap<String, (i64, i64)>> {
    let rows = sqlx::query(
        r#"
        SELECT project_id,
               COALESCE(SUM(duration_seconds), 0) AS total_secs,
               COUNT(id) AS sess_count
        FROM time_sessions
        WHERE user_id = ? AND status = 'completed' AND project_id IS NOT NULL
        GROUP BY project_id
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut map = HashMap::new();
    for r in rows {
        if let Some(pid) = r.get::<Option<String>, _>("project_id") {
            map.insert(pid, (r.get("total_secs"), r.get("sess_count")));
        }
    }
    Ok(map)
}

fn build_project_out(
    p: ProjectRow,
    activities: Vec<ActivityBrief>,
    stats: (i64, i64),
) -> ProjectOut {
    ProjectOut {
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        description: p.description,
        color: p.color,
        start_date: p.start_date,
        end_date: p.end_date,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        activities,
        total_seconds: stats.0,
        session_count: stats.1,
    }
}

pub async fn list_projects(
    pool: &SqlitePool,
    user: &UserOut,
    status: Option<&str>,
) -> AppResult<Vec<ProjectOut>> {
    let mut sql = String::from(
        "SELECT id, user_id, name, description, color, start_date, end_date, status, created_at, updated_at
         FROM projects WHERE user_id = ?",
    );
    if status.is_some() {
        sql.push_str(" AND status = ?");
    }
    sql.push_str(" ORDER BY status ASC, start_date DESC, name ASC");

    let mut q = sqlx::query(&sql).bind(&user.id);
    if let Some(st) = status {
        q = q.bind(st);
    }

    let rows = q.fetch_all(pool).await?;
    let linked_map = load_linked_activities_map(pool, &user.id).await?;
    let aggs = project_aggregates(pool, &user.id).await?;

    Ok(rows
        .iter()
        .map(ProjectRow::from_row)
        .map(|p| {
            let acts = linked_map.get(&p.id).cloned().unwrap_or_default();
            let st = aggs.get(&p.id).copied().unwrap_or((0, 0));
            build_project_out(p, acts, st)
        })
        .collect())
}

pub async fn create_project(
    pool: &SqlitePool,
    user: &UserOut,
    payload: ProjectCreate,
) -> AppResult<ProjectOut> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::unprocessable("Project name cannot be empty", "invalid_name"));
    }
    validate_project_status(&payload.status)?;
    let start_d = parse_date(&payload.start_date)?;
    if let Some(ref end_s) = payload.end_date {
        let end_d = parse_date(end_s)?;
        if end_d < start_d {
            return Err(AppError::unprocessable(
                "end_date cannot be earlier than start_date",
                "invalid_project_dates",
            ));
        }
    }

    let dup: Option<String> = sqlx::query_scalar(
        "SELECT id FROM projects WHERE user_id = ? AND lower(name) = lower(?)",
    )
    .bind(&user.id)
    .bind(&name)
    .fetch_optional(pool)
    .await?;
    if dup.is_some() {
        return Err(AppError::conflict(
            format!("A project named '{name}' already exists"),
            "project_name_exists",
        ));
    }

    let linked = validate_activity_ids(pool, &user.id, &payload.activity_ids).await?;
    let id = Uuid::new_v4().to_string();
    let now = format_utc(Utc::now());
    let desc = payload
        .description
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO projects (id, user_id, name, description, color, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&name)
    .bind(&desc)
    .bind(&payload.color)
    .bind(&payload.start_date)
    .bind(&payload.end_date)
    .bind(&payload.status)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    for aid in linked {
        sqlx::query("INSERT INTO project_activities (project_id, activity_id) VALUES (?, ?)")
            .bind(&id)
            .bind(&aid)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    let created = get_project_or_404(pool, &user.id, &id).await?;
    let linked_map = load_linked_activities_map(pool, &user.id).await?;
    let acts = linked_map.get(&created.id).cloned().unwrap_or_default();
    Ok(build_project_out(created, acts, (0, 0)))
}

pub async fn update_project(
    pool: &SqlitePool,
    user: &UserOut,
    project_id: &str,
    payload: ProjectUpdate,
) -> AppResult<ProjectOut> {
    let mut proj = get_project_or_404(pool, &user.id, project_id).await?;

    if let Some(new_name) = payload.name {
        let trimmed = new_name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::unprocessable("Project name cannot be empty", "invalid_name"));
        }
        let dup: Option<String> = sqlx::query_scalar(
            "SELECT id FROM projects WHERE user_id = ? AND lower(name) = lower(?) AND id != ?",
        )
        .bind(&user.id)
        .bind(&trimmed)
        .bind(&proj.id)
        .fetch_optional(pool)
        .await?;
        if dup.is_some() {
            return Err(AppError::conflict(
                format!("A project named '{trimmed}' already exists"),
                "project_name_exists",
            ));
        }
        proj.name = trimmed;
    }

    let new_start_str = payload.start_date.unwrap_or_else(|| proj.start_date.clone());
    let new_start = parse_date(&new_start_str)?;
    let new_end_str = if payload.clear_end_date {
        None
    } else if let Some(ed) = payload.end_date {
        Some(ed)
    } else {
        proj.end_date.clone()
    };
    if let Some(ref ed_s) = new_end_str {
        let ed = parse_date(ed_s)?;
        if ed < new_start {
            return Err(AppError::unprocessable(
                "end_date cannot be earlier than start_date",
                "invalid_project_dates",
            ));
        }
    }

    proj.start_date = new_start_str;
    proj.end_date = new_end_str;

    if let Some(desc) = payload.description {
        let trimmed = desc.trim().to_string();
        proj.description = if trimmed.is_empty() { None } else { Some(trimmed) };
    }
    if let Some(color) = payload.color {
        proj.color = color;
    }
    if let Some(st) = payload.status {
        validate_project_status(&st)?;
        proj.status = st;
    }

    let linked_opt = match payload.activity_ids {
        Some(ids) => Some(validate_activity_ids(pool, &user.id, &ids).await?),
        None => None,
    };

    let now = format_utc(Utc::now());
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE projects
        SET name = ?, description = ?, color = ?, start_date = ?, end_date = ?, status = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(&proj.name)
    .bind(&proj.description)
    .bind(&proj.color)
    .bind(&proj.start_date)
    .bind(&proj.end_date)
    .bind(&proj.status)
    .bind(&now)
    .bind(&proj.id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await?;

    if let Some(linked) = linked_opt {
        sqlx::query("DELETE FROM project_activities WHERE project_id = ?")
            .bind(&proj.id)
            .execute(&mut *tx)
            .await?;
        for aid in linked {
            sqlx::query("INSERT INTO project_activities (project_id, activity_id) VALUES (?, ?)")
                .bind(&proj.id)
                .bind(&aid)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;

    let updated = get_project_or_404(pool, &user.id, &proj.id).await?;
    let linked_map = load_linked_activities_map(pool, &user.id).await?;
    let aggs = project_aggregates(pool, &user.id).await?;
    let acts = linked_map.get(&updated.id).cloned().unwrap_or_default();
    let st = aggs.get(&updated.id).copied().unwrap_or((0, 0));
    Ok(build_project_out(updated, acts, st))
}

pub async fn delete_project(
    pool: &SqlitePool,
    user: &UserOut,
    project_id: &str,
) -> AppResult<()> {
    let proj = get_project_or_404(pool, &user.id, project_id).await?;
    sqlx::query("DELETE FROM projects WHERE id = ? AND user_id = ?")
        .bind(&proj.id)
        .bind(&user.id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_project_stats(
    pool: &SqlitePool,
    user: &UserOut,
    project_id: &str,
    days: i64,
) -> AppResult<ProjectStatsOut> {
    let proj = get_project_or_404(pool, &user.id, project_id).await?;
    let linked_map = load_linked_activities_map(pool, &user.id).await?;
    let linked_acts = linked_map.get(&proj.id).cloned().unwrap_or_default();

    let sess_rows = sqlx::query(
        r#"
        SELECT s.id, s.activity_id, s.duration_seconds,
               a.name AS act_name, a.color AS act_color
        FROM time_sessions s
        JOIN activities a ON a.id = s.activity_id
        WHERE s.user_id = ? AND s.project_id = ? AND s.status = 'completed'
        ORDER BY s.started_at DESC
        "#,
    )
    .bind(&user.id)
    .bind(&proj.id)
    .fetch_all(pool)
    .await?;

    let mut total_seconds = 0_i64;
    let session_count = sess_rows.len() as i64;
    let mut act_secs: HashMap<String, i64> = HashMap::new();
    let mut act_counts: HashMap<String, i64> = HashMap::new();
    let mut act_meta: HashMap<String, (String, String)> = HashMap::new();

    for r in &sess_rows {
        let aid: String = r.get("activity_id");
        let dur: i64 = r.get("duration_seconds");
        total_seconds += dur;
        *act_secs.entry(aid.clone()).or_insert(0) += dur;
        *act_counts.entry(aid.clone()).or_insert(0) += 1;
        act_meta
            .entry(aid)
            .or_insert_with(|| (r.get("act_name"), r.get("act_color")));
    }

    let today_local = local_date_of(Utc::now(), &user.timezone)?;
    let start_day = today_local - Duration::days(days.max(1) - 1);
    let mut daily_secs: HashMap<NaiveDate, i64> = HashMap::new();
    let mut daily_sids: HashMap<NaiveDate, HashSet<String>> = HashMap::new();

    if session_count > 0 {
        let seg_rows = sqlx::query(
            r#"
            SELECT seg.session_id, seg.started_at, seg.ended_at
            FROM time_segments seg
            JOIN time_sessions s ON s.id = seg.session_id
            WHERE s.user_id = ? AND s.project_id = ? AND s.status = 'completed'
              AND seg.ended_at IS NOT NULL
            "#,
        )
        .bind(&user.id)
        .bind(&proj.id)
        .fetch_all(pool)
        .await?;

        for seg in seg_rows {
            let sid: String = seg.get("session_id");
            let st = parse_utc(&seg.get::<String, _>("started_at"))?;
            let en = parse_utc(&seg.get::<String, _>("ended_at"))?;
            for sl in split_interval_by_local_day(st, en, &user.timezone)? {
                if sl.local_date >= start_day && sl.local_date <= today_local {
                    *daily_secs.entry(sl.local_date).or_insert(0) += sl.seconds;
                    daily_sids.entry(sl.local_date).or_default().insert(sid.clone());
                }
            }
        }
    }

    let mut daily_activity = Vec::new();
    let mut cur = start_day;
    while cur <= today_local {
        daily_activity.push(DailySeriesPoint {
            date: format_date(cur),
            total_seconds: daily_secs.get(&cur).copied().unwrap_or(0),
            session_count: daily_sids.get(&cur).map(|s| s.len() as i64).unwrap_or(0),
        });
        cur += Duration::days(1);
    }

    let mut act_entries: Vec<(String, i64)> = act_secs.into_iter().collect();
    act_entries.sort_by(|a, b| b.1.cmp(&a.1));

    let activity_distribution = act_entries
        .into_iter()
        .map(|(aid, secs)| {
            let (name, color) = act_meta.remove(&aid).unwrap_or_default();
            let pct = if total_seconds > 0 {
                ((secs as f64 / total_seconds as f64) * 1000.0).round() / 10.0
            } else {
                0.0
            };
            DistributionItem {
                id: Some(aid.clone()),
                name,
                color,
                total_seconds: secs,
                percentage: pct,
                session_count: act_counts.get(&aid).copied().unwrap_or(0),
            }
        })
        .collect();

    let avg = if session_count > 0 {
        total_seconds / session_count
    } else {
        0
    };

    Ok(ProjectStatsOut {
        project: build_project_out(proj, linked_acts, (total_seconds, session_count)),
        total_seconds,
        session_count,
        average_session_seconds: avg,
        daily_activity,
        activity_distribution,
    })
}
