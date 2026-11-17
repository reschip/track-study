use std::collections::{HashMap, HashSet};

use chrono::{Duration, NaiveDate, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::db::format_utc;
use crate::error::{AppError, AppResult};
use crate::models::{
    ActivityCreate, ActivityOut, ActivityStatsOut, ActivityUpdate, DailySeriesPoint, ProjectBrief,
    UserOut,
};
use crate::time_utils::{format_date, local_date_of, parse_utc, split_interval_by_local_day};

#[derive(Debug, Clone)]
pub struct ActivityRow {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub category: String,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl ActivityRow {
    pub fn from_row(row: &sqlx::sqlite::SqliteRow) -> Self {
        Self {
            id: row.get("id"),
            user_id: row.get("user_id"),
            name: row.get("name"),
            description: row.get("description"),
            color: row.get("color"),
            category: row.get("category"),
            is_archived: row.get::<i64, _>("is_archived") != 0,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }

    pub fn into_out(self, stats: (i64, i64)) -> ActivityOut {
        ActivityOut {
            id: self.id,
            user_id: self.user_id,
            name: self.name,
            description: self.description,
            color: self.color,
            category: self.category,
            is_archived: self.is_archived,
            created_at: self.created_at,
            updated_at: self.updated_at,
            total_seconds: stats.0,
            session_count: stats.1,
        }
    }
}

pub async fn get_activity_or_404(
    pool: &SqlitePool,
    user_id: &str,
    activity_id: &str,
) -> AppResult<ActivityRow> {
    let row = sqlx::query(
        r#"
        SELECT id, user_id, name, description, color, category, is_archived, created_at, updated_at
        FROM activities
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(activity_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Activity not found"))?;

    Ok(ActivityRow::from_row(&row))
}

async fn activity_aggregates(
    pool: &SqlitePool,
    user_id: &str,
) -> AppResult<HashMap<String, (i64, i64)>> {
    let rows = sqlx::query(
        r#"
        SELECT activity_id,
               COALESCE(SUM(duration_seconds), 0) AS total_secs,
               COUNT(id) AS sess_count
        FROM time_sessions
        WHERE user_id = ? AND status = 'completed'
        GROUP BY activity_id
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut map = HashMap::new();
    for r in rows {
        let aid: String = r.get("activity_id");
        let secs: i64 = r.get("total_secs");
        let count: i64 = r.get("sess_count");
        map.insert(aid, (secs, count));
    }
    Ok(map)
}

fn validate_category(category: &str) -> AppResult<()> {
    if category != "professional" && category != "personal" {
        return Err(AppError::unprocessable(
            "category must be 'professional' or 'personal'",
            "invalid_category",
        ));
    }
    Ok(())
}

pub async fn list_activities(
    pool: &SqlitePool,
    user: &UserOut,
    include_archived: bool,
    category: Option<&str>,
) -> AppResult<Vec<ActivityOut>> {
    let mut sql = String::from(
        "SELECT id, user_id, name, description, color, category, is_archived, created_at, updated_at
         FROM activities WHERE user_id = ?",
    );
    if !include_archived {
        sql.push_str(" AND is_archived = 0");
    }
    if category.is_some() {
        sql.push_str(" AND category = ?");
    }
    sql.push_str(" ORDER BY is_archived ASC, category ASC, name ASC");

    let mut q = sqlx::query(&sql).bind(&user.id);
    if let Some(cat) = category {
        q = q.bind(cat);
    }

    let rows = q.fetch_all(pool).await?;
    let aggs = activity_aggregates(pool, &user.id).await?;

    Ok(rows
        .iter()
        .map(ActivityRow::from_row)
        .map(|a| {
            let st = aggs.get(&a.id).copied().unwrap_or((0, 0));
            a.into_out(st)
        })
        .collect())
}

pub async fn create_activity(
    pool: &SqlitePool,
    user: &UserOut,
    payload: ActivityCreate,
) -> AppResult<ActivityOut> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::unprocessable("Activity name cannot be empty", "invalid_name"));
    }
    validate_category(&payload.category)?;

    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM activities WHERE user_id = ? AND lower(name) = lower(?)",
    )
    .bind(&user.id)
    .bind(&name)
    .fetch_optional(pool)
    .await?;

    if existing.is_some() {
        return Err(AppError::conflict(
            format!("An activity named '{name}' already exists"),
            "activity_name_exists",
        ));
    }

    let id = Uuid::new_v4().to_string();
    let now = format_utc(Utc::now());
    let desc = payload
        .description
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    sqlx::query(
        r#"
        INSERT INTO activities (id, user_id, name, description, color, category, is_archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&name)
    .bind(&desc)
    .bind(&payload.color)
    .bind(&payload.category)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    let created = get_activity_or_404(pool, &user.id, &id).await?;
    Ok(created.into_out((0, 0)))
}

pub async fn update_activity(
    pool: &SqlitePool,
    user: &UserOut,
    activity_id: &str,
    payload: ActivityUpdate,
) -> AppResult<ActivityOut> {
    let mut act = get_activity_or_404(pool, &user.id, activity_id).await?;

    if let Some(new_name) = payload.name {
        let trimmed = new_name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::unprocessable("Activity name cannot be empty", "invalid_name"));
        }
        let dup: Option<String> = sqlx::query_scalar(
            "SELECT id FROM activities WHERE user_id = ? AND lower(name) = lower(?) AND id != ?",
        )
        .bind(&user.id)
        .bind(&trimmed)
        .bind(&act.id)
        .fetch_optional(pool)
        .await?;
        if dup.is_some() {
            return Err(AppError::conflict(
                format!("An activity named '{trimmed}' already exists"),
                "activity_name_exists",
            ));
        }
        act.name = trimmed;
    }

    if let Some(desc) = payload.description {
        let trimmed = desc.trim().to_string();
        act.description = if trimmed.is_empty() { None } else { Some(trimmed) };
    }
    if let Some(color) = payload.color {
        act.color = color;
    }
    if let Some(cat) = payload.category {
        validate_category(&cat)?;
        act.category = cat;
    }
    if let Some(arch) = payload.is_archived {
        act.is_archived = arch;
    }

    let now = format_utc(Utc::now());
    sqlx::query(
        r#"
        UPDATE activities
        SET name = ?, description = ?, color = ?, category = ?, is_archived = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(&act.name)
    .bind(&act.description)
    .bind(&act.color)
    .bind(&act.category)
    .bind(if act.is_archived { 1 } else { 0 })
    .bind(&now)
    .bind(&act.id)
    .bind(&user.id)
    .execute(pool)
    .await?;

    let updated = get_activity_or_404(pool, &user.id, &act.id).await?;
    let aggs = activity_aggregates(pool, &user.id).await?;
    let st = aggs.get(&updated.id).copied().unwrap_or((0, 0));
    Ok(updated.into_out(st))
}

pub async fn archive_activity(
    pool: &SqlitePool,
    user: &UserOut,
    activity_id: &str,
    archived: bool,
) -> AppResult<ActivityOut> {
    update_activity(
        pool,
        user,
        activity_id,
        ActivityUpdate {
            is_archived: Some(archived),
            ..Default::default()
        },
    )
    .await
}

pub async fn delete_activity(
    pool: &SqlitePool,
    user: &UserOut,
    activity_id: &str,
) -> AppResult<()> {
    let act = get_activity_or_404(pool, &user.id, activity_id).await?;
    let session_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM time_sessions WHERE user_id = ? AND activity_id = ?",
    )
    .bind(&user.id)
    .bind(&act.id)
    .fetch_one(pool)
    .await?;

    if session_count > 0 {
        return Err(AppError::conflict(
            format!(
                "Cannot delete '{}' because it has {} logged session(s). Archive it instead to preserve history.",
                act.name, session_count
            ),
            "activity_has_sessions",
        ));
    }

    sqlx::query("DELETE FROM activities WHERE id = ? AND user_id = ?")
        .bind(&act.id)
        .bind(&user.id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_activity_stats(
    pool: &SqlitePool,
    user: &UserOut,
    activity_id: &str,
    days: i64,
) -> AppResult<ActivityStatsOut> {
    let act = get_activity_or_404(pool, &user.id, activity_id).await?;

    let sess_rows = sqlx::query(
        r#"
        SELECT id, project_id, started_at, ended_at, duration_seconds
        FROM time_sessions
        WHERE user_id = ? AND activity_id = ? AND status = 'completed'
        ORDER BY started_at DESC
        "#,
    )
    .bind(&user.id)
    .bind(&act.id)
    .fetch_all(pool)
    .await?;

    let mut total_seconds = 0_i64;
    let session_count = sess_rows.len() as i64;
    let mut last_tracked_at: Option<String> = None;
    let mut project_ids: HashSet<String> = HashSet::new();
    let mut session_ids: Vec<String> = Vec::with_capacity(sess_rows.len());

    for (idx, r) in sess_rows.iter().enumerate() {
        let sid: String = r.get("id");
        let dur: i64 = r.get("duration_seconds");
        total_seconds += dur;
        session_ids.push(sid);
        if idx == 0 {
            let ended: Option<String> = r.get("ended_at");
            let started: String = r.get("started_at");
            last_tracked_at = ended.or(Some(started));
        }
        if let Some(pid) = r.get::<Option<String>, _>("project_id") {
            project_ids.insert(pid);
        }
    }

    let linked_pids: Vec<String> = sqlx::query_scalar(
        "SELECT project_id FROM project_activities WHERE activity_id = ?",
    )
    .bind(&act.id)
    .fetch_all(pool)
    .await?;
    for pid in linked_pids {
        project_ids.insert(pid);
    }

    let mut projects: Vec<ProjectBrief> = Vec::new();
    if !project_ids.is_empty() {
        let proj_rows = sqlx::query(
            "SELECT id, name, color, status FROM projects WHERE user_id = ? ORDER BY name ASC",
        )
        .bind(&user.id)
        .fetch_all(pool)
        .await?;
        for r in proj_rows {
            let id: String = r.get("id");
            if project_ids.contains(&id) {
                projects.push(ProjectBrief {
                    id,
                    name: r.get("name"),
                    color: r.get("color"),
                    status: r.get("status"),
                });
            }
        }
    }

    let avg_seconds = if session_count > 0 {
        total_seconds / session_count
    } else {
        0
    };

    let today_local = local_date_of(Utc::now(), &user.timezone)?;
    let span = days.max(1) - 1;
    let start_day = today_local - Duration::days(span);

    let mut daily_secs: HashMap<NaiveDate, i64> = HashMap::new();
    let mut daily_sids: HashMap<NaiveDate, HashSet<String>> = HashMap::new();

    if !session_ids.is_empty() {
        let seg_rows = sqlx::query(
            r#"
            SELECT seg.session_id, seg.started_at, seg.ended_at
            FROM time_segments seg
            JOIN time_sessions s ON s.id = seg.session_id
            WHERE s.user_id = ? AND s.activity_id = ? AND s.status = 'completed'
              AND seg.ended_at IS NOT NULL
            "#,
        )
        .bind(&user.id)
        .bind(&act.id)
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

    let mut daily_series = Vec::new();
    let mut cur = start_day;
    while cur <= today_local {
        daily_series.push(DailySeriesPoint {
            date: format_date(cur),
            total_seconds: daily_secs.get(&cur).copied().unwrap_or(0),
            session_count: daily_sids.get(&cur).map(|s| s.len() as i64).unwrap_or(0),
        });
        cur += Duration::days(1);
    }

    Ok(ActivityStatsOut {
        activity: act.into_out((total_seconds, session_count)),
        total_seconds,
        session_count,
        average_session_seconds: avg_seconds,
        last_tracked_at,
        projects,
        daily_series,
    })
}
